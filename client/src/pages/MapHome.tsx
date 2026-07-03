import { useCallback, useRef, useState } from "react";
import { useLocation } from "wouter";
import { MapView } from "@/components/Map";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Spinner } from "@/components/ui/spinner";
import { getLoginUrl } from "@/const";
import { APP_NAME, APP_TAGLINE, SPOT_TYPE_LABELS, LIFECYCLE_LABELS } from "@/const";
import { Plus, Waves } from "lucide-react";
import type { WaterSpot } from "../../../drizzle/schema";

const STATE_COLOR: Record<string, string> = {
  alive: "#3E8B85",
  drying: "#B9772E",
  dry: "#9AA6A3",
  reawakened: "#1F5451",
};

export default function MapHome() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { data: spots, isLoading } = trpc.spots.list.useQuery();
  const [selected, setSelected] = useState<WaterSpot | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);

  const plotSpots = useCallback(
    (map: google.maps.Map, spotList: WaterSpot[]) => {
      spotList.forEach(spot => {
        if (!window.google?.maps?.marker) return;
        const pin = document.createElement("div");
        pin.style.width = "16px";
        pin.style.height = "16px";
        pin.style.borderRadius = "50%";
        pin.style.border = "2px solid white";
        pin.style.boxShadow = "0 0 0 3px " + (STATE_COLOR[spot.lifecycleState] ?? "#3E8B85") + "33";
        pin.style.background = STATE_COLOR[spot.lifecycleState] ?? "#3E8B85";

        const marker = new google.maps.marker.AdvancedMarkerElement({
          map,
          position: { lat: Number(spot.latitude), lng: Number(spot.longitude) },
          content: pin,
          title: spot.name ?? SPOT_TYPE_LABELS[spot.spotType],
        });
        marker.addListener("click", () => setSelected(spot));
      });
    },
    [],
  );

  const handleMapReady = useCallback(
    (map: google.maps.Map) => {
      mapRef.current = map;
      if (spots && spots.length > 0) {
        plotSpots(map, spots);
        if (navigator.geolocation) {
          // Keep the default center unless we already have spots to frame.
        }
      }
    },
    [spots, plotSpots],
  );

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
        {!isAuthenticated && (
          <Button size="sm" variant="outline" asChild>
            <a href={getLoginUrl()}>Sign in</a>
          </Button>
        )}
      </header>

      <div className="relative mx-4 overflow-hidden rounded-2xl border border-border" style={{ height: "60vh" }}>
        <MapView className="h-full w-full" onMapReady={handleMapReady} initialZoom={13} />
        {isLoading && (
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
                <p className="font-medium text-foreground">
                  {selected.name || SPOT_TYPE_LABELS[selected.spotType]}
                </p>
                <p className="text-xs text-muted-foreground">
                  {selected.placeName || `${Number(selected.latitude).toFixed(4)}, ${Number(selected.longitude).toFixed(4)}`}
                </p>
              </div>
              <Badge variant="secondary">{LIFECYCLE_LABELS[selected.lifecycleState]}</Badge>
            </div>
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
