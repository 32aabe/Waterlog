# Waterlog Milestones

Roadmap from the Ver.3 design proposal, tracked here as work lands.

## Standing principle (2026-07-03)

The capture experience outranks every other feature. The test for any
change to the Capture screen: does this help or hurt someone who stops for
ten seconds because they just noticed a bird interacting with water? If a
feature makes recording slower, simplify or defer it rather than the
photo/save path.

## Milestone 1 — Foundation ✅

- [x] New project scaffolded from Ver.2's infrastructure layer (server
      `_core`, storage, auth, tRPC/Drizzle pipeline, shadcn UI, Google Maps
      component, LLM/image/voice services — all reused unchanged).
- [x] New server domain logic: `spots` and `moments` tRPC routers speak
      Water Spot / Moment / Sighting, adapted onto Ver.2's original
      `locations` / `observations` tables rather than new ones — see
      "Schema decision" below.
- [x] Spot lifecycle state (alive/drying/dry/reawakened) computed at read
      time from recent observations.
- [x] New mobile-first shell: bottom tab bar (Map / Journal / Capture /
      Spots / Profile) replacing the old top navbar + `/admin` route.
- [x] Five real (not placeholder) pages: Living Water Map with spot
      markers, spot story/moment feed, a working under-10-second capture
      flow (photo-first, water-condition chips, optional sighting), journal
      timeline, profile/stats.
- [x] Teal/paper visual palette replacing Brooktrack's corporate blue.
- [ ] Verified end-to-end against a live database (blocked on
      Waterlog-specific `.env` provisioning — see `.env.example`).

### Schema decision (2026-07-03)

Reverted an earlier draft that introduced `waterSpots` / `moments` /
`sightings` as new tables. Per product direction: validate the new
experience with real users first, keep Ver.2's original `locations` /
`observations` tables as-is, and revisit the schema once there's usage
evidence to design against. See `README.md` → "Data model" for exactly how
the product-language API maps onto those tables today.

## Milestone 2 — Fast capture loop polish

### Capture-speed pass (2026-07-03)

- [x] Collapsed spot type, note, and species/behaviors into a single
      "Add details (optional)" toggle. Above the fold now: photo, one row
      of water-condition chips, nothing else.
- [x] Save button is sticky (always one tap away, independent of scroll
      or how much of the optional section is expanded), and now shows why
      it's briefly disabled ("Locating…") instead of just going gray.
- [x] Geolocation requests a fast, cached/network fix
      (`enableHighAccuracy: false`, 5-minute `maximumAge`) instead of a
      slow high-accuracy GPS lock — "near this puddle" is precise enough.
- [x] Removed the full-screen sign-in wall that used to block the whole
      Capture screen — including taking the photo — for anyone not
      already signed in. The screen now works fully signed out; only
      tapping Save for real requires an account, and it opens sign-in in
      a new tab so the in-progress photo/note is never lost. Auth
      refetches automatically when the user returns to the tab.

### Remaining

- [ ] Voice-note capture (wire existing `voiceTranscription.ts`).
- [ ] Multi-photo and multi-sighting entries.
- [ ] Nearby-spot suggestion instead of always defaulting to "new spot."
- [ ] Offline-friendly capture queue (PWA).

## Milestone 3 — Living Water Map

- [ ] Time-based lifecycle decay (alive → drying → dry) via a scheduled job.
- [ ] Marker clustering, "spots that need a visit" filter.
- [ ] Reawakening push notifications (`notification.ts`).

## Milestone 4 — Journal & stats

- [ ] "On this day" memories, beautiful stat visualizations, collections.

## Milestone 5 — AI layer

- [ ] Daily/monthly AI recaps, auto species/behavior suggestion, best-photo
      selection, shareable monthly stories.

## Milestone 6 — Native

- [ ] Package the PWA as a native mobile app.
