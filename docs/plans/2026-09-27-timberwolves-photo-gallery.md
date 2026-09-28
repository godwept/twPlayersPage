# Miramichi Timberwolves Photo Gallery Implementation Plan

**Date:** 2026-09-27  
**Design doc:** `docs/specs/2026-09-27-timberwolves-photo-gallery-design.md`  
**Status:** Ready for review  
**Repository / target:** `godwept/twPlayersPage` / `main` after approval

## Overview

Implement the approved photography-first, black-and-white, mobile-responsive roster and per-player photo gallery using one Cloudflare Worker, its static React/Vite frontend, D1 metadata and a private R2 Standard bucket. Admin uploads and roster changes publish without code deployments. Individual and Download All downloads preserve exact source JPEGs; web browsing uses optimized derivatives. This document is a plan, **not authorization to implement**.

## Confirmed decisions and planning resolutions

**Owner update, 2026-09-28:** After live diagnostics confirmed the hosted 100,000-iteration native PBKDF2 cap and a CPU-limit failure with the 600,000-iteration JavaScript alternative, the owner explicitly chose to remain on Free and approved 100,000 iterations: "Just keep on the free, if we only get 100000 thats fine." This supersedes the hashing work factor restriction below for this deployment. Keep salted server-side verification, rate limiting, and protected sessions. The generator and verifier must use the same 100,000-iteration policy; see `docs/deployment.md` for the measured login results.

- One photo belongs to exactly one player; former players remain publicly listed. Explicit player deletion is **blocked while any associated photos remain**. Admin can reassign or permanently delete photos first; no silent cascade.
- Public galleries are open, continuous and newest-upload-first; original downloads are untouched. No game grouping, public user accounts, watermarks, recycle bin or additional site pages.
- Duplicate images use content hashes and require a per-photo **Keep or Skip** choice; accepted duplicates get independent storage keys.
- Select an existing gallery photo for a portrait roster card and save non-destructive crop/zoom/position; team hero photo and logo are admin-managed.
- **Free-first, Paid-ready:** implement one compatible codebase, attempt initial deployment on Workers Free, and test real login, original JPEG upload and 219-photo ZIP on the real Free runtime before opening the public site. A Paid upgrade is a user-approved deployment decision, not silently assumed. Never weaken security, alter originals, offer incomplete Download All or invent limits to stay on Free.
- Engineering stack selection for this plan: TypeScript, React + Vite SPA, Cloudflare Vite plugin and one Worker API (Hono or a thin existing route mechanism if scaffold provides one), D1 SQL migrations, R2 Standard storage, Vitest for unit/UI and current `@cloudflare/vitest-plugin` for Worker tests, React Testing Library, Playwright smoke tests, streaming store-mode ZIP. Optimized gallery JPEGs are made from the selected image in the authenticated browser before publication, leaving its original untouched.
- All dates and IDs are stored independently of player numbers. The real roster, 219 originals, banner, optional logo and Cloudflare credentials are provided at content/deployment time, never invented or added to git.

## Platform verification and stop gates

Cloudflare's current documentation supports a React/Vite SPA + Worker API deployed together: https://developers.cloudflare.com/workers/framework-guides/web-apps/react/ . Worker Free has a 10 ms CPU limit/request and 128 MB memory; account-plan request uploads on Free are capped at 100 MB: https://developers.cloudflare.com/workers/platform/limits/ . Local Worker testing should use the current Cloudflare Vitest plugin: https://developers.cloudflare.com/workers/testing/vitest-integration/ . R2 Standard has separate free storage/operation allowances: https://developers.cloudflare.com/r2/pricing/ . Recheck platform facts at deployment.

The following gates are **mandatory before launch**, not substitutes for fulfilling the design: (1) confirm secure password verification works within the actual deployed account's plan; (2) confirm actual source-image sizes and safe hashing/uploading on the Free runtime; (3) prove full 219-image ZIP delivery with representative source sizes and an error before headers if a source is missing. If any gate fails on Free, stop launch, document the measured cause and ask whether to upgrade to Paid. There is no automatic upgrade. Cloudflare image transformation billing is not required because optimized display JPEGs are generated locally in the admin browser and stored in R2.

## TDD and verification contract

Each task below is a separate **2–5 minute red/green/refactor unit**. Add the stated behavior test first, run the stated targeted command and observe red, then implement only that behavior and run it green. The first bootstrap task establishes the runner so its red result comes immediately after adding the smoke test. Do not batch across phases. Consecutive tasks touching the same subsystem may be implemented as one atomic TDD batch, pushing once and monitoring that GitHub Actions run to completion. Do not push a speculative implementation before the red test. Use `npm run test:unit -- <test path>`, `npm run test:ui -- <test path>`, and `npm run test:worker -- <test path>`; scripts are established in Phase 1. Re-run `npm run verify` at phase boundaries; inspect the diff and do not modify unrelated files. Use fake JPEG bytes/fixtures in repository tests, never real team photos or secrets.

## Tasks

### Phase 1 — Repository and test harness

#### Task 1: Establish the test-first application skeleton

**Files:** `package.json`, `package-lock.json`, `index.html`, `src/client/main.tsx`, `src/client/App.tsx`, `tests/ui/app-smoke.test.tsx`

**Test first (red):** Create a React Testing Library smoke test requiring a visible 'Miramichi Timberwolves' heading; run it and record the initial failure before creating the component.

**Implementation (green):** Initialize Vite + React + TypeScript with npm; implement only the heading and render entry; lock dependencies. Add scripts test:unit, test:ui, typecheck and build.

**Verify:** `npm run test:ui -- tests/ui/app-smoke.test.tsx; npm run typecheck; npm run build.`

#### Task 2: Configure browser test isolation

**Files:** `vitest.config.ts`, `tests/ui/setup.ts`, `tests/ui/app-smoke.test.tsx`

**Test first (red):** Extend the smoke test to assert a fresh render has no stale DOM from a prior test; observe missing setup.

**Implementation (green):** Configure jsdom, React Testing Library cleanup and jest-dom assertions; include tests/ui/** and tests/unit/** in the node-side project.

**Verify:** `npm run test:ui -- tests/ui/app-smoke.test.tsx.`

#### Task 3: Introduce a single Cloudflare Worker

**Files:** `wrangler.jsonc`, `vite.config.ts`, `worker/index.ts`, `tests/worker/health.test.ts`, `src/worker-configuration.d.ts`

**Test first (red):** Write an integration test for GET /api/health => JSON {ok:true}; first run fails for missing Worker.

**Implementation (green):** Use official @cloudflare/vite-plugin with one React SPA + Worker deployment, SPA asset fallback, /api routing, and bindings typed by wrangler types. Keep static assets in the one deployment.

**Verify:** `npm run test:worker -- tests/worker/health.test.ts; npm run build.`

#### Task 4: Enable Worker-runtime tests

**Files:** `vitest.worker.config.ts`, `tests/worker/setup.ts`, `package.json`, `tests/worker/health.test.ts`

**Test first (red):** Write a failing assertion that the health endpoint runs in workerd through the Worker fetch handler rather than a mocked Node route.

**Implementation (green):** Configure current @cloudflare/vitest-plugin (not retired vitest-pool-workers), local Miniflare D1/R2 bindings and migration setup. Expose npm run test:worker.

**Verify:** `npm run test:worker -- tests/worker/health.test.ts.`

#### Task 5: Add standard checks and ignore rules

**Files:** `.gitignore`, `package.json`, `tsconfig.json`, `tsconfig.node.json`, `tsconfig.app.json`, `tests/unit/config.test.ts`

**Test first (red):** Add a failing config test requiring scripts verify, test:unit, test:ui, test:worker, typecheck, build and .dev.vars exclusion.

**Implementation (green):** Add npm run verify chaining all tests/typecheck/build; exclude secrets, local state and build outputs from git. Never commit credentials.

**Verify:** `npm run verify; git status --short.`

#### Task 6: Add a non-deploying GitHub CI gate

**Files:** `.github/workflows/ci.yml`, `tests/unit/ci-config.test.ts`

**Test first (red):** Write a failing config test that CI checks npm ci, all tests, typecheck and build and contains no production deployment job.

**Implementation (green):** Add one minimal workflow for push/PR with npm cache; keep build/deploy credentials out of CI for now.

**Verify:** `npm run test:unit -- tests/unit/ci-config.test.ts; validate workflow syntax; npm run verify.`

### Phase 2 — Data model and persistence

#### Task 7: Create schema with permanent player IDs

**Files:** `migrations/0001_initial.sql`, `tests/worker/schema.test.ts`

**Test first (red):** In local D1, assert players table accepts two players sharing a jersey number and gives each distinct ID; fail on missing schema.

**Implementation (green):** Define players(id TEXT PK, first_name, last_name, jersey_number, featured_photo_id nullable, crop_x/y/zoom with safe defaults, created_at), no unique jersey constraint.

**Verify:** `npm run test:worker -- tests/worker/schema.test.ts.`

#### Task 8: Create photo schema and ownership

**Files:** `migrations/0001_initial.sql`, `tests/worker/schema.test.ts`

**Test first (red):** Assert photo requires exactly one existing player ID and stores original/display R2 keys, filename, SHA-256 and upload timestamp; reject invalid owner.

**Implementation (green):** Add photos table with FK and state active|deleting, unique object keys and index on (player_id, uploaded_at DESC, id DESC); no jersey-based ownership.

**Verify:** `npm run test:worker -- tests/worker/schema.test.ts.`

#### Task 9: Create session and login-throttle schema

**Files:** `migrations/0001_initial.sql`, `tests/worker/schema.test.ts`

**Test first (red):** Assert sessions store only token hashes and expiry, and login attempts can be counted by opaque IP-key/window.

**Implementation (green):** Add sessions and login_attempts tables/indexes. No raw session token or admin password columns.

**Verify:** `npm run test:worker -- tests/worker/schema.test.ts.`

#### Task 10: Create site artwork schema

**Files:** `migrations/0001_initial.sql`, `tests/worker/schema.test.ts`

**Test first (red):** Assert a singleton site-settings record accepts nullable banner/logo object keys and banner position.

**Implementation (green):** Add site_settings singleton row; no asset is required to render a valid initial site.

**Verify:** `npm run test:worker -- tests/worker/schema.test.ts.`

#### Task 11: Add seed-free migration bootstrap

**Files:** `tests/worker/setup.ts`, `tests/worker/migrations.test.ts`, `wrangler.jsonc`

**Test first (red):** Write a test that applies the initial migration to an empty database and never inserts fictional player records.

**Implementation (green):** Use readD1Migrations/applyD1Migrations in the current Cloudflare Vitest plugin recipe; bind DB and a private Standard-class R2 bucket locally.

**Verify:** `npm run test:worker -- tests/worker/migrations.test.ts.`

#### Task 12: Implement player repository creation

**Files:** `worker/repos/players.ts`, `tests/worker/players-repo.test.ts`

**Test first (red):** Assert addPlayer persists a unique ID, names and a jersey number, including a number already held by another player.

**Implementation (green):** Use parameter-bound D1 INSERT and generated UUID; trim/validate nonempty names and reasonable number input without treating jersey number as identity.

**Verify:** `npm run test:worker -- tests/worker/players-repo.test.ts.`

#### Task 13: Implement player lookup and edits

**Files:** `worker/repos/players.ts`, `tests/worker/players-repo.test.ts`

**Test first (red):** Assert list returns all players and update modifies only the selected permanent ID; unknown ID produces not-found.

**Implementation (green):** Use bound SELECT/UPDATE queries; stable roster ordering by jersey number, surname, ID; reject invalid input.

**Verify:** `npm run test:worker -- tests/worker/players-repo.test.ts.`

#### Task 14: Block deleting players with photos

**Files:** `worker/repos/players.ts`, `tests/worker/players-repo.test.ts`

**Test first (red):** Assert removePlayer yields conflict if even one photo remains, and deletes only a photo-free player; departure never auto-deletes.

**Implementation (green):** Perform count and guarded DELETE in a DB transaction/conditional statement; return 409 on conflict. Photos may first be reassigned or explicitly deleted.

**Verify:** `npm run test:worker -- tests/worker/players-repo.test.ts.`

### Phase 3 — Password-protected administration

#### Task 15: Verify a salted administrator password

**Files:** `worker/auth/password.ts`, `tests/worker/password.test.ts`

**Test first (red):** Test correct/wrong passwords against a versioned PBKDF2-SHA256 salt+iteration+hash format and reject malformed hash before writing verification code.

**Implementation (green):** Use Web Crypto constant-time digest comparison; receive ADMIN_PASSWORD_HASH from a Worker secret, never plaintext in repo/front end. Record hash-generation instructions separately.

**Verify:** `npm run test:worker -- tests/worker/password.test.ts.`

#### Task 16: Issue and validate opaque sessions

**Files:** `worker/auth/session.ts`, `tests/worker/session.test.ts`

**Test first (red):** Assert login creates a random 256-bit cookie token, DB stores only its SHA-256 hash, and expired/unknown token is invalid.

**Implementation (green):** Add HttpOnly, Secure, SameSite=Strict, Path=/ cookie; lookup hashed token in D1 and check expiry on every admin request.

**Verify:** `npm run test:worker -- tests/worker/session.test.ts.`

#### Task 17: Revoke a session on logout

**Files:** `worker/auth/session.ts`, `tests/worker/session.test.ts`

**Test first (red):** Assert revocation removes the stored token hash and sends an expiring cookie; replay of prior token fails.

**Implementation (green):** Implement targeted DB delete and clear-cookie response; do not need a multi-user account system.

**Verify:** `npm run test:worker -- tests/worker/session.test.ts.`

#### Task 18: Rate-limit password attempts

**Files:** `worker/auth/login-limit.ts`, `tests/worker/login-limit.test.ts`

**Test first (red):** Assert repeated wrong attempts are throttled within a bounded window and an attempt from a different visitor is independently counted.

**Implementation (green):** Use D1 short-lived attempt windows keyed by a salted/hash-derived address key; retain no raw addresses; return 429 without exposing whether credentials were correct.

**Verify:** `npm run test:worker -- tests/worker/login-limit.test.ts.`

#### Task 19: Expose admin login endpoint

**Files:** `worker/routes/admin-auth.ts`, `worker/index.ts`, `tests/worker/admin-auth.test.ts`

**Test first (red):** POST /api/admin/login rejects invalid password, accepts valid password with protected cookie, and does not echo secrets; start red.

**Implementation (green):** Wire password verification, throttle and session creation. Use JSON failure responses and no client-side authentication-only enforcement.

**Verify:** `npm run test:worker -- tests/worker/admin-auth.test.ts.`

#### Task 20: Expose session status and logout

**Files:** `worker/routes/admin-auth.ts`, `worker/index.ts`, `tests/worker/admin-auth.test.ts`

**Test first (red):** Unauthenticated GET /api/admin/session returns 401; authenticated returns {authenticated:true}; POST logout invalidates the cookie.

**Implementation (green):** Add session-status/logout routes; do not expose token or password hash in JSON.

**Verify:** `npm run test:worker -- tests/worker/admin-auth.test.ts.`

#### Task 21: Protect every administrative mutation

**Files:** `worker/auth/guard.ts`, `worker/index.ts`, `tests/worker/admin-guard.test.ts`

**Test first (red):** Test anonymous POST/PATCH/DELETE under /api/admin/** returns 401 before storage changes; authenticated calls proceed.

**Implementation (green):** Implement a common middleware for session authorization, including routes added later. Explicitly keep public routes open.

**Verify:** `npm run test:worker -- tests/worker/admin-guard.test.ts.`

#### Task 22: Guard cookie-authenticated writes against CSRF

**Files:** `worker/auth/guard.ts`, `tests/worker/admin-guard.test.ts`

**Test first (red):** Assert cross-origin modifying requests and unexpected content types are rejected, even with an otherwise valid session; safe same-origin requests pass.

**Implementation (green):** Check Origin against request origin for writes, enforce allowed types, retain Strict cookie and Secure transport; apply guard to logout as well.

**Verify:** `npm run test:worker -- tests/worker/admin-guard.test.ts.`

#### Task 23: Verify free-tier authentication feasibility

**Files:** `tests/worker/auth-budget.test.ts`, `docs/deployment.md`

**Test first (red):** Measure valid login and realistic PBKDF2 cost in workerd and deployed Free trial; do not weaken hashing to chase the 10 ms CPU limit.

**Implementation (green):** Record benchmark procedure/outcome and deployment gate: if secure login exceeds Free resources, paid upgrade requires user approval before public launch.

**Verify:** `npm run test:worker -- tests/worker/auth-budget.test.ts; document real Cloudflare outcome (not inferred from local mocks).`

### Phase 4 — Public read and original download endpoints

#### Task 24: Publish roster data

**Files:** `worker/routes/public.ts`, `worker/index.ts`, `tests/worker/public-roster.test.ts`

**Test first (red):** GET /api/players returns name, jersey, ID and featured-image metadata without login, including former players and an empty-gallery placeholder state.

**Implementation (green):** Query players repository; expose safe public DTO, not internal storage keys or session details.

**Verify:** `npm run test:worker -- tests/worker/public-roster.test.ts.`

#### Task 25: Find an individual player

**Files:** `worker/routes/public.ts`, `tests/worker/public-roster.test.ts`

**Test first (red):** GET /api/players/:id resolves by permanent ID, and unknown ID is 404 (not a different player sharing a jersey).

**Implementation (green):** Add one public player-detail endpoint returning name/number/featured crop and gallery count.

**Verify:** `npm run test:worker -- tests/worker/public-roster.test.ts.`

#### Task 26: List only active photos for one player

**Files:** `worker/repos/photos.ts`, `tests/worker/photos-repo.test.ts`

**Test first (red):** Seed two players and deleting photo: listing player A returns only A's active photos in upload-date/id descending order.

**Implementation (green):** Implement parameterized player-scoped query and stable tie-breaker; never infer ownership by filename.

**Verify:** `npm run test:worker -- tests/worker/photos-repo.test.ts.`

#### Task 27: Add cursor-based gallery pagination

**Files:** `worker/repos/photos.ts`, `worker/routes/public.ts`, `tests/worker/public-gallery.test.ts`

**Test first (red):** Request successive pages and assert no duplicates/missing photos with tied timestamps and bounded response size.

**Implementation (green):** GET /api/players/:id/photos?cursor=... uses opaque timestamp+ID cursor and a fixed page cap; 400 for malformed cursor.

**Verify:** `npm run test:worker -- tests/worker/public-gallery.test.ts.`

#### Task 28: Serve optimized gallery JPEGs

**Files:** `worker/routes/public.ts`, `tests/worker/public-image.test.ts`

**Test first (red):** GET /api/photos/:id/display returns optimized bytes and image/jpeg for active photo; unknown/deleting/missing R2 object fails clearly.

**Implementation (green):** Stream display object from private R2 via Worker, set appropriate cache headers; never pull original just to serve a thumbnail.

**Verify:** `npm run test:worker -- tests/worker/public-image.test.ts.`

#### Task 29: Serve original photo downloads verbatim

**Files:** `worker/routes/public.ts`, `tests/worker/public-image.test.ts`

**Test first (red):** GET /api/photos/:id/download returns identical original bytes and attachment filename, despite independent display image; another player cannot affect selection.

**Implementation (green):** Stream original R2 object without decoding/recompression/watermarking; sanitize Content-Disposition filename, return non-success when object absent.

**Verify:** `npm run test:worker -- tests/worker/public-image.test.ts.`

#### Task 30: Expose hero and logo information

**Files:** `worker/routes/public.ts`, `tests/worker/site-settings.test.ts`

**Test first (red):** GET /api/site returns nullable banner/logo URLs and banner positioning; blank settings still produce usable defaults.

**Implementation (green):** Read singleton site_settings and expose safe public asset endpoints via Worker, retaining private R2 bucket.

**Verify:** `npm run test:worker -- tests/worker/site-settings.test.ts.`

### Phase 5 — Filename matching and safe photograph management

#### Task 31: Parse the existing filename convention

**Files:** `worker/lib/filename.ts`, `tests/unit/filename.test.ts`

**Test first (red):** Assert '1 - Montoya1.jpg' => jersey 1/surname Montoya/sequence 1, '4 - Chapdelaine2.jpg' => 4/Chapdelaine/2; malformed names return unmatched.

**Implementation (green):** Implement anchored filename parser accepting case-insensitive .jpg/.jpeg and surrounding whitespace; keep the original filename separately.

**Verify:** `npm run test:unit -- tests/unit/filename.test.ts.`

#### Task 32: Match a filename against permanent player records

**Files:** `worker/lib/match-player.ts`, `tests/unit/match-player.test.ts`

**Test first (red):** Assert number+normalized surname matches uniquely, repeated jersey with differing surnames resolves, and duplicated exact identities/unknowns produce ambiguity.

**Implementation (green):** Use both extracted number and surname; never select by number alone or silently assign an ambiguous record.

**Verify:** `npm run test:unit -- tests/unit/match-player.test.ts.`

#### Task 33: Compute content-based duplicate identities

**Files:** `src/client/lib/hash.ts`, `tests/ui/hash.test.ts`

**Test first (red):** Two distinct filenames with identical JPEG bytes get the same SHA-256; different bytes differ; same-batch duplicates are flagged.

**Implementation (green):** Use browser WebCrypto digest over the actual selected File bytes; keep hash independent of filename and player.

**Verify:** `npm run test:ui -- tests/ui/hash.test.ts.`

#### Task 34: Review duplicate hashes against stored photos

**Files:** `worker/repos/photos.ts`, `worker/routes/admin-photos.ts`, `tests/worker/duplicates.test.ts`

**Test first (red):** Authenticated POST /api/admin/photos/duplicates returns existing photo references for supplied hashes, with no public write access.

**Implementation (green):** Use a bounded parameterized SELECT by SHA-256; client also detects duplicates within its current batch before the request.

**Verify:** `npm run test:worker -- tests/worker/duplicates.test.ts.`

#### Task 35: Generate optimized JPEG in the browser

**Files:** `src/client/lib/preview-image.ts`, `tests/ui/preview-image.test.ts`

**Test first (red):** Given a mock large JPEG, derivative has bounded dimensions, JPEG MIME and original File bytes remain unchanged.

**Implementation (green):** Use canvas/createImageBitmap with sequential processing and resource cleanup; generate one display JPEG per original, independent of card crop metadata.

**Verify:** `npm run test:ui -- tests/ui/preview-image.test.ts.`

#### Task 36: Validate per-photo publication request

**Files:** `worker/lib/validate-upload.ts`, `tests/worker/validate-upload.test.ts`

**Test first (red):** Reject non-JPEG content, missing/unknown player, absent original or optimized JPEG, and invalid duplicate decision before writing R2.

**Implementation (green):** Validate file MIME/signature, fields and object sizes against current account request/Worker memory limits; do not invent a silent arbitrary limit.

**Verify:** `npm run test:worker -- tests/worker/validate-upload.test.ts.`

#### Task 37: Choose distinct R2 keys for retained duplicates

**Files:** `worker/lib/photo-keys.ts`, `tests/unit/photo-keys.test.ts`

**Test first (red):** Two accepted identical content hashes produce distinct original/display keys; deleting either never addresses the other's object.

**Implementation (green):** Generate immutable object keys from unique photo UUID with original and display suffixes; keep source filename as metadata.

**Verify:** `npm run test:unit -- tests/unit/photo-keys.test.ts.`

#### Task 38: Persist one photo without dangling metadata

**Files:** `worker/services/publish-photo.ts`, `tests/worker/publish-photo.test.ts`

**Test first (red):** Simulate R2 original success/display failure: no public DB row; simulate DB failure: uploaded objects are removed or failure reported for retry.

**Implementation (green):** Write both R2 objects then active D1 metadata, compensate partial writes; return success only when all operations complete.

**Verify:** `npm run test:worker -- tests/worker/publish-photo.test.ts.`

#### Task 39: Verify uploaded content hash at publication

**Files:** `worker/services/publish-photo.ts`, `tests/worker/publish-photo.test.ts`

**Test first (red):** Deliberately send bytes inconsistent with declared SHA-256; publication must reject them without an active row.

**Implementation (green):** Recompute/verify original SHA-256 server-side before committing and recheck existing hashes to catch concurrent imports; measure memory/CPU impact as Free-tier gate.

**Verify:** `npm run test:worker -- tests/worker/publish-photo.test.ts.`

#### Task 40: Implement Keep/Skip duplicate publication

**Files:** `worker/services/publish-photo.ts`, `tests/worker/publish-photo.test.ts`

**Test first (red):** Existing/batch-equivalent image with Skip makes no new row; Keep publishes a separately keyed new record; undecided duplicate cannot publish.

**Implementation (green):** Apply explicit duplicate choice, rechecking D1 on publish; preserve one-player ownership.

**Verify:** `npm run test:worker -- tests/worker/publish-photo.test.ts.`

#### Task 41: Expose protected photo publish endpoint

**Files:** `worker/routes/admin-photos.ts`, `worker/index.ts`, `tests/worker/admin-photos.test.ts`

**Test first (red):** Anonymous POST /api/admin/photos is 401; authenticated one-photo multipart request publishes owner and exact original+derivative.

**Implementation (green):** Accept one photo per request for isolated retry/reporting, call validation/publish service, return photo ID or structured failure.

**Verify:** `npm run test:worker -- tests/worker/admin-photos.test.ts.`

#### Task 42: Implement admin photo reassignment

**Files:** `worker/routes/admin-photos.ts`, `worker/repos/photos.ts`, `tests/worker/admin-photos.test.ts`

**Test first (red):** Authenticated PATCH /api/admin/photos/:id/player changes exactly one owning player; unknown new player is rejected.

**Implementation (green):** Update player_id by photo ID only and reject deletion-in-progress entries; this permits clearing a player before removal.

**Verify:** `npm run test:worker -- tests/worker/admin-photos.test.ts.`

#### Task 43: Implement idempotent permanent photo deletion

**Files:** `worker/services/delete-photo.ts`, `tests/worker/delete-photo.test.ts`

**Test first (red):** Confirm deleting both R2 files and D1 record succeeds; simulate one R2 failure and assert no false success, visible retryable deleting state.

**Implementation (green):** Mark photo deleting/hidden first, clear featured references, attempt original/display object removal, then delete row; retry missing-object removals safely.

**Verify:** `npm run test:worker -- tests/worker/delete-photo.test.ts.`

#### Task 44: Expose confirmation-backed deletion route

**Files:** `worker/routes/admin-photos.ts`, `worker/index.ts`, `tests/worker/admin-photos.test.ts`

**Test first (red):** Anonymous DELETE is 401; authorized DELETE /api/admin/photos/:id permanently removes; a retry after partial deletion can complete.

**Implementation (green):** Route through deletion service; return proper error/status on incomplete removal, no recycle-bin behavior.

**Verify:** `npm run test:worker -- tests/worker/admin-photos.test.ts.`

#### Task 45: Verify free-tier upload capacity

**Files:** `tests/worker/upload-budget.test.ts`, `docs/deployment.md`

**Test first (red):** Run representative large JPEG publish/digest/thumbnail requests with Free trial and record CPU, request-size and memory failures rather than marking smoke test green.

**Implementation (green):** Document actionable limit and show oversized upload failures before sending; if genuine source photos cannot be handled securely under Free, request upgrade approval, do not reduce photo quality silently.

**Verify:** `npm run test:worker -- tests/worker/upload-budget.test.ts; document observed deployed trial outcome.`

### Phase 6 — Public mobile-first experience

#### Task 46: Build the black-and-white responsive shell

**Files:** `src/client/App.tsx`, `src/client/styles.css`, `tests/ui/shell.test.tsx`

**Test first (red):** Assert branding, semantic main landmark and mobile-safe navigation render with no team assets provided.

**Implementation (green):** Implement minimal global dark palette, typography, content width and responsive shell; no extra features.

**Verify:** `npm run test:ui -- tests/ui/shell.test.tsx; npm run build.`

#### Task 47: Add two public routes and private admin route

**Files:** `src/client/App.tsx`, `src/client/routes.tsx`, `tests/ui/routes.test.tsx`

**Test first (red):** Assert / shows roster, /players/:id shows gallery, /admin shows admin login, and navigation preserves back to roster.

**Implementation (green):** Use React Router SPA routing; unknown player page shows not-found, not wrong player.

**Verify:** `npm run test:ui -- tests/ui/routes.test.tsx.`

#### Task 48: Render team banner and logo fallbacks

**Files:** `src/client/components/TeamHero.tsx`, `tests/ui/team-hero.test.tsx`

**Test first (red):** Assert supplied banner uses dark text-legibility gradient and positioning, absent banner/logo shows coherent branded fallback.

**Implementation (green):** Implement responsive hero with configurable object-position from public site settings; preserve source asset.

**Verify:** `npm run test:ui -- tests/ui/team-hero.test.tsx.`

#### Task 49: Render the roster-card grid

**Files:** `src/client/pages/RosterPage.tsx`, `src/client/components/PlayerCard.tsx`, `tests/ui/roster.test.tsx`

**Test first (red):** Assert player name/number, selected photo and crop transform render; empty gallery shows name/number placeholder.

**Implementation (green):** Fetch /api/players; use responsive portrait cards and links by permanent ID, displaying all players including former ones.

**Verify:** `npm run test:ui -- tests/ui/roster.test.tsx.`

#### Task 50: Add roster search

**Files:** `src/client/pages/RosterPage.tsx`, `tests/ui/roster.test.tsx`

**Test first (red):** Search matches surname, first name and jersey number, handles mixed case and gives an empty-result message.

**Implementation (green):** Client-filter the fetched roster; no server search framework needed.

**Verify:** `npm run test:ui -- tests/ui/roster.test.tsx.`

#### Task 51: Render player header and gallery empty state

**Files:** `src/client/pages/PlayerPage.tsx`, `tests/ui/player-page.test.tsx`

**Test first (red):** Assert correct player name/number, back link and empty-gallery message; Download All disabled for zero photos.

**Implementation (green):** Fetch player by permanent ID, render header and empty/loading/error states.

**Verify:** `npm run test:ui -- tests/ui/player-page.test.tsx.`

#### Task 52: Render a progressive gallery grid

**Files:** `src/client/components/PhotoGrid.tsx`, `src/client/pages/PlayerPage.tsx`, `tests/ui/photo-grid.test.tsx`

**Test first (red):** Assert grid uses display URLs with lazy loading and loads next cursor page on explicit scroll/intersection event without duplication.

**Implementation (green):** Implement responsive grid and pagination with modest page size; originals are never auto-requested during browsing.

**Verify:** `npm run test:ui -- tests/ui/photo-grid.test.tsx.`

#### Task 53: Add accessible full-screen viewer

**Files:** `src/client/components/Lightbox.tsx`, `tests/ui/lightbox.test.tsx`

**Test first (red):** Assert tap opens selected image, next/previous controls and Escape close work; focus returns to triggering thumbnail.

**Implementation (green):** Implement keyboard/touch navigation, visible close control and scroll lock; show display JPEG, not original.

**Verify:** `npm run test:ui -- tests/ui/lightbox.test.tsx.`

#### Task 54: Expose individual original download controls

**Files:** `src/client/components/Lightbox.tsx`, `src/client/components/PhotoGrid.tsx`, `tests/ui/download-link.test.tsx`

**Test first (red):** Assert individual photo download points to /api/photos/:id/download, not thumbnail; handle a failed download visibly.

**Implementation (green):** Add attachment links/buttons accessible on desktop and touch; preserve public access.

**Verify:** `npm run test:ui -- tests/ui/download-link.test.tsx.`

#### Task 55: Check mobile and desktop layouts

**Files:** `tests/ui/responsive.test.tsx`, `src/client/styles.css`

**Test first (red):** At narrow and wide viewport tests assert reachable player controls, no fixed-width overflow and usable viewer controls.

**Implementation (green):** Adjust responsive CSS and touch targets only to meet tests; conduct manual device/emulator verification alongside DOM checks.

**Verify:** `npm run test:ui -- tests/ui/responsive.test.tsx; npm run build.`

### Phase 7 — Photographer dashboard

#### Task 56: Implement the login form

**Files:** `src/client/pages/AdminLogin.tsx`, `tests/ui/admin-login.test.tsx`

**Test first (red):** Assert submitting a password calls admin login, error text appears for 401/429, and password is not stored persistently in browser.

**Implementation (green):** Build minimal password form and session-cookie fetch with credentials; avoid localStorage/sessionStorage credentials.

**Verify:** `npm run test:ui -- tests/ui/admin-login.test.tsx.`

#### Task 57: Gate and navigate admin sections

**Files:** `src/client/pages/AdminDashboard.tsx`, `src/client/routes.tsx`, `tests/ui/admin-dashboard.test.tsx`

**Test first (red):** Unauthenticated session redirects to login; authenticated sees Manage Photos, Manage Players, Website Appearance and logout.

**Implementation (green):** Use /api/admin/session on entry and logout route; server remains authority for every operation.

**Verify:** `npm run test:ui -- tests/ui/admin-dashboard.test.tsx.`

#### Task 58: Manage roster in the dashboard

**Files:** `src/client/components/ManagePlayers.tsx`, `tests/ui/manage-players.test.tsx`

**Test first (red):** Add and edit player names/numbers and show same-number players separately; empty-field error visible.

**Implementation (green):** Connect forms to protected CRUD endpoints; refresh roster after success.

**Verify:** `npm run test:ui -- tests/ui/manage-players.test.tsx.`

#### Task 59: Expose protected player CRUD endpoints

**Files:** `worker/routes/admin-players.ts`, `worker/index.ts`, `tests/worker/admin-players.test.ts`

**Test first (red):** Test create/edit/remove, 401 without session, and 409 when a player still owns photographs.

**Implementation (green):** Wire existing player repository through authenticated routes, typed validation and stable IDs.

**Verify:** `npm run test:worker -- tests/worker/admin-players.test.ts.`

#### Task 60: Surface blocked player removal

**Files:** `src/client/components/ManagePlayers.tsx`, `tests/ui/manage-players.test.tsx`

**Test first (red):** Attempt removing player with photos: confirmation precedes request, 409 explains to delete/reassign images, no disappearance from UI.

**Implementation (green):** Display explicit warning and refresh after valid removal; never auto-delete attached images.

**Verify:** `npm run test:ui -- tests/ui/manage-players.test.tsx.`

#### Task 61: Select and crop a roster card photo

**Files:** `src/client/components/FeaturedCropEditor.tsx`, `tests/ui/featured-crop.test.tsx`

**Test first (red):** Assert gallery image selection, position drag and zoom produce reversible preview values without changing original photo bytes.

**Implementation (green):** Implement simple portrait viewport with normalized x/y and scale fields; use one gallery photo and no dedicated portrait upload.

**Verify:** `npm run test:ui -- tests/ui/featured-crop.test.tsx.`

#### Task 62: Persist featured selection and crop

**Files:** `worker/routes/admin-players.ts`, `worker/repos/players.ts`, `tests/worker/featured-crop.test.ts`

**Test first (red):** Reject featured photo owned by another player; save valid photo ID/crop and fall back if featured photo was deleted.

**Implementation (green):** PATCH player featured_photo_id/crop fields via guarded route; validate finite bounded crop values.

**Verify:** `npm run test:worker -- tests/worker/featured-crop.test.ts.`

#### Task 63: Stage files and infer player assignments

**Files:** `src/client/components/PhotoUploader.tsx`, `tests/ui/photo-uploader.test.tsx`

**Test first (red):** Select/drop a batch with known and unknown filenames; show matched player and editable selector before any publish request.

**Implementation (green):** Combine filename parser, loaded roster and per-file original+derivative preparation; allow direct-player upload mode.

**Verify:** `npm run test:ui -- tests/ui/photo-uploader.test.tsx.`

#### Task 64: Review and resolve duplicates

**Files:** `src/client/components/PhotoUploader.tsx`, `tests/ui/photo-uploader.test.tsx`

**Test first (red):** Duplicate within batch or on server requires Keep or Skip per item; publishing remains unavailable for undecided duplicates.

**Implementation (green):** Hash each selected original, consult protected duplicates route and display explicit review controls; maintain original File references.

**Verify:** `npm run test:ui -- tests/ui/photo-uploader.test.tsx.`

#### Task 65: Publish staged uploads and report failures

**Files:** `src/client/components/PhotoUploader.tsx`, `tests/ui/photo-uploader.test.tsx`

**Test first (red):** A three-photo batch can yield two published and one failed with accurate per-file feedback and retry; unknown player cannot publish.

**Implementation (green):** Send one validated file at a time to POST /api/admin/photos; preserve successes and allow failed-only retries.

**Verify:** `npm run test:ui -- tests/ui/photo-uploader.test.tsx.`

#### Task 66: Manage existing photos and reassignment

**Files:** `src/client/components/ManagePhotos.tsx`, `tests/ui/manage-photos.test.tsx`

**Test first (red):** Assert changing a photo owner moves it between galleries; delete requires confirmation and reports incomplete deletion honestly.

**Implementation (green):** Build per-player admin photo list with reassignment selector, delete and retry-delete controls; do not add a recycle bin.

**Verify:** `npm run test:ui -- tests/ui/manage-photos.test.tsx.`

#### Task 67: Manage team banner and logo uploads

**Files:** `worker/routes/admin-site.ts`, `worker/index.ts`, `tests/worker/admin-site.test.ts`

**Test first (red):** Anonymous requests cannot update site; valid JPEG banner and optional logo can be replaced; failure retains prior published asset.

**Implementation (green):** Store uniquely keyed artwork in R2, validate content, update singleton D1 metadata only after upload and clean previous object after successful switch.

**Verify:** `npm run test:worker -- tests/worker/admin-site.test.ts.`

#### Task 68: Preview and position banner in dashboard

**Files:** `src/client/components/ManageAppearance.tsx`, `tests/ui/manage-appearance.test.tsx`

**Test first (red):** Assert banner/optional logo replacement preview, normalized positioning and persistent API update; original bytes untouched.

**Implementation (green):** Provide image selection/position UI linked to admin site routes, with a branded fallback when none exists.

**Verify:** `npm run test:ui -- tests/ui/manage-appearance.test.tsx.`

### Phase 8 — Full-resolution ZIP delivery

#### Task 69: Prove streaming ZIP implementation in workerd

**Files:** `worker/lib/zip-stream.ts`, `tests/worker/zip-stream.test.ts`

**Test first (red):** Assemble two fake JPEG streams and unzip result, asserting exact byte equality and names; include a stream that exceeds trivial buffer sizes.

**Implementation (green):** Implement streaming ZIP in STORE/no-recompression mode using Worker-compatible ZIP primitives/library, with backpressure and no in-memory concatenation of all originals.

**Verify:** `npm run test:worker -- tests/worker/zip-stream.test.ts.`

#### Task 70: Guard ZIP before successful response headers

**Files:** `worker/services/download-gallery.ts`, `tests/worker/download-gallery.test.ts`

**Test first (red):** If any expected original object is missing at preflight, return non-success before a ZIP response; duplicate original filenames get unique safe archive entries.

**Implementation (green):** Fetch only selected player's active metadata and preflight R2 objects; generate safe entry filenames; stream object reads into ZIP, and propagate mid-stream failure as failed transfer.

**Verify:** `npm run test:worker -- tests/worker/download-gallery.test.ts.`

#### Task 71: Expose public Download All endpoint

**Files:** `worker/routes/public.ts`, `tests/worker/download-all.test.ts`

**Test first (red):** GET /api/players/:id/download-all returns a valid original-byte ZIP of that player alone; empty gallery returns defined non-success and missing player 404.

**Implementation (green):** Attach streamed ZIP with attachment Content-Disposition; no persisted ZIP and no separate Worker; return appropriate public HTTP status.

**Verify:** `npm run test:worker -- tests/worker/download-all.test.ts.`

#### Task 72: Connect gallery Download All button

**Files:** `src/client/pages/PlayerPage.tsx`, `tests/ui/player-page.test.tsx`

**Test first (red):** With photos, button targets correct player ZIP route; with none, stays disabled; download failure is announced visibly.

**Implementation (green):** Add one prominent Download All action using existing endpoint; no client-side ZIP duplication.

**Verify:** `npm run test:ui -- tests/ui/player-page.test.tsx.`

#### Task 73: Gate Free deployment with realistic large ZIP

**Files:** `tests/worker/download-all.test.ts`, `docs/deployment.md`

**Test first (red):** Test at least the initial 219-photo metadata case and one large collection with realistic original sizes in local workerd; run deployed Free trial and observe CPU/subrequest/stream limits.

**Implementation (green):** Document observed results and practical upper bound. Do not silently shorten ZIP, degrade originals or call a partial archive 'Download All'; escalate to explicit Paid upgrade approval if Free cannot meet the requirement.

**Verify:** `npm run test:worker -- tests/worker/download-all.test.ts; complete documented real-account trial.`

### Phase 9 — Deployment and acceptance

#### Task 74: Write production configuration and secret checklist

**Files:** `wrangler.jsonc`, `docs/deployment.md`, `tests/unit/deployment-config.test.ts`

**Test first (red):** Assert configuration names single Worker, D1 binding DB, R2 binding PHOTOS, SPA fallback and no literal credentials.

**Implementation (green):** Document R2 Standard bucket and D1 provisioning, local/remote migrations, hashed password secret setup and Free/Paid deployment compatibility.

**Verify:** `npm run test:unit -- tests/unit/deployment-config.test.ts; npx wrangler deploy --dry-run.`

#### Task 75: Add public and admin end-to-end smoke tests

**Files:** `tests/e2e/public.spec.ts`, `tests/e2e/admin.spec.ts`, `playwright.config.ts`

**Test first (red):** Write failing browser flows for roster-to-gallery-to-original-download and admin login-to-add-player-to-upload-to-delete; test blocked deletion.

**Implementation (green):** Implement test fixtures against local Worker with D1/R2 isolation, no production images or credentials committed.

**Verify:** `npm run test:e2e -- tests/e2e/public.spec.ts tests/e2e/admin.spec.ts.`

#### Task 76: Test the full initial filename import with fixtures

**Files:** `tests/worker/import-fixtures.test.ts`, `tests/fixtures/import/manifest.json`, `docs/import.md`

**Test first (red):** Fixture manifest represents Montoya/Chapdelaine cases plus unknown/reused number/duplicate; assert import review preserves all inputs and never guesses.

**Implementation (green):** Document importing supplied roster first, then 219 originals through admin batches; do not put actual team photos in git.

**Verify:** `npm run test:worker -- tests/worker/import-fixtures.test.ts.`

#### Task 77: Verify production bindings and public protection

**Files:** `docs/deployment.md`, `tests/e2e/public.spec.ts`, `tests/e2e/admin.spec.ts`

**Test first (red):** Smoke-test a deployed Free preview: SPA/roster/image/download public; all admin mutations reject anonymous calls; secrets absent from frontend assets.

**Implementation (green):** Fill actual D1/R2 IDs using user's Cloudflare account at deployment, apply migrations, set secret hash securely, complete SSL/domain and mobile checks. Do not promote before the Free-tier gates pass.

**Verify:** `npm run verify; npm run test:e2e; npx wrangler deploy --dry-run; record deployed smoke results.`

#### Task 78: Finalize project handoff and CI check

**Files:** `README.md`, `docs/deployment.md`, `docs/import.md`, `.github/workflows/ci.yml`, `tests/unit/documentation.test.ts`

**Test first (red):** Assert README links design/plan/import/deploy instructions and CI has passed the tested HEAD.

**Implementation (green):** Document admin workflow and password recovery via secure Worker secret replacement; push in atomic subsystem batches and monitor resulting GitHub Actions until green, fixing failures before completion.

**Verify:** `npm run verify; inspect git diff for unrelated files; verify final Actions run is green.`

## Final acceptance checklist

- [ ] Public roster/home and player page match approved black/white photographic direction on desktop and mobile; user-provided hero/logo are loaded if supplied.
- [ ] No public authentication is required; all administrative writes are server-guarded and CSRF-aware.
- [ ] Gallery ownership and filename matching are correct even when numbers are reused; unknown/ambiguous filenames await manual selection.
- [ ] An existing player with photos cannot be deleted (409); photo reassignment allows intentional cleanup.
- [ ] Duplicate Keep/Skip is explicit, including within batch; source files and original download bytes are unmodified.
- [ ] Featured-photo and hero cropping never modifies original JPEGs; empty state and deleted-feature fallback work.
- [ ] Every image publish/delete failure is reported without a false success or dangling public entry; no photo recycle bin.
- [ ] Individual and full original-resolution ZIP downloads work; ZIP contains only selected player's photos and handles missing source safely.
- [ ] Actual Free-tier upload/auth/219-image ZIP smoke tests succeed, **or** release is blocked pending explicit Paid approval.
- [ ] Supplied roster and 219 photos imported with reconciliation counts; source assets and secrets never committed.
- [ ] All targeted tests, `npm run verify`, builds and e2e smoke tests pass; final GitHub Actions run is green; no unrelated changes.

## Release inputs (not blockers for coding)

The photographer supplies the official roster, original JPEG batch, hero photo and optional logo when content import is reached, plus access to Cloudflare account, chosen hostname and a secure admin-password hash/secret when deployment is configured. Use placeholders until then. The implementation must never manufacture roster data or require committing photos to GitHub.

## Hand off

Review this plan; implementation starts **only after explicit approval**. Execute tasks in order with strict TDD and monitor CI after each atomic code batch.
