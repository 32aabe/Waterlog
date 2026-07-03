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
- A **Moment** (with exactly one **Sighting**) is an `observations` row.
  `notes` → note, `photoUrl` → photoUrls (single-element), `waterDepth` →
  the quick-capture water condition, `species`/`count`/`primaryBehaviors` →
  the sighting. A moment without a confirmed bird defaults `species` to
  `"Unidentified bird"` rather than requiring a schema change.

Revisit this once there's real usage data — see `MILESTONES.md`.

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
