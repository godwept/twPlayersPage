# Miramichi Timberwolves Photo Gallery Design

**Date:** 2026-09-27  
**Status:** Approved  
**Repository:** `godwept/twPlayersPage`  
**Intended repository path:** `docs/specs/2026-09-27-timberwolves-photo-gallery-design.md`

## Goal

Build a simple, photography-first website for the Miramichi Timberwolves. Players, parents, and visitors can find a player, browse their photographs, and download original-resolution JPEGs without signing in. The team photographer can add photos and manage the roster from a password-protected admin interface without editing code or redeploying the site. The initial collection contains 219 images, with more added after games.

## Success Criteria

- [ ] A public, mobile-responsive roster/home page presents the team photograph, Timberwolves branding, and searchable player cards.
- [ ] Each player has a continuous, newest-upload-first gallery with full-screen viewing, individual original-JPEG downloads, and a Download All ZIP.
- [ ] The public site requires no login; only administrative operations require authentication.
- [ ] The photographer can upload individual or multiple JPEGs, review automatic player assignments, resolve ambiguous matches and duplicates, and publish them without a deployment.
- [ ] The initial 219 photographs can be imported using the supplied filename convention and roster.
- [ ] Players can be added and edited from the admin dashboard; former players remain visible with their galleries.
- [ ] Roster cards use a selected gallery photograph with adjustable, non-destructive crop/zoom/position; an empty-gallery placeholder is available.
- [ ] The team banner can be uploaded/replaced and repositioned through administration.
- [ ] Public browsing uses optimized images while every download supplies the original, untouched uploaded JPEG.
- [ ] The deployed application operates on Cloudflare with a single Worker, D1, and R2.

## Scope

**In scope:**

- Public home/roster page and individual player pages only.
- Black, white, and restrained grey visual design based on the supplied mockup, with large photographic imagery, bold typography, and responsive desktop/mobile layouts.
- Team-photo hero with legible branding overlay and responsive cropping; optional supplied team logo.
- Roster search by player name or jersey number; player cards show name, number, and featured image.
- Player galleries in one continuous collection ordered by upload date descending, not grouped by game/date/opponent.
- Full-screen image viewer, navigation between photos, per-photo download, and Download All ZIP.
- One password-protected administrator; photo/roster/banner management and batch upload.
- Original and optimized JPEG storage, filename-based player matching, duplicate warnings, and explicit permanent photo deletion.

**Out of scope:**

- Player/visitor accounts, private galleries, social features, purchases or payments.
- Game schedules, standings, opponent metadata, and per-game gallery organization.
- Multi-player photo tagging: each photograph belongs to exactly one player.
- Website-added watermarks or alterations to downloadable original images.
- Automatic removal or archiving of former players; a photo recycle bin.
- A large general-purpose CMS or multi-admin roles.

## Design

### 1. Cloudflare architecture

A single Cloudflare Worker serves the website and handles public requests and protected administration. Cloudflare D1 stores structured player, photo, and site metadata. Cloudflare R2 stores source JPEGs and derived display images, plus site artwork. New content appears from storage/database changes without redeploying the Worker. The public website and admin share one application/deployment.

The repository contains application code and configuration, not the photograph collection or secrets. The supplied team image, logo, roster, and initial photo batch are content inputs, not required to author the implementation code.

### 2. Public pages and interactions

**Roster/home page:** A large full-width team-photo hero with Miramichi Timberwolves branding and a subtle legibility gradient leads into a searchable, responsive player-card grid. The banner image is supplied by the photographer and can be replaced/repositioned in admin. Cards use a selected gallery image, with non-destructive portrait crop/zoom/position; empty galleries show a name/number placeholder. Every recorded player remains listed, including former players, unless explicitly removed by an administrator. Search handles name and jersey number.

**Individual player page:** Shows player's name and jersey number, one continuous responsive image grid sorted newest upload first, a full-screen photo viewer with navigation, download of any original JPEG, Download All Photos ZIP, and simple return navigation. No game/grouping filters. Optimized images load progressively; original-resolution files are fetched only for downloads.

**Downloads:** Downloading an individual photo returns the exact uploaded JPEG bytes, filename preserved where practical. Download All generates a ZIP of the selected player's originals on demand without persisting duplicate ZIP archives. An empty gallery disables Download All. Failed downloads must not be presented as successful/corrupt files. For large collections, delivery must be bounded/streamed to respect Cloudflare runtime constraints, verified during implementation.

### 3. Data and content model

**Player:** permanent internal ID; first name; surname; jersey number; selected featured-photo reference (optional); roster-card crop/zoom/position metadata; creation metadata. Internal IDs, not jersey numbers, associate photos to players, because numbers can be reused. Retain former players publicly. An explicit administrative remove action is separate from a player leaving the team.

**Photograph:** permanent internal ID; exactly one player ID; original filename; original R2 object reference; derived display-image reference(s); content hash for duplicate detection; upload timestamp for gallery ordering. Images belong to one player only; no cross-player tags or game categorization.

**Site settings/assets:** reference to the team banner and its display positioning, plus optional logo/branding assets. Crop metadata is independent of source-image bytes. The selected featured photograph is an existing player-gallery photograph, not a separately required portrait.

Original full-resolution JPEG bytes are kept unchanged. Derived web-friendly display images are used for fast browsing. Changing a featured photo or its crop never overwrites or crops the downloadable original. A confirmed duplicate may be retained as an intentional separate gallery entry; its deletion must not invalidate any other photo entry.

### 4. Photograph import and publishing

Accepted starting convention is `<jersey number> - <surname><sequential photo ID>.jpg`, e.g. `1 - Montoya1.jpg` and `4 - Chapdelaine2.jpg`. Match the leading jersey number and surname against the uploaded roster, excluding the trailing sequence number. Matching should not rely on jersey number alone. If names/numbers are missing or ambiguous (including reused combinations), require manual assignment: never guess.

Admin can drag/drop or select batches of JPEGs. Before publishing, the UI shows each proposed player assignment, lets the photographer correct it, and flags content-identical files already stored or repeated within the batch. For each duplicate, the photographer explicitly chooses Keep or Skip. Content equality, not filename equality, determines duplicates. Admin may alternatively select a player and upload directly into that player's gallery, bypassing filename inference. Unsupported files are rejected clearly. Failed/interrupted imports report failures and do not create broken public entries; successfully published photos remain available.

### 5. Private administration and authentication

One traditional administrator password, verified server-side using secure password hashing; no password or secret embedded in client code or committed to GitHub. Authenticated sessions use protected cookies and are required for all content-changing operations, not just for viewing an admin page. Public browsing/downloading remains unauthenticated. Admin operations need appropriate request/session protection.

The admin dashboard has three focused areas:

- **Manage Photos:** batch and per-player upload, assignment/duplicate review, publish, browse and permanently delete unwanted photographs, choose a featured photo.
- **Manage Players:** add/edit names and jersey numbers, find a player's gallery, select featured image and adjust crop/zoom/position, and provide an intentional explicit remove action if needed.
- **Website Appearance:** upload/replace and position the team hero banner, and manage the optional team logo.

No multi-user account system or separate authentication provider is required.

### 6. Errors, deletions, and edge cases

- Unknown filename, missing roster entry, or ambiguous number/surname: request manual player selection before publishing.
- Exact duplicate found in existing storage or the current batch: warn and offer per-photo Keep or Skip, not automatic rejection.
- Empty gallery: show a placeholder on the roster, an empty state on the player page, and disable Download All.
- Failed uploads: identify each failure without publishing dangling photo metadata; do not undo independently successful uploads.
- Deleting a photograph: show a confirmation; permanently remove its original, derived images, and associated metadata. There is no recycle bin. If it was featured, fall back to another available gallery image or the placeholder. Partial storage/database failures must be handled without falsely reporting full success.
- Removing a player must be an intentional administrator action, not a consequence of their departure. Exact handling of photos attached to an explicitly removed player is an implementation-stage clarification, not permission for silent cascading deletion.
- Download errors are visible; a failed ZIP or missing object must not be served as a successful completed download.
- Player profile and hero crops should remain usable on both narrow mobile and wide desktop viewports.

### 7. Testing strategy

Write behavior-focused tests before implementing new code (TDD), covering:

- Filename parsing and roster matching, including reused jersey numbers, surnames, malformed names, and ambiguities.
- Correct ownership: exactly one player per photograph; galleries and ZIPs never include another player's images.
- Content-based duplicate detection within batches and against stored images, and the explicit Keep/Skip outcomes.
- Upload publication/failure consistency, invalid file rejection, and admin authorization for every mutation.
- Player CRUD as scoped, empty gallery fallback, featured-image selection, non-destructive crop changes, and banner management.
- Photo deletion and featured-image fallback, including failure reporting.
- Verbatim original JPEG bytes for individual downloads and correct original-photo membership in generated ZIPs.
- Public read access without authentication and rejection of unauthorized administration calls.
- Responsive roster and photo-gallery behaviour, touch viewing/navigation, and practical large-gallery performance.
- Deployment verification for Worker/D1/R2 bindings, production secrets, and importing the initial 219-image collection against the provided roster.

## Assets and Inputs Needed

- Official team roster (names and jersey numbers).
- Initial 219 source JPEGs retaining current filename pattern.
- Preferred team photograph for the home-page hero.
- Official Timberwolves logo if available.
- Cloudflare account/deployment configuration and administrator password, supplied securely when configuring deployment.

## Open Questions Deferred to Implementation Planning

- Exact behavior for an administrator's explicit **remove player** action when that player still has associated photographs; it must not silently destroy those photographs.
- Exact ZIP-generation implementation and practical batch/download limits on the selected Cloudflare runtime, subject to validation; the required visitor behavior remains original-resolution Download All.
- Choice of frontend tooling and specific image-derivative mechanism within the approved single-Worker architecture.

No production implementation is authorized by this document; move to planning only after design approval (recorded above).