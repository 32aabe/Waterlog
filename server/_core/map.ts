/**
 * Google Maps Platform integration — direct, not proxied.
 *
 * Main function: makeRequest<T>(endpoint, params) - Makes authenticated
 * requests to Google's REST Maps APIs (currently just Geocoding; see the
 * reference block below for what else is enabled). Array parameters use
 * | as separator. This is the sole server-side touchpoint with Google
 * Maps — swapping providers later means rewriting this module's
 * internals only, not any of its callers (server/_core/geocode.ts).
 */

import { ENV } from "./env";

// ============================================================================
// Configuration
// ============================================================================

const GOOGLE_MAPS_BASE_URL = "https://maps.googleapis.com";

function getApiKey(): string {
  const apiKey = ENV.googleMapsApiKey;

  if (!apiKey) {
    throw new Error(
      "Google Maps server API key missing: set GOOGLE_MAPS_API_KEY"
    );
  }

  return apiKey;
}

// ============================================================================
// Core Request Handler
// ============================================================================

interface RequestOptions {
  method?: "GET" | "POST";
  body?: Record<string, unknown>;
}

/**
 * Make authenticated requests to Google Maps REST APIs
 *
 * @param endpoint - The API endpoint (e.g., "/maps/api/geocode/json")
 * @param params - Query parameters for the request
 * @param options - Additional request options
 * @returns The API response
 */
export async function makeRequest<T = unknown>(
  endpoint: string,
  params: Record<string, unknown> = {},
  options: RequestOptions = {}
): Promise<T> {
  const apiKey = getApiKey();

  const url = new URL(`${GOOGLE_MAPS_BASE_URL}${endpoint}`);

  // Add API key as query parameter (standard Google Maps API authentication)
  url.searchParams.append("key", apiKey);

  // Add other query parameters
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null) {
      url.searchParams.append(key, String(value));
    }
  });

  const response = await fetch(url.toString(), {
    method: options.method || "GET",
    headers: {
      "Content-Type": "application/json",
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `Google Maps API request failed (${response.status} ${response.statusText}): ${errorText}`
    );
  }

  return (await response.json()) as T;
}

// ============================================================================
// Type Definitions
// ============================================================================

export type LatLng = {
  lat: number;
  lng: number;
};

export type GeocodingResult = {
  results: Array<{
    address_components: Array<{
      long_name: string;
      short_name: string;
      types: string[];
    }>;
    formatted_address: string;
    geometry: {
      location: LatLng;
      location_type: string;
      viewport: {
        northeast: LatLng;
        southwest: LatLng;
      };
    };
    place_id: string;
    types: string[];
  }>;
  status: string;
};

// ============================================================================
// Google Maps API Reference
// ============================================================================

/**
 * GEOCODING - Convert between addresses and coordinates
 * Endpoint: /maps/api/geocode/json
 * Input: { address: string } OR { latlng: string }  // latlng: "37.42,-122.08"
 * Output: GeocodingResult  // results[0].geometry.location, results[0].formatted_address
 */

/**
 * PLACES (New) - not wired through makeRequest() above.
 *
 * Only the Geocoding API is called by this app today (see
 * server/_core/geocode.ts). Search/autocomplete is designed but
 * deliberately unbuilt (docs/design/01_MAP_SCREEN.md lists it "Hidden
 * Until Needed"). When it's built, note that Places API (New) is a
 * different shape from the REST APIs above — POST JSON (not GET query
 * params) to a different host (places.googleapis.com, not
 * maps.googleapis.com), authenticated via an X-Goog-Api-Key header (not
 * a `key` query param) plus an X-Goog-FieldMask header selecting the
 * response fields. Relevant endpoints:
 * - Autocomplete: POST https://places.googleapis.com/v1/places:autocomplete
 * - Text Search:  POST https://places.googleapis.com/v1/places:searchText
 * - Place Details: GET https://places.googleapis.com/v1/places/{place_id}
 */



