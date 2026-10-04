# Dark Gallery Redesign

**Date:** 2026-09-28  
**Status:** Approved

## Goal

Give players and families a clear, professional dark gallery for finding and downloading photographs, and give the photographer a consistent admin interface. Use near-black backgrounds, white text, restrained team-color accents, a prominent uploaded team logo, and concise, practical copy.

## Success Criteria

- [ ] The home roster, player galleries, photo viewer, admin login, and photographer workspace use a consistent, readable dark style on desktop and mobile.
- [ ] The home hero is shorter, its team title is smaller, and the uploaded logo is more prominent wherever space allows.
- [ ] Promotional copy, including “The team. The moments. All in one place,” “Meet the team,” and similar phrases, is replaced with useful labels.
- [ ] Every roster card displays the number of active photos for its player, including **0 photos** for an empty gallery.
- [ ] Full-screen mobile viewers can swipe left for the next photo and right for the previous photo, loading the next gallery page automatically when needed.
- [ ] Search, uploads, keyboard and button navigation, and original-photo downloads continue to work.

## Scope

**In scope:**

- Restyle the public home/roster, player pages, photo viewer, admin login, and photographer workspace.
- Use the configured team logo across public and admin pages. Remove the “MT” logo fallback.
- Shorten the home hero, reduce its oversized title, keep gallery photos in color, and use team-color accents sparingly for counts, active controls, and focus states.
- Replace promotional copy with concise navigation, search, gallery, download, and admin labels.
- Show active-photo counts on roster cards.
- Add touch swipe navigation within the full-screen photo viewer.

**Out of scope:**

- Additional roster or gallery features beyond photo counts and viewer swipe navigation.
- Changes to photo ownership, upload workflows, authentication, storage, or original-download behavior.
- New site artwork or a replacement for the supplied team logo.

## Design

### Pages and visual language

Use near-black page backgrounds, slightly lighter surfaces for cards and forms, white primary text, and readable muted text. Apply team color to a small number of meaningful elements rather than broad backgrounds. Keep photographs in their original display color instead of applying grayscale filters. Preserve clear keyboard focus and readable form and error states.

The home hero retains the team photograph and legibility overlay but takes less vertical space. Its title is smaller, while the uploaded team logo has more room. The roster follows sooner, headed by practical labels such as **Players** and **Search players**. Each card shows the player's name, jersey number, and **N photos**. Player pages keep their existing continuous photo grid, viewer, and original-download controls with concise labels. The admin login and workspace use the same visual language without changing their management functions.

The existing site settings API holds the logo URL. Public player pages and admin pages use it as well as the home page. The “MT” initials fallback is removed. If the image fails to load, page titles and navigation remain usable without inserting substitute initials.

### Photo counts and API

Add a numeric `photoCount` to each entry returned by `GET /api/players`. Derive it from photos belonging to that player whose state is `active`. Include players with zero active photos. Compute the value when the roster is requested rather than storing a separate counter, so publishing and deleting photos cannot leave a stale count. The roster card renders singular or plural wording as appropriate. A failed roster request displays its normal error rather than guessed counts.

### Mobile photo viewer

Within the full-screen viewer, a horizontal swipe left advances one photo and a horizontal swipe right returns one photo. Small movements and primarily vertical gestures do not navigate. The existing arrow buttons and keyboard controls remain available. Navigation does not wrap around the first or last photo.

When a user swipes forward from the last loaded photo and the gallery API reports another page, fetch that page once and continue to its first photo. Keep the current photo visible while loading. If loading fails, keep the viewer open on that photo and show an error; the user can retry. At the true end of the gallery, further swipes do nothing.

### Empty and failure states

An empty roster card reads **0 photos**, and its player page shows a plain message that no photos are available yet. Keep status and error messages legible against dark surfaces. Do not present failed photo loading as successful navigation.

## Testing Strategy

Write behavior-focused tests before implementation. Verify that the roster API returns active-photo counts for players with multiple, inactive, and zero photos; cards render the corresponding counts; and promotional copy and the “MT” fallback are absent. Test swipe direction, gesture thresholds, first/last limits, automatic loading of another page, and loading failure. Confirm existing keyboard and button navigation, roster search, and original-photo downloads. Review desktop and mobile layouts for contrast, logo scale, and usable controls.

## Open Questions

None. Routine spacing, typography, and exact team-color values can be chosen during implementation from the supplied logo and existing visual assets.
