/**
 * GOOGLE MAPS FRONTEND INTEGRATION - ESSENTIAL GUIDE
 *
 * USAGE FROM PARENT COMPONENT:
 * ======
 *
 * const mapRef = useRef<google.maps.Map | null>(null);
 *
 * <MapView
 *   initialCenter={{ lat: 40.7128, lng: -74.0060 }}
 *   initialZoom={15}
 *   onMapReady={(map) => {
 *     mapRef.current = map; // Store to control map from parent anytime, google map itself is in charge of the re-rendering, not react state.
 * </MapView>
 *
 * ======
 * Available Libraries and Core Features:
 * -------------------------------
 * 📍 MARKER (from `marker` library)
 * - Attaches to map using { map, position }
 * new google.maps.marker.AdvancedMarkerElement({
 *   map,
 *   position: { lat: 37.7749, lng: -122.4194 },
 *   title: "San Francisco",
 * });
 *
 * -------------------------------
 * 🏢 PLACES (from `places` library)
 * - Does not attach directly to map; use data with your map manually.
 * const place = new google.maps.places.Place({ id: PLACE_ID });
 * await place.fetchFields({ fields: ["displayName", "location"] });
 * map.setCenter(place.location);
 * new google.maps.marker.AdvancedMarkerElement({ map, position: place.location });
 *
 * -------------------------------
 * 🧭 GEOCODER (from `geocoding` library)
 * - Standalone service; manually apply results to map.
 * const geocoder = new google.maps.Geocoder();
 * geocoder.geocode({ address: "New York" }, (results, status) => {
 *   if (status === "OK" && results[0]) {
 *     map.setCenter(results[0].geometry.location);
 *     new google.maps.marker.AdvancedMarkerElement({
 *       map,
 *       position: results[0].geometry.location,
 *     });
 *   }
 * });
 *
 * -------------------------------
 * 📐 GEOMETRY (from `geometry` library)
 * - Pure utility functions; not attached to map.
 * const dist = google.maps.geometry.spherical.computeDistanceBetween(p1, p2);
 *
 * -------------------------------
 * 🛣️ ROUTES (from `routes` library)
 * - Combines DirectionsService (standalone) + DirectionsRenderer (map-attached)
 * const directionsService = new google.maps.DirectionsService();
 * const directionsRenderer = new google.maps.DirectionsRenderer({ map });
 * directionsService.route(
 *   { origin, destination, travelMode: "DRIVING" },
 *   (res, status) => status === "OK" && directionsRenderer.setDirections(res)
 * );
 *
 * -------------------------------
 * 🌦️ MAP LAYERS (attach directly to map)
 * - new google.maps.TrafficLayer().setMap(map);
 * - new google.maps.TransitLayer().setMap(map);
 * - new google.maps.BicyclingLayer().setMap(map);
 *
 * -------------------------------
 * ✅ SUMMARY
 * - “map-attached” → AdvancedMarkerElement, DirectionsRenderer, Layers.
 * - “standalone” → Geocoder, DirectionsService, DistanceMatrixService, ElevationService.
 * - “data-only” → Place, Geometry utilities.
 */

/// <reference types="@types/google.maps" />

import { useEffect, useRef } from "react";
import { usePersistFn } from "@/hooks/usePersistFn";
import { cn } from "@/lib/utils";

declare global {
  interface Window {
    google?: typeof google;
  }
}

const API_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GOOGLE_MAPS_BASE_URL = "https://maps.googleapis.com";

// Module-level, not component-level: both useGoogleMapsAvailable() and
// MapView call loadMapScript() independently, and MapHome fully unmounts/
// remounts on every route change (Map -> Spot -> back), so without this
// cache every one of those call sites — on every single visit to the Map
// — injected another live copy of the Google Maps bootstrap script into
// the page. Google's own docs warn that including the script more than
// once "may cause unexpected errors" (duplicated library registration,
// markers/state behaving inconsistently) — this is what was actually
// causing spots to go missing after Spot -> back navigation, not
// anything in the marker-plotting logic itself. Reset to null on a
// failed load so a transient network blip can still retry on the next
// call, rather than permanently caching a failure.
let mapScriptPromise: Promise<void> | null = null;

export function loadMapScript(): Promise<void> {
  if (mapScriptPromise) return mapScriptPromise;

  mapScriptPromise = new Promise(resolve => {
    if (window.google?.maps) {
      // Already loaded by an earlier call in this page's lifetime (or
      // survived a dev HMR reset of this module) — nothing to inject.
      resolve();
      return;
    }
    if (!API_KEY) {
      // No Google Maps key configured — the common case for a bare
      // local or phone-LAN preview. Resolve immediately instead of
      // letting the browser attempt (and slowly fail, over a real
      // network hop to Google) a request with an invalid key — that
      // failed request was a real contributor to slow page loads, and
      // previously left the map hung forever besides, since onerror
      // never resolved this promise.
      console.warn("[Map] VITE_GOOGLE_MAPS_API_KEY not set — map tiles won't load in this preview.");
      resolve();
      return;
    }
    const script = document.createElement("script");
    script.src = `${GOOGLE_MAPS_BASE_URL}/maps/api/js?key=${API_KEY}&v=weekly&libraries=marker,places,geocoding,geometry`;
    script.async = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      resolve();
      script.remove(); // Clean up immediately
    };
    script.onerror = () => {
      console.error("Failed to load Google Maps script");
      mapScriptPromise = null;
      resolve();
    };
    document.head.appendChild(script);
  });

  return mapScriptPromise;
}

interface MapViewProps {
  className?: string;
  initialCenter?: google.maps.LatLngLiteral;
  initialZoom?: number;
  onMapReady?: (map: google.maps.Map) => void;
  /**
   * A JSON style array (google.maps.MapTypeStyle[]) for muting roads/labels
   * and emphasizing natural features. Only takes effect on a raster map
   * (mapId-based vector maps must be styled from the Cloud Console
   * instead) — harmless no-op otherwise, so callers should still pair it
   * with their own CSS-level softening as a guaranteed fallback.
   */
  mapStyles?: google.maps.MapTypeStyle[];
}

export function MapView({
  className,
  initialCenter = { lat: 37.7749, lng: -122.4194 },
  initialZoom = 12,
  onMapReady,
  mapStyles,
}: MapViewProps) {
  const mapContainer = useRef<HTMLDivElement>(null);
  const map = useRef<google.maps.Map | null>(null);

  const init = usePersistFn(async () => {
    await loadMapScript();
    if (!mapContainer.current) {
      console.error("Map container not found");
      return;
    }
    if (!window.google?.maps) {
      // loadMapScript() skipped or failed (no API key / network error) —
      // leave the container as an empty placeholder rather than throw.
      return;
    }
    map.current = new window.google.maps.Map(mapContainer.current, {
      zoom: initialZoom,
      center: initialCenter,
      // A relationship landscape isn't a navigation tool, so the usual
      // map chrome (satellite toggle, street view peg-man, fullscreen)
      // is left off entirely rather than competing with the spots
      // themselves. Pinch/scroll zoom still works without a visible
      // control. See docs/design/01_MAP_SCREEN.md.
      disableDefaultUI: true,
      mapId: "DEMO_MAP_ID",
      styles: mapStyles,
    });
    if (onMapReady) {
      onMapReady(map.current);
    }
  });

  useEffect(() => {
    init();
  }, [init]);

  return (
    <div ref={mapContainer} className={cn("w-full h-[500px]", className)} />
  );
}
