// Quiet, keyless ambient weather for Capture's Auto Context block.
// Open-Meteo's public API needs no API key and allows direct browser
// calls — no server round trip, nothing to provision. Best-effort only:
// any failure (offline, blocked, slow) simply shows "not available"
// rather than blocking or erroring the capture flow it's enriching. See
// docs/03_DESIGN_MANIFESTO.md §6 — weather is ambient texture here,
// never a field the user fills in.
const WMO_CONDITIONS: Record<number, string> = {
  0: "Clear",
  1: "Mostly clear",
  2: "Partly cloudy",
  3: "Overcast",
  45: "Foggy",
  48: "Foggy",
  51: "Light drizzle",
  53: "Drizzle",
  55: "Drizzle",
  56: "Freezing drizzle",
  57: "Freezing drizzle",
  61: "Light rain",
  63: "Rain",
  65: "Heavy rain",
  66: "Freezing rain",
  67: "Freezing rain",
  71: "Light snow",
  73: "Snow",
  75: "Heavy snow",
  77: "Snow grains",
  80: "Rain showers",
  81: "Rain showers",
  82: "Heavy showers",
  85: "Snow showers",
  86: "Snow showers",
  95: "Thunderstorms",
  96: "Thunderstorms",
  99: "Thunderstorms",
};

// Celsius throughout — Open-Meteo's own default unit, so no conversion
// needed. A user-facing °C/°F preference can be added once Profile/
// Settings exists; not this pass.
export type AmbientWeather = { tempC: number; condition: string };

export async function fetchAmbientWeather(lat: number, lng: number): Promise<AmbientWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn(`[weather] Open-Meteo request failed: ${res.status} ${res.statusText}`);
      return null;
    }
    const data = await res.json();
    const tempC = data?.current?.temperature_2m;
    if (typeof tempC !== "number") {
      console.warn("[weather] Open-Meteo response had no current.temperature_2m — unexpected response shape:", data);
      return null;
    }
    const code = data?.current?.weather_code;
    return { tempC: Math.round(tempC), condition: WMO_CONDITIONS[code] ?? "" };
  } catch (err) {
    console.warn("[weather] fetchAmbientWeather failed (offline, blocked, or network error):", err);
    return null;
  }
}
