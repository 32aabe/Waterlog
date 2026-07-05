// Quiet, keyless ambient weather for the Capture dateline. Open-Meteo's
// public API needs no API key and allows direct browser calls — no server
// round trip, nothing to provision. Best-effort only: any failure
// (offline, blocked, slow) simply leaves the weather clause out of the
// dateline rather than blocking or erroring the capture flow it's
// enriching. See docs/03_DESIGN_MANIFESTO.md §6 — weather is ambient
// texture here, never a field the user fills in.
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

export type AmbientWeather = { tempF: number; condition: string };

export async function fetchAmbientWeather(lat: number, lng: number): Promise<AmbientWeather | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code&temperature_unit=fahrenheit`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const tempF = data?.current?.temperature_2m;
    if (typeof tempF !== "number") return null;
    const code = data?.current?.weather_code;
    return { tempF: Math.round(tempF), condition: WMO_CONDITIONS[code] ?? "" };
  } catch {
    return null;
  }
}

// "Tuesday afternoon" — the dateline's time clause, resolved instantly and
// client-side, no network needed.
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function formatDatelineTime(date: Date): string {
  const hour = date.getHours();
  const part = hour < 5 ? "night" : hour < 12 ? "morning" : hour < 17 ? "afternoon" : hour < 21 ? "evening" : "night";
  return `${WEEKDAYS[date.getDay()]} ${part}`;
}
