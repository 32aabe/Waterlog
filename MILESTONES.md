# Waterlog Milestones

Roadmap from the Ver.3 design proposal, tracked here as work lands.

## Standing principles (2026-07-03)

- **Capture speed outranks every other feature.** The test for any change
  to the Capture screen: does this help or hurt someone who stops for ten
  seconds because they just noticed a bird interacting with water? If a
  feature makes recording slower, simplify or defer it rather than the
  photo/save path.
- **The interaction is the observation, the species is a detail about it.**
  The primary thing being recorded is not "a bird" — it's what the bird
  was doing with water. Water-interaction (behavior) fields lead; species
  trails as optional, secondary detail, in the capture flow and in every
  place a moment is displayed.

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

### Water-interaction-first pass (2026-07-03)

- [x] Promoted behavior chips (Drinking/Bathing/Foraging/Wading/Preening/
      Resting) out of the collapsed "Bird sighting" block and above the
      fold as "Water interaction" — a single tap, framed as the main
      action of the flow. Species moved into the collapsed "Add details"
      section, relabeled "Which bird, if you know (optional)."
      Renamed the spot's own condition chips "Water level" to disambiguate
      from the bird's "Water interaction."
- [x] Fixed a save-logic bug where tapping behavior chips without also
      typing a species silently dropped the sighting — behavior alone is
      now the expected complete case, not a fallback.
- [x] Fixed the `locations`/`observations` adapter so a moment with no
      bird at all (no behavior tapped, no species typed) no longer stores
      and displays a phantom "Unidentified bird" sighting — added a
      not-user-visible sentinel to distinguish "no bird" from "a bird,
      unidentified" without a schema change.
- [x] Spot Story and Journal now show behavior first, species second
      (`formatSighting`), and give behavior-bearing sightings the primary
      badge color so water interaction visually reads as the main fact
      everywhere a moment appears, not just on the capture screen.

### Voice, multi-photo, multi-sighting, nearby-spot (2026-07-03) ✅

- [x] **Voice notes**: a mic button next to the (secondary, collapsed)
      Note field records audio, uploads it, transcribes it
      (`voiceTranscription.ts`), and merges the text into the note. Voice
      is an input method for typing faster, not a stored asset — no
      schema change, nothing persisted beyond the resulting text.
- [x] **Multi-photo**: up to 6 photos per moment. The zero-photo state is
      pixel-identical to before (same big "tap to add a photo" tile); a
      thumbnail row with an add tile only appears once a photo exists, so
      the common one-photo case isn't slowed down by gallery chrome.
      `photoUrl` now holds a JSON-encoded array (reusing the existing
      parse-or-wrap helper already used for behaviors) instead of one bare
      URL — no schema change.
- [x] **Multi-sighting**: more than one bird per moment. Each sighting
      becomes its own `observations` row sharing a moment group key (see
      README → "Data model"), stored in the previously-unused
      `distanceFromWater` column — no schema change. The primary sighting
      keeps the water-interaction-first layout (behavior chips above the
      fold, species collapsed); additional sightings are opt-in compact
      cards via "+ Add another bird," each with their own behavior chips.
      Fixed `deriveLifecycle`/`getUserStats` to group rows into moments
      first so a 3-bird visit counts as one moment and one lifecycle data
      point, not three.
- [x] **Nearby-spot suggestion**: computed client-side (Haversine, from
      the already-fetched spot list — no new backend query). Within ~25m
      of an existing spot, capture defaults to it instead of creating a
      duplicate, shown transparently as a pre-selected chip (not silent);
      within ~120m, nearby spots are offered as one-tap alternatives to
      "New spot," which stays the default when there's no confident match.

### Remaining

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
