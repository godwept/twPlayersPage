# Dark Gallery Redesign Implementation Plan

**Date:** 2026-09-28  
**Design doc:** `docs/specs/2026-09-28-dark-gallery-redesign-design.md`  
**Status:** Implemented and deployed 2026-09-28

## Overview

Restyle the public roster, player gallery, viewer, and photographer admin as one dark gallery. Use the uploaded logo across all pages, shorten the home hero, show active-photo counts on roster cards, and support swipe navigation with automatic gallery pagination. Preserve existing upload, search, keyboard, download, and authentication behavior.

## Execution Notes

- Complete the small tasks below in order. For behavior changes, add the specified test first, run it to observe failure, implement, then run it again. For visual-only CSS work, run the named interaction tests before and after and perform the stated browser checks; avoid source-text tests that only echo CSS declarations.
- `src/client/App.tsx` currently has an unrelated uncommitted crop-origin edit. Preserve it. Keep changes confined to the files named by each task, and inspect the final diff.
- The CSS is currently compressed into long lines. Make focused edits to existing rules or add a clearly grouped set of overrides; avoid reformatting unrelated selectors.
- The logo is managed through the existing public `GET /api/site` response. No new assets, schema migration, or admin API are needed. Choose a restrained accent from the configured logo when it is available; keep text and controls legible even if that asset fails to load.

## Tasks

### Task 1: Return active-photo counts with the roster

**Files:** `tests/worker/public-roster.test.ts`, `worker/index.ts`

**Test first:** Extend the public roster test with one player having two active photos and one photo in `deleting` state, plus another player with no photos. Assert `GET /api/players` returns `photoCount: 2` and `photoCount: 0` respectively, while preserving featured-photo and safe-field behavior. Run the targeted Worker test and observe the missing counts.

**Implementation:** Add a correlated `COUNT(*)` subquery restricted by `player_id = p.id AND state = 'active'` to the existing roster SELECT. Return the numeric count in each JSON player object; leave `/api/players/:id` and the database schema unchanged.

**Verify:** `npm run test:worker -- tests/worker/public-roster.test.ts`.

### Task 2: Show counts on public roster cards

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`

**Test first:** Give the UI roster fixtures counts of `0`, `1`, and `12`; assert each corresponding card link contains `0 photos`, `1 photo`, or `12 photos`. Confirm name/number search still filters the same cards. Observe the count assertions fail before editing the component.

**Implementation:** Add required `photoCount: number` to the client `Player` type and render a small text count in each card's details. Keep it inside the card link so it is available to touch and screen-reader users. For a player without a jersey number or portrait, use their name or initials in the placeholder instead of `MT`.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`.

### Task 3: Replace home-page promotional copy

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`

**Test first:** Assert the home page has a `Players` heading and a roster anchor labeled `View players`, while the three existing promotional lines in the hero, roster introduction, and footer are absent. Keep the search's accessible name. Observe the copy assertions fail.

**Implementation:** Replace `The team. The moments. All in one place.`, `Meet the team`, `Find your player.`, the season-oriented roster note, and the footer slogan with short labels or remove redundant lines. Keep the team name, search, photographer login, and roster anchor available.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`.

### Task 4: Use the configured logo on every page

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`

**Test first:** Mock `/api/site` with a logo URL. Assert an image with alt text `Miramichi Timberwolves logo` appears on the home, player, unauthenticated admin, and authenticated admin views. With a null URL, assert no `MT` logo fallback is rendered and visible team-name navigation remains usable. Observe player/admin assertions fail.

**Implementation:** Pass the existing site logo URL to `TeamMark` on player and admin pages, fetching public site settings on those routes. Remove the initials branch from `TeamMark`; keep a visible team-name label or page heading beside navigation so a failed image never removes the only visible context. Keep the admin appearance uploader intact; update its `Optional team logo` copy to `Team logo` to reflect the supplied asset.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`; inspect loading and failed-image states in the browser.

### Task 5: Make player-gallery and admin copy practical

**Files:** `tests/ui/public-pages.test.tsx`, `tests/ui/app-smoke.test.tsx`, `src/client/App.tsx`

**Test first:** Add UI assertions that an empty player gallery says `No photos available yet` and retains a roster link, that the player page has a `Download all photos` action when populated, and that admin login/dashboard headings identify `Photographer login` and `Photographer admin`. Assert the current season/moment and welcome/workspace slogans are absent. Observe the heading/empty-state assertions fail.

**Implementation:** Replace the player gallery's season-oriented caption and empty state, and the admin's `Welcome back.` / `Team workspace.` headings. Retain operational descriptions needed for upload and image quality, and preserve all form labels, status messages, and download links.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx tests/ui/app-smoke.test.tsx`.

### Task 6: Navigate loaded photos with touch swipes

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`

**Test first:** Open a three-photo viewer and fire touch-start/end events on the viewer image: a left swipe advances, a right swipe returns, movements below 50 CSS pixels and gestures whose vertical distance exceeds horizontal distance do nothing. Assert swipes at the first and last loaded photos do not wrap. Confirm close, arrow, and Escape behavior still works. Observe swipe assertions fail.

**Implementation:** Track the starting touch position with a ref and handle touch end inside the viewer. Navigate only for horizontal movement of at least 50 CSS pixels and greater horizontal than vertical movement. Reuse the existing selected-index bounds and button/keyboard behavior. Do not block normal vertical gestures or swipes that begin on controls.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`.

### Task 7: Fetch the next gallery page on forward swipe

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`

**Test first:** Mock an initial page with one photo and `nextCursor`, then a second page with another photo. Swipe forward at the loaded edge and assert the cursor URL is fetched once and the viewer advances to the new photo. Fire two rapid forward swipes while the request is pending and assert no duplicate request. Observe the pagination assertions fail.

**Implementation:** Extend the viewer's forward-navigation path to request the next page when `cursor` exists. Keep the current image displayed during loading. Append returned photos, update the cursor, and select the first newly loaded photo. Guard concurrent requests, including rapid touch events; do nothing if the next page has no items or the true end is reached. Keep the existing `Load more photos` button functional.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`.

### Task 8: Keep the viewer open on page-load failure

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`

**Test first:** Make the cursor request fail, swipe forward, and assert the viewer remains on the current photo with an in-view alert. Then make the next request succeed, swipe again, and assert navigation recovers. Observe the existing page-level error behavior fails these assertions.

**Implementation:** Keep viewer pagination errors separate from the player-page fatal load error. Clear the viewer alert on retry/success. Allow another swipe to retry; do not append photos or advance selection after a failed request. Keep initial player/gallery load errors and the existing outer `Load more photos` error handling intact.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`.

### Task 9: Establish the dark palette and accessible controls

**Files:** `src/client/styles.css`, `tests/ui/public-pages.test.tsx`

**Test first:** Run the public UI suite, including its search and download affordance tests, before changing CSS. Record a manual browser checklist for visible focus, readable errors, and usable text inputs on the roster and admin login.

**Implementation:** Replace the light root background/text/surface values with near-black background, charcoal surfaces, white primary text, muted readable secondary text, and subtle borders. Add one accent token chosen from the supplied logo, used sparingly. Update buttons, inputs, selects, error/status text, hover, and `:focus-visible` rules so all routes use the same palette. Avoid changing upload or form behavior.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`; inspect keyboard focus and form/error contrast at 390 px and 1440 px widths.

### Task 10: Tighten the home hero and roster presentation

**Files:** `src/client/styles.css`, `tests/ui/public-pages.test.tsx`

**Test first:** Run the home search/count/logo tests before styling. Include a browser check that, at 390 px and 1440 px widths, the hero no longer consumes nearly a full screen and roster search appears soon below it.

**Implementation:** Reduce `.hero` height and minimum height and shrink its heading from the current `clamp(5rem,12.2vw,11rem)` scale. Increase header/logo dimensions where space permits, keeping the team photo and legibility overlay. Restyle roster cards, placeholders, count text, search, and footer to the dark palette; remove all grayscale filters from roster images. Adjust existing mobile media rules rather than adding a new layout system.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`; inspect home at 390 px and 1440 px, with and without a banner image and with long player names.

### Task 11: Restyle player galleries and viewer

**Files:** `src/client/styles.css`, `tests/ui/public-pages.test.tsx`

**Test first:** Run the player viewer, swipe, and download tests before styling. Include a browser check for legible navigation, controls, and in-view pagination errors at narrow and wide widths.

**Implementation:** Apply dark surfaces and light text to player navigation, heading, gallery empty state, gallery actions, and viewer controls. Increase the logo within available header/footer space, retain responsive photo-grid sizing, and remove grayscale filters from gallery images. Keep original-photo download controls visible and clearly labeled in the viewer.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`; inspect player pages and the open viewer at 390 px and 1440 px, including swipe and error states.

### Task 12: Restyle admin login and page header

**Files:** `src/client/styles.css`, `tests/ui/app-smoke.test.tsx`

**Test first:** Add a smoke test for the unauthenticated `/admin` view that mocks the session response and checks the logo, practical heading, password input, sign-in button, and public-gallery link. Run it before CSS work.

**Implementation:** Apply the dark palette, larger logo, and readable form, error, button, and focus styling to `.admin-page`, `.admin-brand`, `.login-panel`, and `.admin-header`. Keep the login and logout flow unchanged.

**Verify:** `npm run test:ui -- tests/ui/app-smoke.test.tsx`; inspect login at 390 px and 1440 px, including a failed sign-in state and focused password field.

### Task 13: Restyle roster and featured-photo admin controls

**Files:** `src/client/styles.css`, `tests/ui/app-smoke.test.tsx`

**Test first:** Extend the admin smoke test with a mocked authenticated session and roster; assert player editing and featured-photo chooser remain reachable. Run it before CSS work.

**Implementation:** Use charcoal surfaces and readable labels/borders for the player form, roster rows, edit form, CSV import, featured picker, and crop controls. Remove grayscale from featured-photo previews. Keep the existing mobile grid layout and all actions.

**Verify:** `npm run test:ui -- tests/ui/app-smoke.test.tsx`; inspect populated roster and featured-photo controls at 390 px and 1440 px.

### Task 14: Restyle photo and appearance admin controls

**Files:** `src/client/styles.css`, `tests/ui/app-smoke.test.tsx`

**Test first:** Extend the authenticated admin smoke test to assert photo upload, existing-photo selector, banner/logo upload, and banner-position controls are still present. Run it before CSS work.

**Implementation:** Use dark surfaces and visible focus for upload/drop areas, review rows, existing-photo list, appearance uploader, banner-position controls, and status messages. Remove grayscale from appearance previews and existing-photo thumbnails. Preserve responsive columns and action labels.

**Verify:** `npm run test:ui -- tests/ui/app-smoke.test.tsx`; inspect upload review, existing photos, and appearance controls at 390 px and 1440 px.

## Final Verification

- Run `npm run verify` once after all tasks are complete.
- Inspect `git diff` and `git status --short`; preserve the pre-existing crop-origin edit and confirm no unrelated files changed.
- In a browser, check home, populated and empty player galleries, open viewer, admin login, and authenticated admin at mobile and desktop widths. Confirm full-color photos, visible logo, count wording, usable contrast/focus, swipe pagination, and unchanged original-download paths.

## Definition of Done

- [ ] Every task above is complete in order, with behavior tests written before implementation.
- [ ] All targeted tests and `npm run verify` pass.
- [ ] Desktop and mobile visual checks match the approved design.
- [ ] Only planned files are changed, and the existing uncommitted crop-origin edit is preserved.
- [ ] Counts, logo, copy, swipe, and existing workflows behave as described in the design document.

## Execution Result

The owner authorized implementation and Cloudflare deployment after this plan was written. `npm run verify` passed: 7 unit, 11 UI, and 25 Worker tests, plus typechecking and the production build. Wrangler deployed version `c98715ee-8e80-48a9-832e-8066271ca22b` to `https://miramichi-timberwolves-gallery.mathew-stewart.workers.dev`. Live checks returned HTTP 200 for the home page and a healthy API; all 23 roster entries included photo counts. Desktop and narrow-width screenshots of the public pages and admin login were reviewed. Authenticated admin styling was covered by UI tests; the live account's representative upload and full ZIP launch checks remain tracked in `docs/deployment.md`.
