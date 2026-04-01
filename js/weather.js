const CONDITIONS = [
  { key: "sunny", label: "Sunny", wind: false, rain: false },
  { key: "cloudy", label: "Cloudy", wind: false, rain: false },
  { key: "windy", label: "Windy", wind: true, rain: false },
  { key: "rainy", label: "Rain", wind: false, rain: true },
  { key: "storm", label: "Storm", wind: true, rain: true },
];

const WEATHER_API = "https://api.open-meteo.com/v1/forecast";
const GEO_API = "https://geocoding-api.open-meteo.com/v1/search";

/** Photon (OSM) reverse geocoding; CORS-friendly; resolves GPS coords to a place name. */
const PHOTON_REVERSE = "https://photon.komoot.io/reverse";

/** Geocoding search limited to US (Open-Meteo ISO 3166-1 alpha-2). */
export const REGION_SEARCH_COUNTRY = "US";

const STORAGE_KEY = "outfit-lab-weather-loc";

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * @param {object} r Open-Meteo geocode result
 * @returns {string}
 */
export function formatGeocodeLabel(r) {
  const parts = [r.name];
  if (r.admin1) parts.push(r.admin1);
  if (r.country) parts.push(r.country);
  return parts.join(", ");
}

/**
 * Reverse-geocode coordinates to a readable label (similar style to Open-Meteo search).
 * Returns null on failure; caller falls back to coordinate text.
 * @param {number} lat
 * @param {number} lon
 * @returns {Promise<string | null>}
 */
export async function reverseGeocodeLabel(lat, lon) {
  const url = new URL(PHOTON_REVERSE);
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lon));
  const res = await fetch(url.toString());
  if (!res.ok) return null;
  const data = await res.json();
  const props = data.features?.[0]?.properties;
  if (!props) return null;
  return formatPhotonPlaceLabel(props);
}

/** @param {Record<string, string | undefined>} p */
function formatPhotonPlaceLabel(p) {
  const place =
    p.city ||
    p.town ||
    p.village ||
    p.locality ||
    p.county ||
    p.name;
  const parts = [];
  if (place) parts.push(place);
  if (p.state && p.state !== place) parts.push(p.state);
  if (p.country && p.country !== place) parts.push(p.country);
  return parts.length ? parts.join(", ") : null;
}

/**
 * US-only place search (for the search field).
 * @param {string} query
 * @returns {Promise<object[]>}
 */
export async function searchUSLocations(query) {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL(GEO_API);
  url.searchParams.set("name", q);
  url.searchParams.set("countryCode", REGION_SEARCH_COUNTRY);
  url.searchParams.set("count", "12");
  url.searchParams.set("language", "en");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  return data.results || [];
}

/**
 * @param {number} code WMO weather code
 * @param {number} windKmh
 * @param {number} precipMm
 */
function mapWmoToUi(code, windKmh, precipMm) {
  const windy = windKmh >= 25;
  const wet = precipMm >= 0.3;
  if (code >= 95 && code <= 99) {
    return { key: "storm", label: "Thunderstorm", isWindy: true, isRainy: true };
  }
  if (
    [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82].includes(code) ||
    wet
  ) {
    return { key: "rainy", label: "Rain", isWindy: windy, isRainy: true };
  }
  if ([71, 73, 75, 77, 85, 86].includes(code)) {
    return { key: "cloudy", label: "Snow", isWindy: windy, isRainy: false };
  }
  if (code === 0) {
    return {
      key: windy ? "windy" : "sunny",
      label: windy ? "Windy" : "Clear",
      isWindy: windy,
      isRainy: false,
    };
  }
  if ([1, 2, 3, 45, 48].includes(code)) {
    const labels = { 1: "Mainly clear", 2: "Partly cloudy", 3: "Overcast" };
    return {
      key: windy ? "windy" : "cloudy",
      label: windy ? "Windy" : labels[code] || "Cloudy",
      isWindy: windy,
      isRainy: false,
    };
  }
  return { key: "cloudy", label: "Cloudy", isWindy: windy, isRainy: wet };
}

/**
 * @param {number} lat
 * @param {number} lon
 * @param {string} locationLabel
 * @returns {Promise<object>}
 */
export async function fetchWeatherSnapshot(lat, lon, locationLabel) {
  const url = new URL(WEATHER_API);
  url.searchParams.set("latitude", String(lat));
  url.searchParams.set("longitude", String(lon));
  url.searchParams.set(
    "current",
    "temperature_2m,apparent_temperature,weather_code,wind_speed_10m,precipitation"
  );
  url.searchParams.set("daily", "temperature_2m_max,temperature_2m_min");
  url.searchParams.set("timezone", "auto");
  url.searchParams.set("forecast_days", "1");
  const res = await fetch(url.toString());
  if (!res.ok) throw new Error("Weather request failed");
  const data = await res.json();
  const cur = data.current;
  const daily = data.daily;
  if (!cur || !daily?.temperature_2m_min?.[0]) {
    throw new Error("Invalid weather response");
  }

  const dayMin = Math.round(daily.temperature_2m_min[0]);
  const dayMax = Math.round(daily.temperature_2m_max[0]);
  const currentTemp = Math.round(cur.temperature_2m);
  const feels = Math.round(cur.apparent_temperature);
  const windKmh = cur.wind_speed_10m ?? 0;
  const precip = cur.precipitation ?? 0;
  const mapped = mapWmoToUi(cur.weather_code, windKmh, precip);

  return {
    currentTempC: currentTemp,
    dayMinC: dayMin,
    dayMaxC: dayMax,
    feelsLikeC: feels,
    conditionKey: mapped.key,
    conditionLabel: mapped.label,
    isWindy: mapped.isWindy,
    isRainy: mapped.isRainy,
    updatedAt: new Date().toISOString(),
    locationLabel,
    lat,
    lon,
    source: "api",
  };
}

export function loadSavedLocation() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (
      typeof o.lat === "number" &&
      typeof o.lon === "number" &&
      typeof o.label === "string"
    ) {
      return { lat: o.lat, lon: o.lon, label: o.label };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function saveLocation(loc) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ lat: loc.lat, lon: loc.lon, label: loc.label })
  );
}

/** @returns {object} */
export function generateMockWeather() {
  const dayMin = Math.round(randBetween(-2, 28));
  const dayMax = Math.min(40, dayMin + Math.round(randBetween(4, 14)));
  const current = Math.round(randBetween(dayMin, dayMax));
  const feelsLike = Math.round(current + randBetween(-3, 3));
  const cond = pick(CONDITIONS);

  return {
    currentTempC: current,
    dayMinC: dayMin,
    dayMaxC: dayMax,
    feelsLikeC: feelsLike,
    conditionKey: cond.key,
    conditionLabel: cond.label,
    isWindy: cond.wind,
    isRainy: cond.rain,
    updatedAt: new Date().toISOString(),
    source: "mock",
  };
}

/**
 * On load: use saved coordinates if present, else mock weather.
 */
export async function bootstrapInitialWeather() {
  const saved = loadSavedLocation();
  if (saved) {
    try {
      return await fetchWeatherSnapshot(saved.lat, saved.lon, saved.label);
    } catch {
      /* fall through */
    }
  }
  return generateMockWeather();
}
