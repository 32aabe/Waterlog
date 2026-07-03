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
- **Delight over features (from Milestone 3 on).** The goal is not to add
  more functionality — it's an app people enjoy opening again after they
  get home. Design for reflection, not only collection: the Living Water
  Map, the personal journal, visual summaries, and the emotional pull of
  revisiting a past moment matter more than new mechanisms.

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

## Milestone 3 — Delight, reflection, emotional connection ✅

Shifted focus per product direction (2026-07-03): not more functionality,
an app worth opening again. Everything below touches the Living Water
Map, the Journal, visual summaries, or the emotional weight of a past
moment — nothing here is a new mechanism.

- [x] **The map pulses.** Alive and reawakened spots animate a gentle
      outward ring (CSS, disabled under `prefers-reduced-motion`) so the
      map reads as a living place at a glance, without tapping anything.
      *(Time-based lifecycle decay turned out not to need a scheduled
      job — it was already computed at read time from days-since-activity
      in Milestone 1; nothing to add there.)*
- [x] **The map opens on your world, not San Francisco.** Centers on the
      visitor's own (roughly) resolved location on load, falling back to
      an existing spot, then to the old hardcoded default, only if
      location isn't available. Also fixed a latent bug where spots
      loading after the map script finished would never get plotted —
      markers now re-render whenever the spot list changes, not just once.
- [x] **Spot Story tells a life story, not a spec sheet.** A one-line
      narrative strip — lifecycle dot, "discovered 12 days ago," a moment
      count — replaces a bare label row. Moments are grouped by day like a
      diary instead of one long flat list.
- [x] **Journal is designed for reflection.** Entries group under
      "Today" / "Yesterday" / weekday / date headers instead of a flat
      feed; cards show the moment's photo, not just its text. An
      **"On this day"** callout resurfaces a moment from the same
      month/day in a prior year when one exists (gracefully absent for
      new accounts — it's there for when the history exists).
- [x] **Beautiful, honest visual summaries.** A weekly activity
      sparkline (`ActivitySparkline`, following the dataviz skill's
      stat-tile "trend" contract — de-emphasis hue for past weeks, accent
      for the current one) sits with the existing moment/spot/species
      stats in the Journal; Profile's stat tiles got the same visual
      pass for consistency. Zero-activity weeks show a visible sliver
      baseline rather than looking broken.
- [x] **A moment worth celebrating.** Saving a moment that brings a dry
      spot back to "reawakened" now surfaces a one-time toast — the map's
      quietest, most emotionally-loaded state transition finally has a
      human-visible payoff, not just a color change on a map marker.
- [x] A restrained display typeface (`font-display`, system stack — no
      font fetched) is reserved for emotionally-resonant text only: a
      moment's note, a day header, a spot's name. Numbers and UI chrome
      stay in the sans face, per the dataviz skill's own guidance against
      display faces on stat values.

### Deferred (mechanism, not delight — revisit if usage shows a need)

- [ ] Marker clustering (not yet needed at current spot density).
- [ ] Reawakening push notifications (`notification.ts`) — the in-app
      toast covers the moment itself; a push notification is for
      *other* users of the same spot, a genuinely new mechanism.
- [ ] Collections (user-curated groupings of spots).

### Local mobile demo usability (2026-07-03)

Three follow-up bugs found while actually trying to use local/phone-LAN
preview as a real demo, after the getLoginUrl crash fix:

- [x] **Local Dev Admin auth fallback.** OAuth needs a Manus app id and a
      reachable OAuth server — neither exists locally, so every protected
      action (saving a moment) permanently failed with no way to sign in.
      `server/_core/context.ts` now synthesizes a persistent "Local Dev
      Admin" account, gated on both `!isProduction` and `OAUTH_SERVER_URL`
      being unset, so it can never activate in a real deployment. At this
      point still needed a local `DATABASE_URL` to actually persist
      anything — see the next entry for why that's no longer required
      either.
- [x] **"[Auth] Missing session cookie" log spam.** This fired on every
      single request in local dev (no cookie ever exists there) despite
      being the normal, expected state for an anonymous visitor, not an
      error. Now only logged when `isProduction`; behavior there is
      unchanged.
- [x] **Two real local-preview performance fixes**, not just perceived
      slowness: (1) `Map.tsx` was sending a real network request to
      `forge.butterfly-effect.dev` with an invalid key on every Map page
      load, and `loadMapScript()`'s promise never resolved on failure —
      it now skips the request entirely when no key is configured, and
      resolves either way. (2) The Manus debug-collector script (821
      lines, monkey-patches console/fetch/XHR, tracks every UI
      interaction) was injected on every dev page load unconditionally;
      it now only injects when `BUILT_IN_FORGE_API_URL` is set (a proxy
      for "running inside Manus's own hosted environment"), which it
      never is in a bare local checkout.

### Zero-dependency local demo mode (2026-07-03) ✅

No Docker, no MySQL. The Local Dev Admin fallback above still needed a
real `DATABASE_URL` to persist anything — this closes that last gap.

- [x] **In-memory data store** (`server/memoryStore.ts`). `server/db.ts`
      now resolves a `DataSource` per call — real MySQL when
      `DATABASE_URL` is set, otherwise the in-memory store, but *only*
      when `!isProduction`; production missing `DATABASE_URL` still
      throws exactly as before. Every pure transform
      (`groupObservationsIntoMoments`, `computeLifecycle`,
      `toSpotSummary`) is backend-agnostic by construction — it operates
      on already-fetched rows, so Map/Journal/Spots/Profile needed zero
      client-side changes to read from memory instead of SQL. Data resets
      on every server restart, deliberately.
- [x] **Photo/voice storage fallback.** Found while verifying the above
      end-to-end: photo capture — the app's primary flow — still failed
      locally even with the auth/data fixes, because `uploadMedia` also
      depends on Forge/S3 (`BUILT_IN_FORGE_API_URL`/`KEY`). `storagePut`
      now hands captured media back as a `data:` URL instead of throwing,
      gated the same way (`!isProduction` and Forge unconfigured).
- [x] Verified with a real end-to-end run (headless Chromium): uploaded a
      photo, tapped a water-interaction chip, saved — confirmed the
      moment then appears correctly on Spot Story, Journal (with correct
      stats), Spots list, and Profile, all auto-"signed in" as Local Dev
      Admin, zero page errors. Separately confirmed data comes back empty
      after a server restart, and that `NODE_ENV=production` with no
      `.env` throws `"Database not available"` on every data call and
      `auth.me` returns `null` (no auto-login) — production strictness
      intact.

## Content & clarity polish pass (2026-07-03)

User feedback after trying the demo with real intent to use it, not just
verify it doesn't crash. Framed as a correction pass, not new features —
five items implemented; four more scoped for later (below).

- [x] **Behavior terminology.** Ver.2 (local code) has both "Resting" and
      "Perching" as distinct behaviors — Ver.3 had simplified down to
      "Resting" only. Added "Perching" back rather than replacing
      "Resting", since Ver.2 treated them as different behaviors and
      guessing which one a past entry meant would reduce consistency, not
      improve it. `BEHAVIOR_OPTIONS` (and `WATER_CONDITIONS`, already
      shaped this way) are now `{value, label}` pairs everywhere — the
      concrete mechanism for translating UI text later without ever
      touching a stored value (see the Korean UI note below).
- [x] **Species suggestions.** Ver.2's species field turned out to be a
      plain, no-suggestions text input too (same pattern as everywhere
      else checked against Ver.2 in this project) — designed fresh rather
      than "restored". A ~50-bird common-species list, filtered as you
      type, shown as tap-to-fill chips (`SpeciesField` in Capture.tsx) —
      matches the existing chip language rather than introducing a new
      combobox/popover pattern. Typing any other name is always allowed.
- [x] **Navigation bug, found and fixed.** The back arrow called
      `navigate(-1 as unknown as string)` — wouter takes this literally
      as a path string, producing the URL `/-1`, which matches no route
      → 404. Reproduced with Playwright before fixing. Fix: plain
      `window.history.back()`. Re-verified with a realistic
      Map→Capture→back click sequence, not just a direct URL check.
- [x] **Clearer water/spot fields.** "Water level" → "Water condition"
      (matches the user's own framing exactly), with three ice-related
      values added: Frozen, Partially frozen, Snow/ice present — scoped
      into water condition rather than a separate "ice" section, since
      that's how the user described the concept and it needed no new UI.
      "What kind of spot is this?" gets a one-line clarifier
      ("The place itself, not today's water condition") so the two
      fields read as distinct at a glance.
- [x] **Local demo seed data.** `pnpm seed` (while `pnpm dev` is running)
      hits a dev-only route (blocked in production, same as everything
      else dev-only in this project) that populates 5 spots spanning
      different types and lifecycle states — including one that
      demonstrates "reawakened" and one moment backdated to exactly one
      year ago today, to actually exercise the Journal's "On this day"
      callout — plus placeholder photos (inline SVG data URIs, no
      external dependency), weather values, and a multi-sighting moment.
      Required adding optional, server-internal-only `createdAt`/
      `capturedAt` overrides to `createSpot`/`createMoment` — never in
      the tRPC router's input schema, so no real request can backdate
      anything.
- [x] Verified end-to-end with Playwright against the seeded data: all 5
      spots show their intended lifecycle state (alive/alive/dry/
      reawakened/alive), Journal shows correct 8/5/5 stats and the "On
      this day" callout, multi-sighting renders as "Drinking, Wading ·
      Mallard", zero page errors throughout.

### Deferred from this pass (scoped, not implemented)

- [ ] **Korean UI strings.** Labels are now structured to support this
      (see behavior terminology above) — the translation work itself is
      separate.
- [ ] **Weather/wind/temperature capture UI.** The columns already exist
      (unused in the capture flow); the seed data populates `weather` to
      be ready for it, but there's no UI to set it from Capture yet.
- [ ] **CSV export.** Scope as its own pass — likely a Profile-page
      action against `listUserJournal`, Excel format later.
- [ ] **Warmer/calmer visual direction.** "Less generic dashboard, more
      personal field journal" is a real, distinct design pass (typography,
      color, layout rhythm) — deserves its own dedicated look rather than
      being bundled into this bug-fix/content pass.

## Milestone 4 — AI layer

- [ ] Daily/monthly AI recaps, auto species/behavior suggestion, best-photo
      selection, shareable monthly stories.

## Milestone 5 — Native

- [ ] Package the PWA as a native mobile app.
