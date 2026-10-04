# PWA Photo Integration — Photo Service Design

**Date:** 2026-10-04  
**Status:** Approved  
**Repository:** `godwept/twPlayersPage`  
**Consumer:** `godwept/timberwolves-webNEW`

## Goal

Make `twPlayersPage` the source of player action photography for the Timberwolves fan PWA without changing ownership of photographs or downloads. Players in this repository gain an optional HockeyTech player ID so the fan PWA can find the correct gallery using the same HockeyTech ID it already receives from its roster/statistics API.

The photographer must be able to link a player from the current Miramichi Timberwolves HockeyTech roster, manually override the ID, or clear the link.

## Success Criteria

- [ ] Each photo-site player may have one optional HockeyTech player ID.
- [ ] A non-null HockeyTech player ID cannot be assigned to two photo-site players.
- [ ] Photographer admin can search/select from the current Miramichi Timberwolves roster.
- [ ] Lookup results show name, jersey number, position, and HockeyTech headshot.
- [ ] Photographer can manually enter/change the HockeyTech player ID.
- [ ] Photographer can clear a link without deleting the player or photos.
- [ ] Public integration API returns only display-safe photo metadata, never R2 keys or original-download URLs.
- [ ] Full galleries are pageable by HockeyTech player ID.
- [ ] A lightweight photo index provides one representative display photo per linked player for fan-app minigames.
- [ ] The dedicated photo site remains the only owner of original-image downloads.

## Scope

**In scope:**

- D1 schema change for `hockeytech_player_id`.
- Player repository validation/read/write support.
- Photographer admin lookup and manual override.
- Authenticated roster-lookup endpoint backed directly by HockeyTech current-season discovery and the Miramichi roster feed.
- Public HockeyTech-keyed gallery endpoint.
- Public linked-player photo index.
- Absolute optimized-image URLs for cross-app use.
- Tests for schema, admin mutation, lookup normalization, public contract, pagination, and safe metadata.

**Out of scope:**

- Replacing the public photo site's own player UUIDs.
- Using HockeyTech IDs as photo foreign keys.
- Synchronizing HockeyTech player names/numbers into D1.
- Copying photos to `timberwolves-webNEW`.
- New original-download APIs for the PWA.
- General HockeyTech player search outside the current Miramichi roster.

## Data Model

Add nullable `players.hockeytech_player_id TEXT`.

The existing `players.id` UUID remains the primary key and all `photos.player_id` relationships continue to use it. `hockeytech_player_id` is only an external integration key.

Validation:

- null/blank means unlinked;
- otherwise the value is a decimal numeric string;
- store it as text so callers do not depend on JavaScript integer width;
- enforce uniqueness for non-null values with a partial unique index.

## Photographer Admin

The existing **Manage players** editor gains a **HockeyTech Player** area.

For the player being edited it shows the currently stored HockeyTech ID, if any, and supports:

1. **Find from current roster** — loads the current Miramichi roster through this app's authenticated Worker endpoint.
2. Results show HockeyTech headshot, name, jersey number, and position.
3. Selecting a result copies that roster entry's HockeyTech player ID into the edit field.
4. **Manual override** permits direct numeric entry.
5. **Clear link** sets the value to null.
6. Saving uses the existing player PATCH route.

The lookup is assistance only. The durable value is the HockeyTech ID; roster name, number, position, and headshot are not copied into D1.

### Roster lookup dependency

The owner approved direct HockeyTech lookup on 2026-10-04 after the fan-app proxy returned its pinned 2025–26 roster.

The authenticated Worker calls HockeyTech's `feed=modulekit&view=seasons` endpoint, reads the designated current `SiteKit.Parameters.season_id`, then requests `feed=statviewfeed&view=roster&team_id=9&season_id=<current-id>`. Resolve the season on each explicit lookup rather than pinning a season number. Parse JSON or JSONP without executing JavaScript.

The browser does not call HockeyTech directly from the admin page. The authenticated `twPlayersPage` Worker performs the upstream requests and returns the same normalized lookup payload.

If lookup is unavailable, the admin displays an error but manual ID entry remains usable.

Normalized response:

```json
{
  "players": [
    {
      "id": "12345",
      "name": "Player Name",
      "jerseyNumber": "14",
      "position": "D",
      "imageUrl": "https://assets.leaguestat.com/mhl/240x240/12345.jpg"
    }
  ]
}
```

## Public Integration API

These endpoints are public and read-only.

### Player gallery

`GET /api/integrations/hockeytech/players/:hockeyTechPlayerId/photos?limit=30&cursor=...`

Valid numeric IDs return HTTP 200 even when no photo-site player is linked, allowing the consumer to distinguish normal absence from transport/service failure.

```json
{
  "hockeyTechPlayerId": "12345",
  "linked": true,
  "photoCount": 23,
  "playerPageUrl": "https://photo-site.example/player/<opaque-player-id>",
  "items": [
    {
      "id": "<photo-id>",
      "filename": "14 - Player1.jpg",
      "uploadedAt": "2026-10-04T12:00:00.000Z",
      "displayUrl": "https://photo-site.example/api/photos/<photo-id>/display"
    }
  ],
  "nextCursor": "<cursor-or-null>"
}
```

For an unlinked HockeyTech ID:

```json
{
  "hockeyTechPlayerId": "12345",
  "linked": false,
  "photoCount": 0,
  "playerPageUrl": null,
  "items": [],
  "nextCursor": null
}
```

Rules:

- only active photos are returned;
- `limit` follows the existing gallery bounds of 1–60;
- cursor semantics match the existing player gallery;
- `displayUrl` and `playerPageUrl` are absolute;
- no `originalDownloadUrl`, original R2 key, display R2 key, checksum, or admin-only metadata is returned.

### Photo index

`GET /api/integrations/hockeytech/photo-index`

Returns one representative optimized display photo for each linked player that currently has at least one active photo. Use the explicitly selected featured photo when valid, otherwise the newest active photo.

```json
{
  "players": [
    {
      "hockeyTechPlayerId": "12345",
      "photoCount": 23,
      "displayUrl": "https://photo-site.example/api/photos/<photo-id>/display"
    }
  ]
}
```

This endpoint is intentionally small. It supports minigames that need one custom image per player; a minigame that needs more images can request that player's full gallery through the player-gallery endpoint.

## Error Handling

- Invalid HockeyTech ID syntax: 400.
- Valid but unlinked HockeyTech ID: 200 with `linked: false`.
- Linked player with no active photos: 200 with `linked: true`, `photoCount: 0`, and empty items.
- Invalid gallery cursor: 400.
- Roster lookup upstream unavailable/malformed: authenticated admin endpoint returns 502 with a useful error; manual override remains available.
- Duplicate HockeyTech ID assignment: 409 with a clear conflict message.
- Existing public photo and download routes remain unchanged.

## Security and CORS

The integration metadata endpoints are public GET endpoints, consistent with the public gallery. Administrative lookup and mutation remain protected by the existing admin session middleware.

The fan PWA will fetch JSON server-to-server through its own `tw-api` Worker, so browser CORS is not required for the metadata API. Optimized images are loaded directly as normal `<img>` resources from this service.

## Testing Strategy

TDD coverage must include:

- migration accepts null IDs and enforces uniqueness for non-null IDs;
- player repository normalizes numeric IDs, clears links, and reports conflicts;
- admin PATCH can set/change/clear HockeyTech ID;
- roster lookup rejects unauthenticated requests and normalizes the current roster payload;
- gallery lookup distinguishes linked/no-photos from unlinked;
- gallery pagination never crosses into another player;
- integration responses contain absolute display URLs;
- integration responses never contain original download URLs or R2 keys;
- photo index uses featured active photo, falls back to newest active photo, excludes unlinked/empty players.

## Cross-Repo Contract

The consumer agent in `godwept/timberwolves-webNEW` may develop against the exact response shapes in this document before this service is deployed.

No consumer behavior should depend on photo-site UUIDs except treating `playerPageUrl` as an opaque navigation URL.
