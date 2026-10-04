# PWA Photo Integration — Photo Service Implementation Plan

**Date:** 2026-10-04  
**Design doc:** `docs/specs/2026-10-04-pwa-photo-integration-design.md`  
**Status:** Ready for review  
**Repository:** `godwept/twPlayersPage`

## Overview

Add a HockeyTech external player link to the photo service, photographer-admin roster lookup/manual override, and two public read-only integration endpoints for the fan PWA. Preserve existing UUID ownership, photo storage, original-download behavior, and public gallery behavior. Implement strictly test-first.

## Shared Contract

Do not change the response shapes documented in the design without coordinating with the `godwept/timberwolves-webNEW` agent. That agent will consume:

- `GET /api/integrations/hockeytech/players/:id/photos`
- `GET /api/integrations/hockeytech/photo-index`

The existing `GET https://tw-api.mathew-stewart.workers.dev/api/roster` endpoint is the admin lookup source.

## Tasks

### Task 1: Add HockeyTech ID migration

**Files:** `migrations/0002_hockeytech_player_id.sql`, `tests/worker/schema.test.ts`

**Test first:** Extend the schema test to prove two players may both have null `hockeytech_player_id`, one numeric string can be assigned once, and assigning that same non-null ID to a second player fails.

**Implementation:** Add `hockeytech_player_id TEXT` to `players` and a unique partial index applying only when the column is non-null. Do not modify `0001_initial.sql`.

**Verify:** `npm run test:worker -- tests/worker/schema.test.ts`.

### Task 2: Add repository validation and persistence

**Files:** `worker/repos/players.ts`, `tests/worker/players-repo.test.ts`

**Test first:** Add cases for setting a numeric string, trimming it, clearing with null/blank, rejecting non-digits/overlong values, and surfacing duplicate assignment as a player conflict.

**Implementation:** Add `hockeytech_player_id` to `PlayerRecord`; extend `PlayerUpdate` with `hockeyTechPlayerId?: string | null`; normalize to null or a decimal string (maximum 20 digits); update `listPlayers`, `findPlayer`, and `updatePlayer`. Convert the D1 unique-constraint failure for this field into a specific conflict error rather than a generic 500.

**Verify:** `npm run test:worker -- tests/worker/players-repo.test.ts`.

### Task 3: Extend admin player PATCH behavior

**Files:** `worker/index.ts`, `tests/worker/admin-players.test.ts`

**Test first:** Through authenticated routes, set a HockeyTech ID, change it, clear it, and assert duplicate assignment returns 409. Confirm unauthenticated PATCH remains 401.

**Implementation:** Accept `hockeyTechPlayerId` in the existing PATCH payload and map the repository conflict to a clear 409 response. Include `hockeyTechPlayerId` in the existing public player JSON so the current admin roster state can reuse its existing load path; do not expose any additional admin/storage fields.

**Verify:** `npm run test:worker -- tests/worker/admin-players.test.ts`.

### Task 4: Add authenticated current-roster lookup

**Files:** `worker/index.ts`, `tests/worker/hockeytech-roster.test.ts`

**Test first:** Mock upstream `tw-api /api/roster`; assert `GET /api/admin/hockeytech/roster` requires authentication and returns normalized `id/name/jerseyNumber/position/imageUrl` entries. Add malformed/upstream-error cases returning 502.

**Implementation:** Add an admin GET route that fetches `https://tw-api.mathew-stewart.workers.dev/api/roster`, walks the existing HockeyTech `roster[0].sections[].data[].row` shape, drops entries without numeric `player_id`, and returns the normalized list. Build headshot URLs as `https://assets.leaguestat.com/mhl/240x240/{id}.jpg`.

**Verify:** `npm run test:worker -- tests/worker/hockeytech-roster.test.ts`.

### Task 5: Add HockeyTech-keyed gallery repository query

**Files:** `worker/repos/photos.ts`, `tests/worker/public-roster.test.ts`

**Test first:** Insert linked, unlinked, empty, active, and deleting-photo fixtures. Assert a HockeyTech ID returns only that linked player's active photos with existing cursor ordering and bounds.

**Implementation:** Add a repository function that resolves `players.hockeytech_player_id` to the internal UUID, counts active photos, and reuses the existing gallery paging semantics. Keep original-download metadata out of the integration result.

**Verify:** `npm run test:worker -- tests/worker/public-roster.test.ts`.

### Task 6: Add public integration gallery route

**Files:** `worker/index.ts`, `tests/worker/hockeytech-gallery.test.ts`

**Test first:** Cover valid linked player, linked empty player, valid unlinked ID, invalid ID, cursor paging, and absolute URL generation. Assert serialized JSON does not contain `originalDownloadUrl`, `original_key`, `display_key`, or known test R2 key values.

**Implementation:** Add `GET /api/integrations/hockeytech/players/:id/photos` using the exact design contract. Resolve relative display paths against `new URL(c.req.url).origin`. Return an absolute opaque `playerPageUrl` for linked players.

**Verify:** `npm run test:worker -- tests/worker/hockeytech-gallery.test.ts`.

### Task 7: Add representative photo index

**Files:** `worker/index.ts`, `tests/worker/hockeytech-gallery.test.ts`

**Test first:** Assert `GET /api/integrations/hockeytech/photo-index` includes only linked players with active photos; selects a valid featured photo first; falls back to newest active photo; reports active-photo count; returns absolute display URLs.

**Implementation:** Add one bounded SQL query or small repository helper. Do not return full galleries from this route and do not add randomization.

**Verify:** `npm run test:worker -- tests/worker/hockeytech-gallery.test.ts`.

### Task 8: Add photographer admin edit state

**Files:** `src/client/App.tsx`, `tests/ui/admin-hockeytech-link.test.tsx`

**Test first:** Render authenticated admin with a player containing a HockeyTech ID; begin edit; assert the field displays the ID; changing/clearing it sends the correct PATCH payload.

**Implementation:** Extend the client `Player` type and `editFields` with `hockeyTechPlayerId`. Add the labeled HockeyTech field to the existing player edit form. Keep add-player and CSV-import flows unchanged.

**Verify:** `npm run test:ui -- tests/ui/admin-hockeytech-link.test.tsx`.

### Task 9: Add roster lookup picker

**Files:** `src/client/App.tsx`, `src/client/styles.css`, `tests/ui/admin-hockeytech-link.test.tsx`

**Test first:** Mock `/api/admin/hockeytech/roster`; click **Find from current roster**; assert results show headshot/name/number/position; selecting a result fills the ID field; failed lookup leaves manual editing usable.

**Implementation:** Add lookup state only while a player is being edited. Fetch on explicit button press, not on every admin page load. Provide **Clear link** and retain direct manual numeric input. Reuse existing button/form styles where possible; add only minimal picker-specific CSS.

**Verify:** `npm run test:ui -- tests/ui/admin-hockeytech-link.test.tsx`.

### Task 10: Regression verification

**Files:** no production changes unless a failing regression identifies a scoped defect.

**Test first:** None; this is the verification gate after all red/green tasks.

**Implementation:** Run the complete project verification and inspect the diff for unrelated changes.

**Verify:** `npm run verify`. Confirm existing public gallery, original downloads, admin auth, uploads, and player editing tests remain green.

## Definition of Done

- [ ] HockeyTech ID is optional, normalized, editable, clearable, and unique when non-null.
- [ ] Current Timberwolves roster lookup works through authenticated photo-site admin.
- [ ] Public HockeyTech gallery contract matches the approved design exactly.
- [ ] Public photo index returns one representative optimized image per linked player with photos.
- [ ] No integration response exposes originals or R2 object keys.
- [ ] Existing gallery/download functionality is unchanged.
- [ ] All new behavior has tests written before implementation.
- [ ] `npm run verify` passes.
- [ ] No unrelated files are modified.

## Handoff

Implement only this repository. The fan-PWA agent can work in parallel against the documented contract; do not modify `godwept/timberwolves-webNEW` from this task.
