import type { SpotSummary } from "../../../server/db";

// Emergency, fully client-side demo dataset — see MapFallback.tsx and
// pages/DemoSpotDetail.tsx. Exists so the fallback map (shown whenever
// Google Maps or the server's own seeded spots aren't available) always
// looks populated, with a real submission link never depending on either
// one working. Type-only import of SpotSummary above is erased at build
// time (no server code — no DB access, no Express — ends up in the
// client bundle); only the shape is shared, never the implementation.

// The AIR study area's default map center/zoom — used wherever the app
// used to fall back to a hardcoded San Francisco default (components/
// Map.tsx's own MapView default, and MapHome's initialCenter when there's
// no user location yet). The midpoint of the two real spot clusters below
// (Brooklyn Bridge Park's piers, ~40.702/-73.996; Civic Center/Pace,
// ~40.715/-74.002), not an arbitrary landmark coordinate, so it stays
// correct if the seeded spots themselves ever move. Zoom picked so both
// clusters (~1.5km apart) sit comfortably inside a typical phone-width
// map card with margin, rather than either being cropped or the markers
// crowding together too small to tap individually.
export const AIR_STUDY_AREA_CENTER = { lat: 40.7087, lng: -73.9994 };
export const AIR_STUDY_AREA_ZOOM = 13.4;

// Client-side mirror of the server's WATERLOG_DEMO_MODE (see ENV.demoMode
// in server/_core/env.ts) — a separate VITE_-prefixed variable because the
// server's own env vars aren't exposed to the browser bundle. Deploying a
// demo must set both WATERLOG_DEMO_MODE=true and VITE_WATERLOG_DEMO_MODE=true
// (see README's Railway table); this one gates MapHome's use of real
// browser geolocation — off in demo mode so the map stays fixed on the
// NYC study area and never shows a real visitor's location, regardless of
// where the phone actually is.
export const DEMO_MODE = import.meta.env.VITE_WATERLOG_DEMO_MODE === "true";

export type DemoSpot = SpotSummary & {
  /** A short, static description — DemoSpotDetail.tsx's substitute for
   *  MapHome's spotSentence()/SpotStory's placeCharacterSentence(), both
   *  of which are derived from real moments this demo spot doesn't have.
   *  Fixed text, not date-fns math, so there's nothing here that can
   *  throw on a malformed date. */
  blurb: string;
};

// Negative ids, distinct from any real database id (which is always a
// positive auto-increment) — every place in the app that receives a
// SpotSummary can key off `id < 0` to recognize "this is a local demo
// spot, not a real one," most importantly MapHome's selected-spot sheet
// (routes "See its story"/"Log a moment" to the demo-safe destinations
// below instead of the real, server-backed ones).
const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
function agoDays(days: number, hours = 0): Date {
  return new Date(Date.now() - days * DAY_MS - hours * HOUR_MS);
}

export const AIR_DEMO_SPOTS: DemoSpot[] = [
  {
    id: -1,
    creatorId: 0,
    name: "Pier 1 Bridge View Pond",
    latitude: "40.7027",
    longitude: "-73.9963",
    placeName: "Brooklyn Bridge Park",
    spotType: "pond",
    lifecycleState: "alive",
    waterState: "full",
    firstSeenAt: agoDays(400),
    lastActivityAt: agoDays(0, 3),
    momentCount: 2,
    blurb:
      "A calm pond at Pier 1 with a straight-on view of the Brooklyn Bridge — sparrows and gulls both stop here to drink and bathe.",
  },
  {
    id: -2,
    creatorId: 0,
    name: "Pier 1 Long Pond",
    latitude: "40.7032",
    longitude: "-73.9970",
    placeName: "Brooklyn Bridge Park",
    spotType: "pond",
    lifecycleState: "alive",
    waterState: "full",
    firstSeenAt: agoDays(15),
    lastActivityAt: agoDays(1),
    momentCount: 2,
    blurb:
      "A longer stretch of water nearby, busier than its neighbor — starlings, pigeons, and the occasional resting mallard.",
  },
  {
    id: -3,
    creatorId: 0,
    name: "Pier 2 Intertidal Rocky Shore",
    latitude: "40.7008",
    longitude: "-73.9954",
    placeName: "Brooklyn Bridge Park",
    spotType: "wetland",
    lifecycleState: "reawakened",
    waterState: "after_rain",
    firstSeenAt: agoDays(45),
    lastActivityAt: agoDays(0),
    momentCount: 2,
    blurb:
      "A tidal rock shelf that empties and refills twice a day — cormorants dry their wings when it's exposed, herons work the waterline once the tide's back in.",
  },
  {
    id: -4,
    creatorId: 0,
    name: "Foley Square",
    latitude: "40.7141",
    longitude: "-74.0021",
    placeName: "Civic Center, Manhattan",
    spotType: "puddle",
    lifecycleState: "dry",
    waterState: "dry",
    firstSeenAt: agoDays(20),
    lastActivityAt: agoDays(6),
    momentCount: 1,
    blurb:
      "A civic plaza built over the edge of Manhattan's historic Collect Pond — usually dry pavement, occasionally holding a puddle after rain.",
  },
  {
    id: -5,
    creatorId: 0,
    name: "Thomas Paine Park",
    latitude: "40.7146",
    longitude: "-74.0027",
    placeName: "Civic Center, Manhattan",
    spotType: "temporary_pool",
    lifecycleState: "drying",
    waterState: "shallow",
    firstSeenAt: agoDays(20),
    lastActivityAt: agoDays(4),
    momentCount: 1,
    blurb: "A small park beside the courthouses, still settling after a recent rain — sparrows visit what's left of the pooled water.",
  },
  {
    id: -6,
    creatorId: 0,
    name: "Collect Pond Park",
    latitude: "40.7168",
    longitude: "-74.0026",
    placeName: "Civic Center, Manhattan",
    spotType: "pond",
    lifecycleState: "alive",
    waterState: "full",
    firstSeenAt: agoDays(5),
    lastActivityAt: agoDays(0, 1),
    momentCount: 1,
    blurb: "A reflecting pool marking the site of the old Collect Pond itself — geese and mallards both use it regularly.",
  },
];

export function isDemoSpotId(id: number): boolean {
  return id < 0;
}

export function getDemoSpotById(id: number): DemoSpot | null {
  return AIR_DEMO_SPOTS.find(s => s.id === id) ?? null;
}
