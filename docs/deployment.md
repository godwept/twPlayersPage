# Cloudflare deployment

The application deploys as one React/Vite static frontend and Worker API. D1 stores roster and photo metadata. The R2 bucket must remain private and use the Standard storage class. No production IDs, passwords, or real image files belong in Git.

## Create and bind resources

1. Sign in with `npx wrangler login` and confirm the account with `npx wrangler whoami`.
2. Create the D1 database with `npx wrangler d1 create timberwolves-gallery`. Copy its `database_id` into the `DB` binding in `wrangler.jsonc`. The database created for this workspace is already bound there.
3. Create the private R2 bucket with `npx wrangler r2 bucket create timberwolves-gallery-photos --storage-class Standard`.
4. Apply migrations locally with `npx wrangler d1 migrations apply DB --local`. Apply them to the Cloudflare database only when preparing the configured preview with `npx wrangler d1 migrations apply DB --remote`.

`wrangler.jsonc` contains the resource names and binding names. Wrangler generates Worker types from that file with `npx wrangler types src/worker-configuration.d.ts`.

## Set the administrator secret

Generate a random salted PBKDF2-SHA256 hash locally:

```sh
node scripts/generate-admin-password-hash.mjs
```

Copy the resulting `pbkdf2_sha256$...` value into `npx wrangler secret put ADMIN_PASSWORD_HASH`. The Worker expects exactly 100,000 PBKDF2-SHA256 iterations, as approved by the owner on 2026-09-28, and rejects other iteration counts or malformed hashes. Old 600,000-iteration secrets must be replaced using the updated generator. Never put the password or generated hash in `.dev.vars`, `wrangler.jsonc`, frontend code, or Git. Local tests inject a test-only hash at runtime; it is not a production credential.

Run `npx wrangler secret put ADMIN_PASSWORD_HASH` by itself, then paste the hash at its prompt. Do not use the hash as the secret name or put it inside a PowerShell double-quoted command: PowerShell interprets the `$` separators as variables.

Hosted Cloudflare Workers currently reject native Web Crypto PBKDF2 above 100,000 iterations, although local workerd accepts higher counts. The owner chose the 100,000-iteration native implementation to remain on Free after the 600,000-iteration JavaScript alternative exceeded the live CPU allowance. This explicit decision supersedes the original plan's hashing work factor constraint; no billing plan was changed. Unexpected cryptographic failures return 503 without recording a failed-password attempt; incorrect passwords return 401. Surrounding whitespace in a stored hash is ignored, but submitted passwords are preserved exactly.

## Verify before public launch

First run `npm run verify` and `npx wrangler deploy --dry-run`. Then use the actual Cloudflare account and its current plan to record all of these results before opening the public gallery:

- Secure password verification and successful login fit the account’s per-request CPU limit.
- Upload the largest representative supplied JPEG and confirm the source hash, original bytes, and display image on the actual Worker/R2 runtime.
- Upload the supplied collection, then download and validate a ZIP containing all 219 originals. Check names, membership, byte sizes, completion, CPU use, and that a missing source returns an error before ZIP headers are sent.
- Check the 219-photo flow against the account’s request/subrequest, R2 operation, and storage allowances.

Cloudflare currently documents 10 ms CPU per request on Workers Free and 30 seconds by default on Workers Paid (configurable up to 5 minutes). The maximum request body depends on the Cloudflare account plan; Free accounts currently allow 100 MB. These are platform limits, not a substitute for measuring the supplied source files and actual runtime. If authentication, uploads, or the complete ZIP fail on Free, keep the public launch blocked and obtain explicit approval before upgrading the Worker to Paid. Do not reduce password hashing, alter source JPEGs, or omit ZIP entries to pass the gate.

To keep original-photo uploads within the Free CPU budget, the authenticated admin browser calculates SHA-256 and CRC32 before upload and sends them as metadata. The Worker streams the request body straight to R2 without scanning and hashing every byte. Verify hashes against representative downloaded originals when validating a deployment; the Worker trusts checksum metadata from the authenticated admin client.

The initial Workers.dev preview was deployed on 2026-09-28. `/api/health` returned `{"ok":true}`, and an anonymous admin write returned 401. One invalid-password login returned 401 with 7 ms CPU time. This measures the PBKDF2 failure path only; successful login, a representative photo upload, and the complete 219-photo ZIP remain to be checked. Confirm the account plan before treating the 7 ms result as a Free-tier pass.

### Authentication diagnosis on 2026-09-28

The original verifier caught a hosted-runtime exception and returned `false`, so every password appeared incorrect. Wrangler Tail confirmed `NotSupportedError: Pbkdf2 failed: iteration counts above 100000 are not supported (requested 600000).` The secret was present, and the same hash/password format worked locally. Re-uploading the secret could not fix this runtime limit.

The compatible verifier passed regression checks against an independently generated Node PBKDF2 hash with the hosted native limit simulated. Live checks then showed:

| Check | HTTP result | CPU time | Runtime outcome |
| --- | --- | --- | --- |
| Original native operation with error reporting | 503 | 8 ms | Native iteration cap confirmed |
| Compatible verifier, incorrect password | 401 | 1,886 ms | Completed correctly |
| Compatible verifier, fresh correct password | 503 | 2,010 ms | `exceededCpu`: Worker exceeded CPU time limit |

The successful incorrect-password rejection was not a capacity pass: Cloudflare can allow temporary CPU overruns, and the subsequent correct-password attempt was terminated. The Worker settings API reported `usage_model: standard` with no explicit CPU limit; the OAuth session cannot read subscriptions (403), so billing status was not independently confirmed through the API.

### Upload CPU diagnosis and mitigation on 2026-09-28

Tail logs for original-photo PUTs repeatedly showed `exceededCpu` at 17–18 ms. Cloudflare documents a 10 ms CPU limit for Workers Free, confirming the cause. The Worker had been hashing SHA-256 and CRC32 while teeing the complete body to R2. The upload path now accepts browser-computed hashes from the authenticated admin, streams request bodies directly into R2, and records R2's resulting byte size. The browser still checks JPEG magic bytes before staging. Worker photo-publish tests, type check, build, and Cloudflare deploy passed; the next live upload should confirm the CPU reduction under the user's Free account.

The owner then explicitly instructed: "Just keep on the free, if we only get 100000 thats fine." The generator and verifier were updated to 100,000 iterations, the admin secret was replaced, and the following checks passed on the deployed Worker:

| Check | HTTP result | CPU time | Runtime outcome |
| --- | --- | --- | --- |
| Correct password | 200 | 30 ms | `ok`; protected session cookie issued |
| Authenticated session | 200 | 8 ms | `ok` |
| Logout | 200 | 2 ms | `ok` |
| Session replay after logout | 401 | 1 ms | `ok`; revoked session rejected |
| Incorrect password | 401 | 24 ms | `ok`; no session issued |

All 25 Worker tests, typechecking, and the production build pass. Login is functionally verified on the existing deployment, with no paid upgrade. The measured login CPU still exceeds the documented 10 ms Free allocation, so these successful requests do not establish sustained-load capacity; monitor for `exceededCpu` if use increases. The representative original upload and complete 219-image ZIP launch gates remain outstanding.

References: [Cloudflare's PBKDF2 cap](https://github.com/cloudflare/workerd/issues/1346), [CPU limits and temporary overrun allowance](https://developers.cloudflare.com/workers/platform/limits/#cpu-time), and [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/).

After the gates pass, build and deploy with Wrangler, verify that anonymous browsing works and anonymous admin mutations return 401, then configure the hostname. The deployed Worker’s `/api/health` endpoint returns `{"ok":true}`.
