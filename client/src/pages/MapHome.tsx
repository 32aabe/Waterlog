import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";
import { MapView } from "@/components/Map";
import { MapFallback } from "@/components/MapFallback";
import { useGoogleMapsAvailable } from "@/hooks/useGoogleMapsAvailable";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getLoginUrl } from "@/const";
import { APP_NAME, APP_TAGLINE, getSpotTypeLabel } from "@/const";
import { spawnRipple } from "@/lib/ripple";
import { markColor, markCoreColor, markPresence, relationshipDepth, rippleMarkMetrics, PULSING_WATER_STATES } from "@/lib/spotVisual";
import { LocateFixed, Plus, Waves } from "lucide-react";
import { cn } from "@/lib/utils";
import type { SpotSummary } from "../../../server/db";

// Module-level, not component-level — same reasoning as loadMapScript's
// mapScriptPromise cache in components/Map.tsx: MapHome fully unmounts and
// remounts on every route change (Map -> Capture -> Spot -> Map is three
// such remounts), which resets every useState back to its initial value.
// Without this, the "you are here" marker depended entirely on a *fresh*
// geolocation call succeeding on every single remount — and Capture.tsx
// independently makes its own geolocation call on its own mount, so by the
// time a visitor is back on the Map, this is already the request's second
// or third call in quick succession. Real desktop/Windows location
// services are documented (see Capture.tsx's own GEOLOCATION_OPTIONS-
// adjacent comments) to sometimes return POSITION_UNAVAILABLE on rapid
// repeated calls even with permission granted — so a remount's fresh call
// failing was silently read as "no location," even though a perfectly
// good fix from moments earlier still existed. Caching it here means a
// remount shows the last known position immediately while a fresh fetch
// updates it in the background, instead of the marker disappearing
// whenever that background fetch happens not to land.
let cachedUserCoords: { lat: number; lng: number } | null = null;

// A muted, mostly-monochrome style so the map reads as a landscape
// rather than a navigation tool: roads and labels recede, water and
// natural areas carry what little color remains. Only takes effect on a
// raster map (a mapId's vector styling lives in the Cloud Console
// instead) — the CSS filter below on the map's container is the
// guaranteed fallback either way. See docs/design/01_MAP_SCREEN.md.
const WATERLOG_MAP_STYLE: google.maps.MapTypeStyle[] = [
  { elementType: "geometry", stylers: [{ color: "#eef1ea" }] },
  { elementType: "labels.icon", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.stroke", stylers: [{ visibility: "off" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#a6b0ac" }] },
  { featureType: "poi", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#e3e2d6" }] },
  { featureType: "road", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#dad6c2" }] },
  { featureType: "road.arterial", elementType: "geometry", stylers: [{ visibility: "simplified" }] },
  { featureType: "road.local", elementType: "geometry", stylers: [{ visibility: "simplified" }] },
  { featureType: "administrative", elementType: "geometry", stylers: [{ visibility: "off" }] },
  { featureType: "administrative.locality", elementType: "labels.text.fill", stylers: [{ color: "#8b9997" }] },
  { featureType: "administrative.neighborhood", stylers: [{ visibility: "off" }] },
  { featureType: "landscape.natural", elementType: "geometry", stylers: [{ color: "#e4ead9" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#dbe6d2" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#9ab7b8" }] },
  { featureType: "water", elementType: "labels", stylers: [{ visibility: "off" }] },
];

// Class applied to the map's outer shell to scope the tile-muting filter
// (see .waterlog-map-tiles in index.css) to Google's own base tile/canvas
// element only, not the AdvancedMarkerElement overlay panes that render
// inside the same `.gm-style` subtree. Replaces an earlier ancestor-level
// `filter` that muted the whole subtree indiscriminately: since a CSS
// filter on a parent cannot be un-done by a descendant, that approach
// necessarily crushed marker color/contrast right along with the tiles —
// directly the "markers feel washed out" problem. Scoping to `.gm-style >
// div:first-child` (documented, long-stable Google Maps DOM structure:
// that first child is always the base render layer; overlay panes for
// markers/controls are later siblings within the same `.gm-style`) mutes
// only the tiles, leaving markers at full color and contrast.
const MAP_TILES_CLASS = "waterlog-map-tiles";

// The "you are here" mark — deliberately not built from rippleMarkMetrics
// like a Spot: a ring around a small solid dot, wrapped in a soft
// low-opacity accuracy halo, rather than a single filled-and-glowing
// circle. Different shape *and* different color (--location-mark, not
// any --water-* token) so it can never be mistaken for a Spot at a
// glance — this marks the visitor, not a relationship with a place.
function createUserLocationMarkerContent(): HTMLDivElement {
  const wrap = document.createElement("div");
  wrap.style.position = "relative";
  wrap.style.width = "26px";
  wrap.style.height = "26px";

  const halo = document.createElement("div");
  halo.style.position = "absolute";
  halo.style.inset = "0";
  halo.style.borderRadius = "9999px";
  halo.style.background = "var(--location-mark)";
  halo.style.opacity = "0.16";
  wrap.appendChild(halo);

  const ring = document.createElement("div");
  ring.style.position = "absolute";
  ring.style.top = "50%";
  ring.style.left = "50%";
  ring.style.width = "14px";
  ring.style.height = "14px";
  ring.style.borderRadius = "9999px";
  ring.style.transform = "translate(-50%, -50%)";
  ring.style.border = "2px solid var(--location-mark)";
  ring.style.background = "var(--card)";
  // A drop-shadow independent of whatever's under the mark — the tile
  // muting in index.css (.waterlog-map-tiles) no longer washes this out,
  // but tile color underneath still varies (water vs. land vs. a park),
  // so this keeps the ring readable against any of them at a glance.
  ring.style.boxShadow = "0 1px 3px rgba(33, 47, 48, 0.35)";
  wrap.appendChild(ring);

  const dot = document.createElement("div");
  dot.style.position = "absolute";
  dot.style.top = "50%";
  dot.style.left = "50%";
  dot.style.width = "6px";
  dot.style.height = "6px";
  dot.style.borderRadius = "9999px";
  dot.style.transform = "translate(-50%, -50%)";
  dot.style.background = "var(--location-mark)";
  wrap.appendChild(dot);

  return wrap;
}

// A Spot card describes the place's arc, not its most recent checkup —
// how long it's been known, how many memories have gathered there, and
// (for the one moment worth marking) that it just came back. Never
// mentions a bird; the place is always the subject.
function spotSentence(spot: SpotSummary): string {
  const since = formatDistanceToNow(new Date(spot.lastActivityAt), { addSuffix: true });
  const knownFor = formatDistanceToNowStrict(new Date(spot.firstSeenAt));
  const memories = spot.momentCount === 1 ? "one memory" : `${spot.momentCount} memories`;
  const memoriesCap = memories.charAt(0).toUpperCase() + memories.slice(1);

  switch (spot.lifecycleState) {
    case "reawakened":
      return `Dry, then alive again — water returned ${since}. ${memoriesCap} gathered here since it was first found ${knownFor} ago.`;
    case "alive":
      return spot.momentCount > 0
        ? `Quietly gathering memories for ${knownFor} now — ${memories} so far.`
        : `Just found. Its story is only beginning.`;
    case "drying":
      return `Slowing down, after ${knownFor} of gathering ${memories}.`;
    case "dry":
    default:
      return `Gone quiet for now, after ${knownFor} of gathering ${memories}.`;
  }
}

export default function MapHome() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { data: spots, isLoading } = trpc.spots.list.useQuery();
  const [selected, setSelected] = useState<SpotSummary | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const markersRef = useRef<google.maps.marker.AdvancedMarkerElement[]>([]);
  const userMarkerRef = useRef<google.maps.marker.AdvancedMarkerElement | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Resolve the visitor's own location (once, briefly) so the map opens
  // centered on somewhere that means something to them, rather than
  // always defaulting to San Francisco. Falls back to an existing spot,
  // then to the map component's own default, if location isn't available.
  // Deliberately requested *before* the Maps script below — see
  // useGoogleMapsAvailable's own comment: loading the Maps SDK
  // concurrently with this used to starve the geolocation callback of
  // main-thread time for several seconds, making it look like a timeout
  // even though the call itself fired immediately.
  const [userCoords, setUserCoordsState] = useState<{ lat: number; lng: number } | null>(() => cachedUserCoords);
  // Already-settled on a remount that has a cached fix — the cached
  // position is good enough to render immediately; requestLocation()
  // below still runs to refresh it, just without gating the first paint
  // on that refresh succeeding.
  const [locationSettled, setLocationSettled] = useState(() => cachedUserCoords !== null);

  const setUserCoords = useCallback((coords: { lat: number; lng: number }) => {
    cachedUserCoords = coords;
    setUserCoordsState(coords);
  }, []);
  // Only for the manual recenter button below — true for the (usually
  // brief, but real-hardware-dependent) span between tap and callback, so
  // the button can give quiet, immediate feedback instead of feeling
  // unresponsive. Mount-time requestLocation() doesn't use this; its own
  // spinner already covers that wait.
  const [isLocating, setIsLocating] = useState(false);

  const requestLocation = useCallback(() => {
    if (!navigator.geolocation) {
      console.error("[MapHome] navigator.geolocation is unavailable — unsupported browser, or a non-secure context (must be https, or localhost).");
      setLocationSettled(true);
      return;
    }
    const timeout = setTimeout(() => {
      console.error(
        "[MapHome] geolocation never called back within 10s — the browser neither returned a position nor an error. Often caused by an insecure context (http, not https/localhost) or the request silently hanging. Falling back to a seeded spot's location.",
      );
      setLocationSettled(true);
    }, 10000);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationSettled(true);
        clearTimeout(timeout);
      },
      err => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "location permission denied"
            : err.code === err.POSITION_UNAVAILABLE
              ? "location unavailable — check that OS-level location services are turned on"
              : "location request timed out";
        console.error(`[MapHome] geolocation failed (${reason}, code ${err.code}${err.message ? ` — ${err.message}` : ""}). Falling back to a seeded spot's location.`);
        setLocationSettled(true);
        clearTimeout(timeout);
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  useEffect(() => {
    requestLocation();
    // requestLocation is stable (useCallback, empty deps) — this should
    // only run once on mount, same as before.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // null until locationSettled flips true — MapView isn't mounted and
  // the fallback isn't shown yet either, so a fast, working load never
  // flashes the fallback landscape first. Gated on locationSettled (not
  // loaded eagerly on mount) so the Maps bootstrap script never competes
  // with the geolocation request above — see useGoogleMapsAvailable.
  const mapsAvailable = useGoogleMapsAvailable(locationSettled);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  // The real map's own recenter control — MapFallback already has one
  // (onLocate={requestLocation}) for its CSS/SVG landscape, but nothing
  // equivalent existed once real Google tiles were showing. Deliberately
  // separate from the mount-time requestLocation() above: a fresh
  // request here, and on success, an imperative panTo() — MapView's
  // initialCenter prop only ever applies at the map's original
  // construction, so moving an already-live map needs its instance
  // directly. panTo (not setCenter) so the move eases like water rather
  // than snapping, per docs/design/01_MAP_SCREEN.md's motion principles.
  const handleLocateClick = useCallback(() => {
    if (!navigator.geolocation) {
      console.error("[MapHome] navigator.geolocation is unavailable — unsupported browser, or a non-secure context (must be https, or localhost).");
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      pos => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        mapRef.current?.panTo(coords);
        setIsLocating(false);
      },
      err => {
        const reason =
          err.code === err.PERMISSION_DENIED
            ? "location permission denied"
            : err.code === err.POSITION_UNAVAILABLE
              ? "location unavailable — check that OS-level location services are turned on"
              : "location request timed out";
        console.error(`[MapHome] manual recenter failed (${reason}, code ${err.code}${err.message ? ` — ${err.message}` : ""}).`);
        setIsLocating(false);
      },
      // maximumAge: 0 — this is a deliberate "where am I right now" tap,
      // not the mount-time best-effort fetch above. A cached fix (even a
      // recent one) would silently defeat the button: a browser is
      // allowed to satisfy maximumAge from its own cache regardless of
      // how much the visitor has actually moved since the first request.
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 0 },
    );
  }, []);

  // Keeps the "you are here" mark in sync with userCoords regardless of
  // source — mount-time requestLocation() or the manual button above —
  // rather than duplicating marker-creation logic in both places. Only
  // moves an existing marker's .position after the first fix; no need to
  // ever recreate it, unlike the spot markers below which do get rebuilt
  // (their list itself changes, not just one coordinate).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !userCoords || !window.google?.maps?.marker) return;

    if (userMarkerRef.current) {
      userMarkerRef.current.position = userCoords;
    } else {
      userMarkerRef.current = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: userCoords,
        content: createUserLocationMarkerContent(),
        title: "Your location",
      });
    }
  }, [userCoords, mapReady]);

  // Re-plot markers whenever the spot list (or the map itself) changes,
  // rather than only once at map-ready time — spots.list can resolve
  // after the map finishes loading its script. No-ops entirely when
  // real map tiles aren't available; MapFallback renders its own marks.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !spots || !window.google?.maps?.marker) return;

    markersRef.current.forEach(marker => (marker.map = null));
    markersRef.current = [];

    spots.forEach(spot => {
      const depth = relationshipDepth(spot);
      const color = markColor(spot);
      const coreColor = markCoreColor(spot);
      const presence = markPresence(spot);
      const { haloSize, coreSize, glowBlur, glowSpread } = rippleMarkMetrics(depth);

      const mark = document.createElement("div");
      mark.style.position = "relative";
      mark.style.width = `${haloSize}px`;
      mark.style.height = `${haloSize}px`;
      mark.style.opacity = `${presence}`;
      if (PULSING_WATER_STATES.has(spot.waterState)) {
        mark.classList.add("map-pulse");
        mark.style.color = color;
      }

      const core = document.createElement("div");
      core.style.position = "absolute";
      core.style.top = "50%";
      core.style.left = "50%";
      core.style.width = `${coreSize}px`;
      core.style.height = `${coreSize}px`;
      core.style.borderRadius = "50%";
      core.style.transform = "translate(-50%, -50%)";
      core.style.background = coreColor;
      // A thin near-white edge plus a shadow independent of the glow color
      // above — the glow alone can thin out against a similarly-colored
      // tile underneath (e.g. an Alive spot's blue glow over water); this
      // keeps the core's silhouette readable against any tile color.
      core.style.border = "1.5px solid rgba(255, 255, 255, 0.85)";
      core.style.boxShadow = `0 0 ${glowBlur}px ${glowSpread}px ${color}, 0 1px 3px rgba(33, 47, 48, 0.3)`;
      mark.appendChild(core);

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: Number(spot.latitude), lng: Number(spot.longitude) },
        content: mark,
        title: spot.name ?? getSpotTypeLabel(spot.spotType),
      });
      marker.addListener("click", () => {
        setSelected(spot);
        spawnRipple(mark, color);
      });
      markersRef.current.push(marker);
    });
  }, [spots, mapReady]);

  const initialCenter =
    userCoords ?? (spots && spots.length > 0 ? { lat: Number(spots[0].latitude), lng: Number(spots[0].longitude) } : undefined);

  // null in local dev / mobile-LAN preview, where OAuth isn't configured
  // — the map (and everything else) still renders, sign-in just isn't
  // offered as a live, broken link.
  const loginUrl = getLoginUrl();

  return (
    <div className="settle-in flex min-h-[100dvh] flex-col pb-24">
      <header className="px-4 pt-[calc(env(safe-area-inset-top)+1.25rem)] pb-2">
        <h1 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
          <Waves className="h-5 w-5 text-primary" />
          {APP_NAME}
        </h1>
        <p className="mt-0.5 text-xs text-muted-foreground">{APP_TAGLINE}</p>
        {!isAuthenticated && (
          <p className="mt-1.5 text-xs">
            {loginUrl ? (
              <a href={loginUrl} className="text-muted-foreground underline underline-offset-2 hover:text-foreground">
                Sign in to keep your own map
              </a>
            ) : (
              <span className="text-muted-foreground" title="OAuth isn't configured in this preview">
                Sign-in isn't available in this preview yet
              </span>
            )}
          </p>
        )}
      </header>

      <div
        className={cn(
          "relative mx-4 mt-2 overflow-hidden rounded-2xl border border-border",
          mapsAvailable !== false && MAP_TILES_CLASS,
        )}
        style={{ height: "58vh" }}
      >
        {mapsAvailable === false ? (
          <MapFallback
            spots={spots ?? []}
            userCoords={userCoords}
            onSelect={setSelected}
            onLocate={requestLocation}
          />
        ) : locationSettled && mapsAvailable ? (
          <>
            <MapView
              className="h-full w-full"
              initialCenter={initialCenter}
              onMapReady={handleMapReady}
              initialZoom={12.85}
              mapStyles={WATERLOG_MAP_STYLE}
            />
            <button
              type="button"
              aria-label="Recenter on my location"
              aria-busy={isLocating}
              onClick={handleLocateClick}
              className={cn(
                "absolute bottom-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-card/90 shadow",
                // Reuses the app's one recurring motion gesture (see
                // .map-pulse in index.css) rather than a spinner — quiet,
                // already respects prefers-reduced-motion, and the first
                // ring's opacity is visible from t=0, so tapping reads as
                // acknowledged immediately rather than doing nothing.
                isLocating ? "map-pulse text-[var(--location-mark)]" : "text-muted-foreground",
              )}
            >
              <LocateFixed className="h-4 w-4" />
            </button>
          </>
        ) : (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        )}
        {mapsAvailable && locationSettled && isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Spinner />
          </div>
        )}
      </div>

      {spots && spots.length === 0 && !isLoading && (
        <div className="mx-4 mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          AIR demo places are ready. These are the water sites observed
          around Brooklyn Bridge Park and Pace.
        </div>
      )}

      {selected && (
        <div className="settle-in fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-4">
          <div className="rounded-2xl border border-border bg-card p-5 shadow-lg">
            <p className="font-display text-base text-foreground">
              {selected.name || getSpotTypeLabel(selected.spotType)}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {selected.placeName || `${Number(selected.latitude).toFixed(4)}, ${Number(selected.longitude).toFixed(4)}`}
            </p>
            <p className="mt-2.5 text-sm text-foreground/90">{spotSentence(selected)}</p>
            <div className="mt-4 flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => navigate(`/spot/${selected.id}`)}>
                See its story
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="flex-1"
                onClick={() => navigate(`/capture?spotId=${selected.id}`)}
              >
                <Plus className="h-4 w-4" /> Log a moment
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
