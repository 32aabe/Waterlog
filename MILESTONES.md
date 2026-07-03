# Waterlog Milestones

Roadmap from the Ver.3 design proposal, tracked here as work lands.

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
