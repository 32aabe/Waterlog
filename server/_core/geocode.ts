import { makeRequest, type GeocodingResult } from "./map";

// Quietly turns coordinates into a short, nameable phrase for the
// Capture dateline and the spot's placeName (see docs/03_DESIGN_MANIFESTO.md
// §6, §15 — AI fills context in ambiently, never asks for it). Reverse
// geocoding needs a GOOGLE_MAPS_API_KEY that isn't present in local/
// offline dev (see .env.example), and even when configured, a coordinate
// may not resolve to anything short and nameable. Always resolves to
// null rather than throwing, so a slow or failed lookup never blocks or
// breaks the capture flow it's enriching.
const NAME_TYPE_PRIORITY = [
  "point_of_interest",
  "park",
  "establishment",
  "neighborhood",
  "sublocality_level_1",
  "sublocality",
];

export async function describeLocation(lat: number, lng: number): Promise<string | null> {
  try {
    const result = await makeRequest<GeocodingResult>("/maps/api/geocode/json", {
      latlng: `${lat},${lng}`,
    });
    if (result.status !== "OK" || result.results.length === 0) return null;

    for (const type of NAME_TYPE_PRIORITY) {
      for (const r of result.results) {
        const match = r.address_components.find(c => c.types.includes(type));
        if (match) return match.long_name;
      }
    }
    // A locality ("Brooklyn") still beats a bare coordinate pair.
    const locality = result.results[0].address_components.find(c => c.types.includes("locality"));
    return locality?.long_name ?? null;
  } catch (err) {
    // Logged, not swallowed — the most common cause is exactly the one
    // named in ./map.ts's own error: GOOGLE_MAPS_API_KEY missing from
    // the server environment (see .env.example). Still resolves to null
    // either way so a slow or misconfigured lookup never blocks or
    // breaks Capture.
    console.error("[geocode] describeLocation failed:", err instanceof Error ? err.message : err);
    return null;
  }
}
