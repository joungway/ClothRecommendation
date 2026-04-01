import {
  fetchWeatherSnapshot,
  formatGeocodeLabel,
  generateMockWeather,
  reverseGeocodeLabel,
  searchUSLocations,
  saveLocation,
} from "../weather.js";
import { state, setWeather } from "../state.js";
import { recomputeRecommendations } from "../recommendFlow.js";

/** Thermometer scale (°C) for mercury column height */
const THERMO_LO = -12;
const THERMO_HI = 42;

function tempToPct(t) {
  const p = ((t - THERMO_LO) / (THERMO_HI - THERMO_LO)) * 100;
  return Math.max(2, Math.min(100, p));
}

/** 0–100 track position for daily range bar (no minimum mercury height) */
function tempToTrackPct(t) {
  const p = ((t - THERMO_LO) / (THERMO_HI - THERMO_LO)) * 100;
  return Math.max(0, Math.min(100, p));
}

/** Matches CSS --cold / --mid-low / --mid-high / --warm (8°C & 15°C split the old “mid” band) */
function thermoMercuryColor(t) {
  if (t <= 8) return "var(--cold)";
  if (t <= 15) return "var(--mid-low)";
  if (t <= 22) return "var(--mid-high)";
  return "var(--warm)";
}

const CONDITION_ICONS = {
  sunny: `<svg class="weather-condition-icon" viewBox="0 0 48 48" aria-hidden="true"><circle cx="24" cy="24" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M24 4v4M24 40v4M4 24h4M40 24h4M9.86 9.86l2.83 2.83M35.31 35.31l2.83 2.83M9.86 38.14l2.83-2.83M35.31 12.69l2.83-2.83"/></svg>`,
  cloudy: `<svg class="weather-condition-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" d="M14 30h22a8 8 0 0 0 1.2-15.92A10 10 0 0 0 16 18a7 7 0 0 0-2 13.8V32"/></svg>`,
  windy: `<svg class="weather-condition-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" d="M8 20h26a4 4 0 1 0-3.5-5.2M10 28h22M12 36h20"/></svg>`,
  rainy: `<svg class="weather-condition-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" d="M14 26h22a8 8 0 0 0 1.2-15.92A10 10 0 0 0 16 14a7 7 0 0 0-2 13.8"/><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M16 34v6M24 30v8M32 34v6"/></svg>`,
  storm: `<svg class="weather-condition-icon" viewBox="0 0 48 48" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" d="M14 24h22a8 8 0 0 0 1.2-15.92A10 10 0 0 0 16 12a7 7 0 0 0-2 13.8"/><path fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" d="M22 28l-4 8h6l-2 8"/></svg>`,
};

const ICON_WIND = `<svg class="weather-flag-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M4 10h12a3 3 0 1 0-2.5-4M4 14h10M5 18h8"/></svg>`;
const ICON_RAIN = `<svg class="weather-flag-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M8 16v4M12 14v5M16 16v4"/></svg>`;
const ICON_DRY = `<svg class="weather-flag-icon" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" d="M6 12h12"/></svg>`;

function conditionIconSvg(key) {
  return CONDITION_ICONS[key] || CONDITION_ICONS.cloudy;
}

function escapeHtml(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** City title at top (aligned with the two cards below). */
function buildCityHeaderHtml(w) {
  if (w.source === "api" && w.locationLabel) {
    return `<header class="weather-city-header"><p class="weather-city-title">${escapeHtml(w.locationLabel)}</p></header>`;
  }
  if (w.source === "mock") {
    return `<header class="weather-city-header weather-city-header--placeholder"><p class="weather-city-title">Mock data</p><p class="weather-city-sub">No location</p></header>`;
  }
  if (w.locationLabel) {
    return `<header class="weather-city-header"><p class="weather-city-title">${escapeHtml(w.locationLabel)}</p></header>`;
  }
  return `<header class="weather-city-header weather-city-header--placeholder"><p class="weather-city-title">—</p></header>`;
}

/** @param {object} w */
function buildWeatherVisualHtml(w) {
  const curPct = tempToPct(w.currentTempC);
  const feelPct = tempToPct(w.feelsLikeC);
  const mercury = thermoMercuryColor(w.currentTempC);
  const mainIcon = conditionIconSvg(w.conditionKey);
  const tLo = tempToTrackPct(w.dayMinC);
  const tHi = tempToTrackPct(w.dayMaxC);
  const tCur = tempToTrackPct(w.currentTempC);
  const bandLeft = Math.min(tLo, tHi);
  const bandW = Math.abs(tHi - tLo);

  return `
    <div class="weather-display">
      ${buildCityHeaderHtml(w)}
      <div class="weather-cards">
        <div class="weather-card weather-card--temp">
          <div class="weather-card-temp-body">
            <div class="weather-visual-thermo" aria-label="Temperature ${w.currentTempC} degrees Celsius, feels like ${w.feelsLikeC}">
              <div class="thermo-widget">
                <div class="thermo-cap"></div>
                <div class="thermo-tube">
                  <div class="thermo-tube-clip">
                    <div class="thermo-fill" style="height:${curPct}%;background:${mercury}"></div>
                  </div>
                  <div class="thermo-feels" style="bottom:calc(${feelPct}% - 1px)" title="Feels like ~${w.feelsLikeC}°C"></div>
                </div>
                <div class="thermo-bulb" style="background:${mercury}"></div>
              </div>
              <div class="thermo-readouts">
                <div class="thermo-readout">
                  <span class="thermo-readout-label">Temp</span>
                  <span class="thermo-readout-val">${w.currentTempC}<span class="thermo-unit">°C</span></span>
                </div>
                <div class="thermo-readout">
                  <span class="thermo-readout-label">Feels</span>
                  <span class="thermo-readout-val">${w.feelsLikeC}<span class="thermo-unit">°C</span></span>
                </div>
              </div>
            </div>
          </div>
          <p class="weather-range-bar weather-range-bar--in-temp" aria-label="Today low ${w.dayMinC} high ${w.dayMaxC} degrees Celsius">
            <span class="weather-range-bar-label">Today</span>
            <span class="weather-range-track">
              <span class="weather-range-day" style="left:${bandLeft}%;width:${Math.max(bandW, 1.5)}%"></span>
              <span class="weather-range-now" style="left:${tCur}%;transform:translateX(-50%)"></span>
            </span>
            <span class="weather-range-text">${w.dayMinC}–${w.dayMaxC}°C</span>
          </p>
          <p class="thermo-scale-hint thermo-scale-hint--card">Scale ${THERMO_LO}°–${THERMO_HI}°C (visual guide)</p>
        </div>
        <div class="weather-card weather-card--condition">
          <div class="weather-card-condition-body">
            <div class="weather-condition-icon-wrap">${mainIcon}</div>
            <p class="weather-condition-label">${w.conditionLabel}</p>
            <div class="weather-condition-flags weather-condition-flags--inline" role="group" aria-label="Wind and precipitation">
              <span class="weather-flag${w.isWindy ? "" : " weather-flag--muted"}">${ICON_WIND}<span>${w.isWindy ? "Windy" : "Calm wind"}</span></span>
              <span class="weather-flag-sep" aria-hidden="true">·</span>
              <span class="weather-flag${w.isRainy ? "" : " weather-flag--muted"}">${w.isRainy ? ICON_RAIN : ICON_DRY}<span>${w.isRainy ? "Precipitation" : "Dry"}</span></span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

export function mountWeatherPanel(root) {
  root.innerHTML = `
    <h2>Weather</h2>
    <p class="weather-meta weather-region-hint">Location search is limited to places in the United States (Open-Meteo).</p>
    <div class="weather-search-row">
      <label class="visually-hidden" for="weather-search-input">Search US city</label>
      <input type="search" id="weather-search-input" placeholder="Search US cities…" autocomplete="off" />
      <button type="button" id="btn-weather-search">Search</button>
    </div>
    <ul id="weather-search-results" class="weather-search-results" hidden></ul>
    <p id="weather-search-status" class="weather-meta weather-search-status" hidden></p>
    <div class="btn-row weather-loc-row">
      <button type="button" id="btn-weather-gps">Use current location</button>
    </div>
    <div id="weather-body" class="weather-body"></div>
    <div class="btn-row">
      <button type="button" class="primary" id="btn-refresh-weather">Refresh weather</button>
    </div>
  `;

  const body = root.querySelector("#weather-body");
  const btn = root.querySelector("#btn-refresh-weather");
  const searchInput = root.querySelector("#weather-search-input");
  const searchBtn = root.querySelector("#btn-weather-search");
  const resultsEl = root.querySelector("#weather-search-results");
  const statusEl = root.querySelector("#weather-search-status");
  const gpsBtn = root.querySelector("#btn-weather-gps");

  function showSearchStatus(text, show = true) {
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.hidden = !show;
  }

  function hideResults() {
    if (resultsEl) {
      resultsEl.innerHTML = "";
      resultsEl.hidden = true;
    }
  }

  async function applyLocation(lat, lon, label) {
    body.innerHTML = `<p class="weather-meta">Loading…</p>`;
    try {
      const w = await fetchWeatherSnapshot(lat, lon, label);
      saveLocation({ lat, lon, label });
      setWeather(w);
      recomputeRecommendations();
      hideResults();
      showSearchStatus("", false);
    } catch {
      setWeather(generateMockWeather());
      recomputeRecommendations();
    }
  }

  async function runSearch() {
    const q = searchInput.value.trim();
    if (q.length < 2) {
      showSearchStatus("Enter at least 2 characters.", true);
      hideResults();
      return;
    }
    showSearchStatus("Searching…", true);
    hideResults();
    try {
      const results = await searchUSLocations(q);
      if (!results.length) {
        showSearchStatus("No matching US locations found.", true);
        return;
      }
      showSearchStatus("", false);
      resultsEl.hidden = false;
      resultsEl.innerHTML = results
        .map(
          (r) =>
            `<li role="option" tabindex="0" data-lat="${r.latitude}" data-lon="${r.longitude}" data-label="${encodeURIComponent(formatGeocodeLabel(r))}">${formatGeocodeLabel(r)}</li>`
        )
        .join("");
    } catch {
      showSearchStatus("Search failed. Try again later.", true);
    }
  }

  searchBtn.addEventListener("click", () => {
    runSearch();
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault();
      runSearch();
    }
  });

  resultsEl.addEventListener("click", (e) => {
    const li = e.target.closest("li[data-lat]");
    if (!li) return;
    const lat = Number(li.dataset.lat);
    const lon = Number(li.dataset.lon);
    const label = decodeURIComponent(li.dataset.label || "");
    applyLocation(lat, lon, label);
  });

  gpsBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      showSearchStatus("Geolocation is not supported.", true);
      return;
    }
    showSearchStatus("Getting location…", true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        const fallback = `Current location (${lat.toFixed(2)}, ${lon.toFixed(2)})`;
        showSearchStatus("Resolving place name…", true);
        let label = fallback;
        try {
          const name = await reverseGeocodeLabel(lat, lon);
          if (name) label = name;
        } catch {
          /* keep coordinate fallback */
        }
        await applyLocation(lat, lon, label);
        showSearchStatus("", false);
      },
      () => {
        showSearchStatus("Could not get location or permission denied.", true);
      },
      { enableHighAccuracy: false, timeout: 12000, maximumAge: 600000 }
    );
  });

  btn.addEventListener("click", async () => {
    const w = state.weather;
    if (!w) {
      showSearchStatus("Please select a location first.", true);
      return;
    }
    if (w?.source === "api" && w.lat != null && w.lon != null) {
      body.innerHTML = `<p class="weather-meta">Loading…</p>`;
      try {
        const next = await fetchWeatherSnapshot(w.lat, w.lon, w.locationLabel || "");
        setWeather(next);
        recomputeRecommendations();
      } catch {
        setWeather(generateMockWeather());
        recomputeRecommendations();
      }
    } else {
      setWeather(generateMockWeather());
      recomputeRecommendations();
    }
  });

  function render() {
    const w = state.weather;
    if (!w) {
      body.innerHTML = `
        <div class="weather-body-empty" role="status">
          <p class="weather-body-empty-title">Please select a location.</p>
          <p class="weather-body-empty-hint">Search for a US city or use your current location.</p>
        </div>`;
      return;
    }
    body.innerHTML = buildWeatherVisualHtml(w);
  }

  return { render };
}
