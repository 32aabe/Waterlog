import { useEffect, useState } from "react";
import { loadMapScript } from "@/components/Map";

/**
 * Whether real Google Maps tiles can actually render here — `null` while
 * still undetermined (not yet enabled, or still checking), then
 * `true`/`false` once resolved. Covers both causes of "map is blank": no
 * Google Maps key configured (the common case for local/phone-LAN
 * preview) and a real network failure loading the script. MapHome uses
 * this to decide between <MapView> and a local fallback landscape,
 * instead of silently rendering an empty container either way.
 *
 * `enabled` (default true) gates *starting* the script load at all.
 * MapHome passes its own `locationSettled` here so the Maps bootstrap
 * script — main-thread-heavy once it loads: script eval, WebGL vector
 * map init, tile decode — isn't injected until after its geolocation
 * attempt has already succeeded or failed. Running both at once was the
 * actual cause of MapHome's geolocation appearing to "time out" where
 * Capture's identical call succeeded: the browser's real position
 * callback still has to run on the same JS thread the Maps SDK was
 * busy occupying for several seconds after mount.
 */
export function useGoogleMapsAvailable(enabled: boolean = true): boolean | null {
  const [available, setAvailable] = useState<boolean | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    loadMapScript().then(() => {
      if (!cancelled) setAvailable(!!window.google?.maps);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return available;
}
