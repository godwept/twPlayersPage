# Photo Viewer Zoom and Navigation Design

**Date:** 2026-10-06
**Status:** Approved

## Goal

Let players and families inspect full-screen gallery photos on mobile and desktop through zoom and pan, while making previous and next controls less intrusive and consistent with the existing dark gallery.

## Success Criteria

- [ ] Mobile viewers support pinch-to-zoom and drag-to-pan.
- [ ] Desktop viewers support compact zoom-in, zoom-out, and reset controls, mouse-wheel zoom, and drag-to-pan.
- [ ] Zoom ranges from the fitted view to 4 times the fitted size, centered around the pinch or mouse pointer.
- [ ] Panning remains bounded so the photo cannot be dragged completely off-screen.
- [ ] Reset, changing photos, and reopening the viewer restore the fitted view and centered position.
- [ ] Pinching and panning never navigate to another photo or close the viewer; swipe navigation works only at the fitted zoom level.
- [ ] Previous and next controls use subtle circular chevrons with translucent backgrounds, clear focus states, and comfortable touch targets.
- [ ] Navigation, pagination, original downloads, closing, and keyboard navigation continue to work.

## Scope

**In scope:**

- Zoom and pan within the existing full-screen photo viewer.
- A compact zoom toolbar on both desktop and mobile, including an easy reset action.
- Restyling previous and next controls.
- Coordinating zoom gestures with existing mobile swipe navigation.
- Behavior tests and desktop and mobile layout checks for the viewer changes.

**Out of scope:**

- Changes to backend APIs, storage, uploads, or original-download behavior.
- Loading a separate original-resolution image for zooming; use the existing gallery display image.
- Changes to other gallery or admin features.

## Design

### Viewer interactions and controls

Photos initially fit the available viewing area. On mobile, pinch around the fingers to zoom and drag the enlarged photo to pan. At the fitted zoom level, preserve horizontal swipe navigation. Any gesture involving a pinch or a zoomed pan is ineligible for swipe navigation, including a pinch that returns to the fitted size before the fingers lift.

On desktop, mouse-wheel zoom is centered around the mouse pointer within the photo viewing area. Dragging an enlarged photo pans it. Compact +, minus, and reset controls provide explicit alternatives to gestures. Keep the same toolbar available on mobile for an easy reset.

Previous and next controls are circular chevrons with translucent backgrounds and restrained styling. Maintain clear hover and keyboard focus states and comfortable touch targets. Navigation controls remain visible while zoomed and preserve disabled states at gallery boundaries and during required page loading. Controls stay clear of the main viewing area wherever layout allows.

Close, original download, and keyboard navigation remain available. Pinching and panning must not close the viewer.

### State and interfaces

The viewer tracks a zoom scale between 1 and 4 relative to the fitted image, horizontal and vertical pan offsets, and the active gesture needed to distinguish a swipe from pinch or pan. These are transient viewer states, not persisted settings.

Reset restores scale 1 and centered offsets. A change in the selected photo or reopening the viewer restores the same state and clears active gestures. Gesture completion or cancellation must not leave stale gesture state that could trigger a later navigation or close action.

Zoom and pan act on the existing display image. Existing photo data, gallery API pagination, and original-download URLs remain the viewer's interfaces; no new server interface is required.

### Bounds and edge cases

Clamp zoom to the approved range and bound pan against the displayed image and available viewport so the photo cannot be dragged completely off-screen. Preserve valid bounds when the viewing area changes, including mobile orientation changes.

Changing photos through buttons, keyboard navigation, swiping at fitted size, or successful pagination resets zoom and pan. Existing navigation does not wrap around the gallery boundaries.

While loading another page, keep the current photo visible. A failed page load keeps the viewer open on that photo, displays the existing error, and permits retry. Pinching and zoomed panning do not request another gallery page.

## Testing Strategy

Write behavior-focused tests before production implementation. Verify pinch and wheel zoom, zoom controls and limits, pointer-centered zoom, bounded panning, reset, and zoom reset when changing photos or reopening the viewer. Cover gesture cancellation and prevent pinching or panning from triggering swipe navigation or closing the viewer.

Keep existing swipe thresholds, first and last photo limits, pagination, loading failure and retry, button and keyboard navigation, original download, and close tests passing. Check desktop and mobile layouts for readable controls, clear focus states, comfortable touch targets, and unobstructed viewing. Check viewport changes and mobile orientation changes for valid fit and pan bounds.

## Open Questions

None. Exact spacing, icon geometry, control opacity, and zoom increments can follow the existing dark gallery styling during implementation.
