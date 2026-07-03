# Waterlog (Ver.3)

A mobile-first field journal for water and the birds who find it. Waterlog
is the successor to **Ver.2 "Brooktrack"**, a bird-sighting logger — the
research question is unchanged ("how do birds interact with water?"), but
the product is a full redesign: the **Water Spot** (a puddle, pond,
fountain, or any place water and birds meet) is the primary object, not the
bird sighting. See the full design proposal for the product philosophy,
information architecture, and reuse/redesign audit this project was built
from.

Ver.1 and Ver.2 are untouched. This is a separate project, built by copying
Ver.2's infrastructure layer (auth, tRPC/Drizzle pipeline, LLM/image/voice
services, Google Maps, S3 storage) and replacing its product layer (routers,
pages, navigation) from first principles.

## Stack

React 19 + Vite + TypeScript, tRPC v11, Drizzle ORM + MySQL, Express,
TailwindCSS 4 + shadcn/Radix UI, wouter routing — identical to Ver.2's
stack, reused as-is.

## Data model

**Product decision (2026-07-03): the database schema is still Ver.2's
original `users` / `locations` / `observations` tables, unchanged.**
Water Spot / Moment / Sighting are a product-language API layer over those
tables (see `server/db.ts`), not new database tables — deliberately, so the
new experience can be validated with real users before committing to a
schema redesign. Concretely:

- A **Water Spot** is a `locations` row. Its `waterResourceType` column
  doubles as the spot type (puddle/pond/fountain/…). Lifecycle state
  (alive/drying/dry/reawakened) is **computed at read time** from recent
  observations, not stored.
- A **Moment** is one or more `observations` rows sharing a moment group
  key (Milestone 2) — one row per bird **Sighting**, or a single
  `NO_SIGHTING` row for a plain water-spot check. `notes` → note,
  `photoUrl` → photoUrls (JSON-encoded array, reusing the same
  parse-or-wrap helper already used for behaviors), `waterDepth` → the
  quick-capture water condition, `primaryBehaviors`/`species`/`count` →
  each sighting — behavior leads, species is optional detail about it (see
  "Product principle" below). `species` holds one of two sentinels rather
  than requiring a nullable column: `"Unidentified bird"` (a bird was
  there, un-typed) or an internal `NO_SIGHTING` value (no bird at all —
  renders zero sightings, not a fake one).
- The **moment group key** lives in `distanceFromWater` — an unused
  legacy column Ver.3 never otherwise collects — holding a short random id
  shared by every row inserted from one capture. Rows reading it back
  group into one Moment with multiple Sightings; rows without one (or
  with a unique one) are simply their own singleton moment, so this is
  fully backward-compatible with the single-row moments earlier
  milestones already created. See `groupObservationsIntoMoments` in
  `server/db.ts`.

Revisit this once there's real usage data — see `MILESTONES.md`.

## Product principle: interaction over identification

The primary observation is not "a bird" — it's what the bird was doing
with water. Species matters, but it's secondary detail *about* the
interaction, not the headline. In the capture flow this means behavior
chips (Drinking/Bathing/Foraging/…) sit above the fold as the main action,
while species is a demoted, optional text field. Everywhere a moment is
displayed (Spot Story, Journal), behavior renders first and gets the
primary badge color; species trails. See `MILESTONES.md` for the pass that
implemented this and why it required a small server-side fix (see "Data
model" above).

## Capture features (Milestone 2)

- **Multi-photo**: up to 6 photos per moment.
- **Multi-sighting**: more than one bird per moment (a sparrow bathing
  while a pigeon drinks), each with its own behaviors and optional species.
- **Voice notes**: an alternative, faster-than-typing input for the note
  field. Recorded audio is transcribed (`server/_core/voiceTranscription.ts`)
  and the resulting text is merged into the note — the audio itself is not
  persisted or referenced anywhere in the database; it's an input method,
  not a stored asset.
- **Nearby-spot suggestion**: within ~25m of an existing spot, capture
  defaults to logging there instead of creating a duplicate (visibly, and
  overridable in one tap); within ~120m, nearby spots are offered as
  one-tap alternatives to "New spot." Computed client-side from the
  already-fetched spot list — no new backend query.

## Delight, not more features (Milestone 3)

From Milestone 3 on, the goal stopped being "add functionality" and
became "an app worth opening again after you get home." Everything here
touches an existing surface rather than adding a new one:

- **Living Water Map**: alive/reawakened spots pulse gently (CSS,
  respects `prefers-reduced-motion`); the map opens centered on the
  visitor's own location instead of a hardcoded San Francisco default;
  markers now re-render whenever the spot list changes instead of only
  once at map-ready time (a latent bug that could silently drop markers
  loaded after the map script finished).
- **Journal, designed for reflection**: entries group by day
  ("Today"/"Yesterday"/weekday/date) instead of a flat list; an
  **"On this day"** callout resurfaces a moment from the same date in a
  prior year, when one exists.
- **Spot Story as a life story**: a narrative strip ("discovered 12 days
  ago · 4 moments so far") replaces a bare label row.
- **Visual summaries**: a weekly activity sparkline (`ActivitySparkline`)
  next to the existing stats, built per the dataviz skill's stat-tile
  "trend" contract.
- **One emotional payoff**: a one-time toast when a moment brings a dry
  spot back to "reawakened."
- A restrained display typeface, reserved for a moment's note, a day
  header, or a spot's name — never for numbers or UI chrome.

## Getting started

```bash
pnpm install
cp .env.example .env   # fill in a Waterlog-specific Manus app id, DB, and Forge keys
pnpm dev
```

Without a filled-in `.env`, the app still builds and the shell/routing
render, but anything backed by the database or OAuth (spots, moments,
sign-in) will not function — see `.env.example` for what's required and
why it isn't fabricated here.

## Scripts

Same as Ver.2: `pnpm dev`, `pnpm build`, `pnpm start`, `pnpm check`
(`tsc --noEmit`), `pnpm test`, `pnpm db:push`.

## Status

See `MILESTONES.md` for what's built vs. planned.
