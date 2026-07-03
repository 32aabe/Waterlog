import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import { MapView } from "@/components/Map";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { getLoginUrl } from "@/const";
import { APP_NAME, APP_TAGLINE, getSpotTypeLabel, LIFECYCLE_LABELS } from "@/const";
import { Plus, Waves } from "lucide-react";
import type { SpotSummary } from "../../../server/db";

const STATE_COLOR: Record<string, string> = {
  alive: "#3E8B85",
  drying: "#B9772E",
  dry: "#9AA6A3",
  reawakened: "#1F5451",
};
// A spot that's alive or just reawakened pulses gently, so the map reads
// as a living place at a glance, without tapping anything.
const PULSING_STATES = new Set(["alive", "reawakened"]);

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
      const pin = document.createElement("div");
      const color = STATE_COLOR[spot.lifecycleState] ?? "#3E8B85";
      pin.style.position = "relative";
      pin.style.width = "16px";
      pin.style.height = "16px";
      pin.style.borderRadius = "50%";
      pin.style.border = "2px solid white";
      pin.style.boxShadow = "0 0 0 3px " + color + "33";
      pin.style.background = color;
      pin.style.color = color;
      if (PULSING_STATES.has(spot.lifecycleState)) {
        pin.classList.add("map-pulse");
      }

      const marker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: { lat: Number(spot.latitude), lng: Number(spot.longitude) },
        content: pin,
        title: spot.name ?? getSpotTypeLabel(spot.spotType),
      });
      marker.addListener("click", () => setSelected(spot));
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
    <div className="flex min-h-[100dvh] flex-col pb-24">
      <header className="flex items-center justify-between gap-3 px-4 pt-[calc(env(safe-area-inset-top)+1rem)] pb-3">
        <div>
          <h1 className="flex items-center gap-1.5 text-lg font-semibold text-foreground">
            <Waves className="h-5 w-5 text-primary" />
            {APP_NAME}
          </h1>
          <p className="text-xs text-muted-foreground">{APP_TAGLINE}</p>
        </div>
        {!isAuthenticated &&
          (loginUrl ? (
            <Button size="sm" variant="outline" asChild>
              <a href={loginUrl}>Sign in</a>
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground" title="OAuth isn't configured in this preview">
              Sign-in unavailable
            </span>
          ))}
      </header>

      <div className="relative mx-4 overflow-hidden rounded-2xl border border-border" style={{ height: "60vh" }}>
        {locationSettled ? (
          <MapView className="h-full w-full" initialCenter={initialCenter} onMapReady={handleMapReady} initialZoom={13} />
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
        <div className="mx-4 mt-4 rounded-xl border border-dashed border-border p-4 text-center text-sm text-muted-foreground">
          No water spots logged yet. The map fills in as spots are discovered —
          be the first.
        </div>
      )}

      {selected && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto max-w-md px-4">
          <div className="rounded-2xl border border-border bg-card p-4 shadow-lg">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="font-display text-base text-foreground">
                  {selected.name || getSpotTypeLabel(selected.spotType)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selected.placeName || `${Number(selected.latitude).toFixed(4)}, ${Number(selected.longitude).toFixed(4)}`}
                </p>
              </div>
              <Badge variant="secondary">{LIFECYCLE_LABELS[selected.lifecycleState]}</Badge>
            </div>
            {selected.recentMomentCount > 0 && (
              <p className="mt-1 text-xs text-muted-foreground">
                {selected.recentMomentCountCapped ? `${selected.recentMomentCount}+` : selected.recentMomentCount} moment
                {selected.recentMomentCount === 1 && !selected.recentMomentCountCapped ? "" : "s"} logged here
              </p>
            )}
            <div className="mt-3 flex gap-2">
              <Button size="sm" className="flex-1" onClick={() => navigate(`/spot/${selected.id}`)}>
                Open story
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
