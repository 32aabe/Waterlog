import { useEffect, useState } from "react";
import { loadMapScript } from "@/components/Map";

/**
 * Whether real Google Maps tiles can actually render here — `null` while
 * still checking, then `true`/`false`. Covers both causes of "map is
 * blank": no Forge Maps key configured (the common case for local/
 * phone-LAN preview) and a real network failure loading the script.
 * MapHome uses this to decide between <MapView> and a local fallback
 * landscape, instead of silently rendering an empty container either way.
 */
export function useGoogleMapsAvailable(): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    let cancelled = false;
    loadMapScript().then(() => {
      if (!cancelled) setAvailable(!!window.google?.maps);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return available;
}
