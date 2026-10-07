# Photo Viewer Zoom and Navigation Implementation Plan

**Date:** 2026-10-06  
**Design doc:** `docs/specs/2026-10-06-photo-viewer-zoom-design.md`  
**Status:** Implemented and deployed 2026-10-06

## Overview

Add mobile pinch zoom, desktop wheel zoom, bounded drag panning, and compact zoom controls to the existing full-screen gallery viewer. Replace text navigation arrows with restrained circular chevrons. Preserve photo selection, pagination, downloads, keyboard navigation, and closing. Implement in the small test-first tasks below, each intended to take 2–5 minutes; split a task further if its implementation exceeds that window.

## Execution Notes

- Follow-up requested on 2026-10-06: restyled the player page's **All players** back link with a rounded outline, subtle dark surface, hover feedback, and a 44 px target. The original link's computed target was only 16 px high and had no border, padding, or surface; the browser reproduction failed twice before the focused `.player-nav .back-link` CSS change. Browser checks passed at 1440, 390, and 320 px widths, including header spacing, visible keyboard focus, and Enter navigation to the roster. All 130 tests, typecheck, build, and deployment dry run passed. Deployed version `09e07f15-8742-45e3-958e-a2c2bf64d591`; live checks confirmed styling, navigation, health, and JS/CSS bytes matching the build after asset propagation. Reports/screenshots: ignored `.tmp/back-link-live-*`; draft commit summary: `.tmp/all-players-commit-message.txt`.
- Implemented the approved viewer scope and deployed to [the existing Cloudflare gallery](https://miramichi-timberwolves-gallery.mathew-stewart.workers.dev). Version: `2d54dc38-8557-4b50-9c0a-73572c4f6a41`.
- Final `npm run verify` passed: 14 unit tests, 40 UI tests, and 76 Worker tests (130 total), plus typechecking and the production build. `npx wrangler deploy --dry-run` passed before deployment. No package, backend, schema, or resource configuration changes were needed.
- Wrote and ran failing tests before adding geometry, zoom controls, wheel handling, mouse/touch pan, pinch, gesture cancellation, and resize handling. Existing integration behavior satisfied the navigation-reset tests without extra code. A failing pagination test exposed disabled-button clicks bubbling into backdrop close; restricting close to the backdrop itself fixed it.
- The final review consolidated fixed and moving focal-point zoom math into the same helper, with a new failing-then-passing moving-midpoint regression test and a fresh full verification/build.
- Browser acceptance passed against the final built frontend at 1440×900, 390×844, and 844×390, using a real portrait JPEG and a landscape SVG fixture with a local fixture API. Native Chromium input verified wheel anchoring, pointer capture and mouse pan, pinch and midpoint pan, pinch-to-fit swipe suppression, a fresh fitted swipe, reset, navigation/reopen, orientation bounds, visible keyboard focus, and control hit areas and stacking. Control targets measured at least 44×44 CSS pixels and stayed outside the clipped image stage. Browser screenshots were inspected.
- Live checks passed with the actual deployed API and public photos: health/home HTTP 200, deployed JS/CSS SHA-256 equal to the tested build, real image loading, native mobile pinch and fitted swipe, reset, desktop controls, zoom reset between photos, original-download HEAD HTTP 200, protected anonymous read HTTP 401, Escape close, and zero browser runtime exceptions.
- Browser reports and screenshots are local verification artifacts under ignored `.tmp/` (`viewer-browser-report.json`, `viewer-live-report.json`, and `viewer-zoom-*.png` / `viewer-live-mobile.png`). No production content was changed by the checks. Physical iOS/Android device testing was unavailable; mobile validation used Chromium touch emulation, with partial-finger transitions additionally covered by UI tests.
- For each behavior task, write the specified tests, run the targeted suite and observe the expected failure, implement the change, and rerun the suite. Keep intermediate failures confined to the task in progress.
- No production or test code is changed by this plan. At planning time, the approved design is the only untracked file. Recheck `git status --short` before execution and preserve any subsequent user edits.
- `PlayerPage` in `src/client/App.tsx` currently owns selection, keyboard navigation, pagination, and a touch-start/end swipe handler. Keep selection and loading there. Move image gestures into `src/client/PhotoViewport.tsx`, passing `src`, `alt`, `onPrevious`, and `onNext`. Render it with the selected photo ID as its React key so changing photos resets transient state.
- Use one pointer-event gesture path for mouse and touch. Replace the existing touch-only swipe path when integrating the component, retaining its behavior tests and thresholds. Do not layer duplicate touch and pointer handlers over one gesture.
- Use `src/client/viewer-geometry.ts` only for the geometry shared by button, wheel, drag, and pinch interactions. Do not add a general gesture framework or dependency.
- Geometry units are CSS pixels in the untransformed viewport coordinate system. Store `{ scale, x, y }`, with scale relative to the fitted image. Viewport size and intrinsic image dimensions determine the fitted size. Read viewport bounds rather than transformed image bounds for gesture coordinates.
- The design leaves zoom increments and visual dimensions to implementation. Use 0.5 scale steps for buttons, smooth wheel zoom, and 44 px minimum control hit areas. These are implementation choices within the approved design.
- Run geometry tasks with `npm run test:unit -- tests/unit/viewer-geometry.test.ts`; run viewport tasks with `npm run test:ui -- tests/ui/photo-viewport.test.tsx`; run page integration tasks with `npm run test:ui -- tests/ui/public-pages.test.tsx`. Each task below names its verification explicitly.

## Tasks

### Task 1: Define fitted size and pan bounds

**Files:** `tests/unit/viewer-geometry.test.ts`, `src/client/viewer-geometry.ts`

**Test first:** Verify a 1200×800 image fits a 600×600 viewport at 600×400, a portrait image fits without distorting its aspect ratio, and a smaller image retains its natural size. Verify scale is clamped to 1–4, scale 1 resets both offsets to zero, and huge positive and negative offsets are bounded at zoomed scales. Include a dimension-zero case that produces finite values rather than division errors.

**Implementation:** Define minimal size and transform types and functions for fitted size and clamped transforms. Fit with `min(1, viewportWidth / naturalWidth, viewportHeight / naturalHeight)`. For each axis, cap the absolute pan offset at `max(0, (fittedLength * scale - viewportLength) / 2)`. Center axes whose scaled image is smaller than the viewport. Before dimensions are available, retain a centered, finite transform and avoid coordinate division.

**Verify:** `npm run test:unit -- tests/unit/viewer-geometry.test.ts`.

### Task 2: Define zoom around a focal point

**Files:** `tests/unit/viewer-geometry.test.ts`, `src/client/viewer-geometry.ts`

**Test first:** With fitted dimensions 600×400 inside a 600×400 viewport, zoom from scale 1 to 2 around a point 100 px right of center; expect x = -100 and y = 0. Verify an existing pan is respected, the image point under the focal point stays fixed until bounds require clamping, and requested scales beyond either limit use the actual clamped scale.

**Implementation:** Add a focal zoom function shared by buttons, wheel, and pinch. For center-relative anchor `a`, old offset `p`, and scale ratio `r`, calculate each new offset as `a - (a - p) * r`. Clamp the requested scale before calculating the ratio, then clamp offsets using Task 1. Button zoom uses the viewport center as its anchor.

**Verify:** `npm run test:unit -- tests/unit/viewer-geometry.test.ts`.

### Task 3: Establish a measurable photo viewport

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`, `src/client/styles.css`

**Test first:** Render `PhotoViewport` directly with a display URL and alt text. Mock its viewport rectangle and the image's natural dimensions, dispatch image load, and assert the initial photo is fitted, centered, and untransformed. Cover dimensions being unavailable before load. Keep geometry mocks local and restore them after each test; do not change global test setup.

**Implementation:** Create a clipped image stage with an untransformed viewport ref, image ref, fitted dimensions, and local transform state. Measure on image load. Position the image at the stage center with a center-origin transform that translates by x/y and scales by scale. Preserve the image aspect ratio and existing display source. Add only viewport rules needed for this structure; keep unrelated CSS untouched.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`; `npm run typecheck`.

### Task 4: Add compact zoom controls and reset

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** Query buttons by accessible names `Zoom in`, `Zoom out`, and `Reset zoom`. Assert zoom-in enlarges the photo, zoom-out reduces it, repeated activation respects both limits, and reset returns scale and offsets to their fitted state. Verify zoom-out is disabled at 1 and zoom-in at 4. Clicking controls must not invoke a surrounding close callback.

**Implementation:** Add a compact toolbar as a sibling of the gesture stage, available at all screen widths. Use native buttons, explicit accessible labels, and visible +, minus, and reset icons or text. Buttons use the shared geometry. Stop toolbar click propagation. Reset also cancels active gesture state once that state is introduced.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`.

### Task 5: Zoom with the mouse wheel

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** Dispatch cancelable wheel events at an off-center point and verify the photo enlarges or shrinks according to wheel direction while retaining the image point under that coordinate. Verify wheel events are prevented inside the stage, zoom remains bounded, and wheel events outside it are not intercepted. Include a line-mode wheel event as well as pixel-mode input.

**Implementation:** Attach a native wheel listener to the stage with `passive: false`; remove it on cleanup. Convert delta modes to CSS pixels using a consistent line unit and viewport height for page units, then use a smooth multiplier such as `exp(-normalizedDelta * 0.002)`. Subtract viewport center from client coordinates and call focal zoom. Prevent default only in the stage. Use current state through a ref or equivalent so successive events do not read stale zoom.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`.

### Task 6: Add mouse drag panning

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** At scale 2, pointer-down/move/up with the primary mouse button changes offsets and clamps extreme movement. At scale 1, a mouse drag does not move or navigate the photo. Non-primary mouse buttons do nothing. Verify releasing a captured pointer outside the stage ends the drag.

**Implementation:** Track pointer ID, type, and coordinates in a local ref. For a primary mouse drag while enlarged, capture the pointer on the stage and translate by movement deltas using the common clamp. Release capture safely on completion. Disable native image dragging. Add grab/grabbing cursors only when panning is available or active.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`.

### Task 7: Preserve swipe navigation through pointer events

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** A single touch pointer at scale 1 calls `onNext` for a left swipe and `onPrevious` for a right swipe. A movement under 50 px, a vertical-dominant movement, and a mouse drag call neither. One completed touch gesture invokes at most one callback. A single touch drag at scale 2 pans and invokes neither callback.

**Implementation:** Extend pointer tracking for touch gestures. Save the starting coordinate and whether the gesture is eligible to swipe. At fitted scale, navigate only after a completed single-touch gesture with absolute horizontal displacement at least 50 CSS pixels and greater than the vertical displacement. At zoomed scale, touch dragging uses the same bounded pan behavior as mouse dragging and permanently marks that gesture ineligible to swipe. Apply `touch-action: none` only to the photo stage so the custom gesture owns touch interaction there.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`.

### Task 8: Add pinch zoom around the fingers

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** Two touch pointers moving apart increase scale; moving together decreases it. Test an off-center pinch with sufficient image overflow and assert focal anchoring, verify limits at 1 and 4, and verify moving both fingers together moves the zoomed photo within bounds. Coincident finger coordinates must not produce NaN or infinite transforms.

**Implementation:** Track active pointers by ID. When two touch pointers are present, record their distance, midpoint, and starting transform. Determine scale from their distance ratio. Preserve the image point under the starting midpoint at the current midpoint using the focal geometry, then clamp. Ignore a zero-distance baseline until a usable distance is available. Mark the entire gesture ineligible to swipe as soon as multiple touch pointers are present.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`; rerun `npm run test:unit -- tests/unit/viewer-geometry.test.ts` if geometry changes.

### Task 9: Prevent pinch-to-swipe transitions

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** Pinch back to scale 1, lift one finger, and drag the remaining finger horizontally: neither navigation callback fires. Starting with a single finger and then adding a second must also suppress navigation. Verify lifting one finger from a zoomed pinch allows smooth one-finger panning without a jump. A third finger must not turn a multi-touch gesture into a swipe.

**Implementation:** Preserve gesture ineligibility until all pointers from the gesture have ended. Rebase movement when the active pointer count changes so switching from pinch to pan does not apply a stale distance or offset. Treat three or more touch pointers conservatively by suppressing swipe and rebasing when returning to a usable count; do not invent another gesture.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`.

### Task 10: Handle cancellation and gesture clicks

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** Pointer cancel and lost capture invoke no navigation and leave the next independent gesture functional. Clicking after a completed drag or pinch does not call a surrounding close handler. Reset during a gesture clears it, and later pointer-up cannot trigger navigation. Unmounting the component releases listeners and leaves no active gesture behavior.

**Implementation:** Add one gesture cleanup path used by cancellation, reset, lost capture, and unmount. Clear tracking before releasing captures so cleanup cannot cause navigation. Stop click propagation from the photo stage and toolbar, including synthetic clicks after gestures. Keep explicit close and external backdrop handling in the page.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`.

### Task 11: Keep bounds valid when the viewport changes

**Files:** `tests/ui/photo-viewport.test.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** Provide a local ResizeObserver mock. Resize a measured landscape stage to portrait while enlarged and panned; verify a new fitted size, a valid scale, bounded offsets, and no navigation. Trigger resize at fitted scale and verify centering. After unmount, verify observer cleanup. A resize during a gesture must not cause a jump from stale gesture coordinates.

**Implementation:** Observe the stage dimensions with ResizeObserver. Recompute fit and clamp the current transform when dimensions change; retain its scale within 1–4. Cancel or rebase active gestures on dimension changes, preventing them from navigating. Disconnect the observer on unmount. Do not add a separate orientation handler if viewport observation already covers it.

**Verify:** `npm run test:ui -- tests/ui/photo-viewport.test.tsx`; `npm run typecheck`.

### Task 12: Integrate the viewport into the gallery

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`

**Test first:** Extend the page viewer test to find the zoom controls while retaining the same display-image URL and original-download URL. Update `swipeViewer` to dispatch touch pointer-down/move/up events with a stable ID; preserve every existing swipe, threshold, boundary, pagination, and retry assertion. Provide any missing PointerEvent or capture mocks locally in the UI tests, sufficient to model pointer IDs and types without claiming browser gesture coverage.

**Implementation:** Replace the direct viewer image with the keyed `PhotoViewport`. Pass existing image alt text, backward navigation bounded to index 0, and `showNextPhoto` for forward navigation. Delete the superseded touch-start ref and touch-end handler and remove only their unused type imports. Keep the dialog, close, download, navigation button disabled rules, keyboard listener, body scroll lock, and pagination ownership in `PlayerPage`.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx tests/ui/photo-viewport.test.tsx`; `npm run typecheck`.

### Task 13: Verify zoom resets on navigation and reopen

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** Open photo 1, zoom and pan, then navigate by next/previous buttons and by ArrowRight/ArrowLeft. Each newly selected photo starts fitted and centered. Close and reopen the same photo and verify reset. Reset to fitted size and swipe to verify the new photo is also centered. Confirm image clicks keep the viewer open while Escape, close, and an actual outer backdrop click still close it.

**Implementation:** Complete any lifecycle fixes needed to satisfy these integration cases, preserving the selected-photo key and local state. Restrict backdrop close to clicks on the backdrop itself so stage events cannot bubble into a close. Retain existing keyboard selection bounds and behavior; do not add keyboard shortcuts outside the approved design.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx tests/ui/photo-viewport.test.tsx`.

### Task 14: Verify zoom and pagination coexist

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`, `src/client/PhotoViewport.tsx`

**Test first:** At a loaded gallery edge with a next cursor, pinch or pan and assert no cursor request occurs. Advance using Next while zoomed and assert the current photo stays visible during loading, only one request is pending, and the newly loaded photo starts fitted. On failure, assert the current image and transform remain, the in-view alert appears, retry succeeds, and successful selection resets zoom. Preserve existing no-wrap behavior and original download URLs.

**Implementation:** Fix only integration discrepancies revealed by these tests. Gesture callbacks must remain blocked for pinch and zoomed pan. Reuse `showNextPhoto`, the existing concurrent-request guard, and viewer error state; keep the viewport mounted on the current photo while loading or on failure. Remount only when the selected photo actually changes.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx tests/ui/photo-viewport.test.tsx`.

### Task 15: Replace navigation arrows with accessible chevrons

**Files:** `tests/ui/public-pages.test.tsx`, `src/client/App.tsx`

**Test first:** Assert both navigation buttons retain accessible names `Previous photo` and `Next photo`, first/last and loading disabled states, and their correct navigation behavior. Zoom the image and verify both controls remain available and usable without closing the viewer.

**Implementation:** Replace text arrows with small inline SVG chevrons hidden from assistive technologies, keeping labels on the buttons. Preserve handlers and disabled rules. Do not add an icon dependency or alter gallery boundaries.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx`.

### Task 16: Style the viewer controls and layout

**Files:** `src/client/styles.css`, `tests/ui/public-pages.test.tsx`, `tests/ui/photo-viewport.test.tsx`

**Test first:** Run both viewer UI suites before styling. Prepare browser acceptance checks at 390×844 and 1440×900: chevrons and zoom controls are visible, keyboard focus is clear, all hit areas are at least 44×44 CSS pixels, and image pan cannot obscure close, navigation, toolbar, or download controls. Do not add source-text assertions that merely repeat CSS declarations.

**Implementation:** Group focused viewer rules in the existing stylesheet. Replace direct `.viewer > img` sizing and touch-action assumptions with stage/image selectors. Reserve space for the toolbar and footer; clip the transformed image to its stage and keep controls above it. Use subtle translucent circular navigation buttons, small chevrons, a compact zoom group, readable contrast, distinct hover/focus states, and muted disabled states. Account for existing mobile overrides, safe-area insets, narrow screens, and short landscape viewports. Preserve reduced-motion behavior and leave unrelated CSS untouched.

**Verify:** `npm run test:ui -- tests/ui/public-pages.test.tsx tests/ui/photo-viewport.test.tsx`; perform the prepared browser checks and inspect portrait and landscape photos.

### Task 17: Verify browser gesture behavior

**Files:** `docs/plans/2026-10-06-photo-viewer-zoom.md` (execution notes only); if defects require fixes, use only the production/test files named in preceding tasks.

**Test first:** Use the acceptance checklist established in Task 16. Start the existing development server with `npm run dev` and open a populated gallery. Use a touch-capable browser/device for real two-finger pinch checks and a desktop browser for wheel/capture checks. JSDOM event tests do not replace these checks.

**Implementation:** Record actual checks and results in this plan's execution notes. Verify pinch zoom and pan, returning to fitted size without accidental navigation, a fresh fitted swipe, wheel zoom under the pointer without page scrolling, drag release outside the image, reset, toolbar taps, zoomed navigation, resizing/orientation, and close/download usability. If a defect appears, add a reproducing automated test where feasible before making the smallest in-scope correction. If the required device or browser is unavailable, record that validation gap explicitly.

**Verify:** Acceptance checks pass on desktop and mobile. Rerun only affected targeted suites after a correction before final verification.

## Final Verification

- Run `npm run verify` after implementation to execute unit, UI, Worker, typecheck, and build checks.
- Run `git diff --check` and inspect `git diff` plus `git status --short` for unrelated changes.
- Confirm the change uses existing display-image and original-download URLs and adds no package, API, storage, or database changes.
- Confirm every design success criterion has either an automated assertion or recorded browser evidence. Report any validation gaps accurately.

## Definition of Done

- [x] Tasks completed in order, with behavior tests written and observed failing before implementation.
- [x] All new behavior has tests and all targeted checks and `npm run verify` pass.
- [x] Desktop and mobile acceptance checks pass, with any unavailable checks clearly recorded.
- [x] Zoom, pan, gesture isolation, reset, navigation controls, and existing viewer behavior match the approved design.
- [x] No unrelated files changed; modifications are limited to the design/plan, `src/client/App.tsx`, `src/client/PhotoViewport.tsx`, `src/client/viewer-geometry.ts`, `src/client/styles.css`, `tests/unit/viewer-geometry.test.ts`, `tests/ui/photo-viewport.test.tsx`, and `tests/ui/public-pages.test.tsx`.
