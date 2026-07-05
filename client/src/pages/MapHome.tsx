import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { formatDistanceToNow, formatDistanceToNowStrict } from "date-fns";
import { MapView } from "@/components/Map";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { getLoginUrl } from "@/const";
import { APP_NAME, APP_TAGLINE, getSpotTypeLabel } from "@/const";
import { spawnRipple } from "@/lib/ripple";
import { Plus, Waves } from "lucide-react";
import type { SpotSummary } from "../../../server/db";

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

// Guaranteed softening regardless of whether WATERLOG_MAP_STYLE takes
// effect (vector map IDs ignore client-side styles entirely) — a uniform
// wash over the whole rendered map, the same trick as looking at a
// street through rained-on glass.
const MAP_SOFTEN_FILTER = "saturate(0.6) contrast(0.94) brightness(1.03) sepia(0.06)";

// A spot's relationship depth: not a score, never shown as a number, and
// deliberately blended from two slow-moving signals rather than visit
// count alone (docs/design/01_MAP_SCREEN.md, "the exact algorithm should
// remain intentionally invisible"). Saturates gently so a handful of
// visits or a couple of months already reads as "known," rather than
// requiring dozens before the mark visibly settles.
function relationshipDepth(spot: SpotSummary): number {
  const daysKnown = (Date.now() - new Date(spot.firstSeenAt).getTime()) / 86_400_000;
  const momentDepth = 1 - 1 / (1 + spot.momentCount / 4);
  const timeDepth = 1 - 1 / (1 + daysKnown / 45);
  return Math.min(1, (momentDepth + timeDepth) / 2);
}

// Cool and faint at first (a quiet, barely-there mark), passing through
// the app's own rich water-blue as the mark "becomes richer," and only
// settling warm at real depth — color as the accumulation of a
// relationship, never a status light. color-mix over CSS variables (not
// hardcoded hex) so this follows the light/dark theme automatically,
// the same trick already used for --line in index.css.
function depthColor(depth: number): string {
  if (depth < 0.5) {
    const t = Math.round((depth / 0.5) * 100);
    return `color-mix(in oklab, var(--water-deep) ${t}%, var(--water-soft) ${100 - t}%)`;
  }
  const t = Math.round(((depth - 0.5) / 0.5) * 100);
  return `color-mix(in oklab, var(--warm) ${t}%, var(--water-deep) ${100 - t}%)`;
}

// Motion is still rationed like warmth: only a spot coming back from dry
// gets the looping ripple. Depth alone never animates — if everything on
// the map moved, nothing would feel earned.
const PULSING_STATES = new Set(["reawakened"]);

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
  const [mapReady, setMapReady] = useState(false);

  // Resolve the visitor's own location (once, briefly) so the map opens
  // centered on somewhere that means something to them, rather than
  // always defaulting to San Francisco. Falls back to an existing spot,
  // then to the map component's own default, if location isn't available.
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);
  const [locationSettled, setLocationSettled] = useState(false);
  useEffect(() => {
    if (!navigator.geolocation) {
      setLocationSettled(true);
      return;
    }
    const timeout = setTimeout(() => setLocationSettled(true), 3000);
    navigator.geolocation.getCurrentPosition(
      pos => {
        setUserCoords({ lat: pos.coords.latitude, lng: pos.coords.longitude });
        setLocationSettled(true);
        clearTimeout(timeout);
      },
      () => {
        setLocationSettled(true);
        clearTimeout(timeout);
      },
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 5 * 60 * 1000 },
    );
    return () => clearTimeout(timeout);
  }, []);

  const handleMapReady = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    setMapReady(true);
  }, []);

  // Re-plot markers whenever the spot list (or the map itself) changes,
  // rather than only once at map-ready time — spots.list can resolve
  // after the map finishes loading its script.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !spots || !window.google?.maps?.marker) return;

    markersRef.current.forEach(marker => (marker.map = null));
    markersRef.current = [];

    spots.forEach(spot => {
      const depth = relationshipDepth(spot);
      // Reawakening is a warm moment regardless of how young the
      // relationship is — the color leans toward --warm even for a
      // shallow spot's first return, so the moment still reads as
      // tender rather than waiting on accumulated depth to earn it.
      const color = spot.lifecycleState === "reawakened" ? depthColor(Math.max(depth, 0.85)) : depthColor(depth);
      // Presence fades like a real dry streambed rather than switching
      // off — quieter, not hidden (docs/03_DESIGN_MANIFESTO.md §6).
      const presence = spot.lifecycleState === "dry" ? 0.5 : spot.lifecycleState === "drying" ? 0.78 : 1;

      // A soft watercolor mark rather than a pin: a small solid core
      // wrapped in a much larger, softer glow that grows and blurs as
      // the relationship deepens — "the mark becomes richer, edges
      // become softer," never simply bigger (see 01_MAP_SCREEN.md).
      const haloSize = Math.round(22 + depth * 16);
      const coreSize = Math.round(7 + depth * 5);
      const glowBlur = Math.round(6 + depth * 10);
      const glowSpread = Math.round(2 + depth * 4);

      const mark = document.createElement("div");
      mark.style.position = "relative";
      mark.style.width = `${haloSize}px`;
      mark.style.height = `${haloSize}px`;
      mark.style.opacity = `${presence}`;
      if (PULSING_STATES.has(spot.lifecycleState)) {
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
      core.style.background = color;
      core.style.boxShadow = `0 0 ${glowBlur}px ${glowSpread}px ${color}`;
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
        className="relative mx-4 mt-2 overflow-hidden rounded-2xl border border-border"
        style={{ height: "58vh", filter: MAP_SOFTEN_FILTER }}
      >
        {locationSettled ? (
          <MapView
            className="h-full w-full"
            initialCenter={initialCenter}
            onMapReady={handleMapReady}
            initialZoom={13}
            mapStyles={WATERLOG_MAP_STYLE}
          />
        ) : (
          <div className="flex h-full items-center justify-center">
            <Spinner />
          </div>
        )}
        {locationSettled && isLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/60">
            <Spinner />
          </div>
        )}
      </div>

      {spots && spots.length === 0 && !isLoading && (
        <div className="mx-4 mt-4 rounded-xl border border-dashed border-border p-5 text-center text-sm text-muted-foreground">
          Still quiet here. Maps like this fill in slowly — one noticed place at a
          time.
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
