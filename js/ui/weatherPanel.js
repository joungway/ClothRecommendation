import { generateMockWeather } from "../weather.js";
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

function thermoMercuryColor(t) {
  if (t <= 8) return "var(--cold)";
  if (t <= 22) return "var(--mid)";
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
    <div class="weather-visual">
      <div class="weather-visual-thermo" aria-label="Temperature ${w.currentTempC} degrees Celsius, feels like ${w.feelsLikeC}">
        <div class="thermo-widget">
          <div class="thermo-cap"></div>
          <div class="thermo-tube">
            <div class="thermo-tube-clip">
              <div class="thermo-fill" style="height:${curPct}%;background:${mercury}"></div>
            </div>
            <div class="thermo-feels" style="bottom:calc(${feelPct}% - 1px)" title="Feels like ~${w.feelsLikeC}°C"></div>
          </div>
          <div class="thermo-bulb" style="background:${mercury};box-shadow:inset 0 0 0 3px var(--panel-bg)"></div>
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
          <p class="thermo-scale-hint">Scale ${THERMO_LO}°–${THERMO_HI}°C (visual guide)</p>
        </div>
      </div>
      <div class="weather-visual-condition">
        <div class="weather-condition-icon-wrap">${mainIcon}</div>
        <div class="weather-condition-label">${w.conditionLabel}</div>
        <div class="weather-condition-flags">
          <span class="weather-flag${w.isWindy ? "" : " weather-flag--muted"}">${ICON_WIND}<span>${w.isWindy ? "Windy" : "Calm wind"}</span></span>
          <span class="weather-flag${w.isRainy ? "" : " weather-flag--muted"}">${w.isRainy ? ICON_RAIN : ICON_DRY}<span>${w.isRainy ? "Precipitation" : "Dry"}</span></span>
        </div>
      </div>
    </div>
    <p class="weather-range-bar" aria-label="Today low ${w.dayMinC} high ${w.dayMaxC} degrees Celsius">
      <span class="weather-range-bar-label">Today</span>
      <span class="weather-range-track">
        <span class="weather-range-day" style="left:${bandLeft}%;width:${Math.max(bandW, 1.5)}%"></span>
        <span class="weather-range-now" style="left:${tCur}%;transform:translateX(-50%)"></span>
      </span>
      <span class="weather-range-text">${w.dayMinC}–${w.dayMaxC}°C</span>
    </p>
  `;
}

export function mountWeatherPanel(root) {
  root.innerHTML = `
    <h2>Weather</h2>
    <div id="weather-body"></div>
    <div class="btn-row">
      <button type="button" class="primary" id="btn-refresh-weather">Refresh weather</button>
    </div>
  `;

  const body = root.querySelector("#weather-body");
  const btn = root.querySelector("#btn-refresh-weather");

  function render() {
    const w = state.weather;
    if (!w) {
      body.innerHTML = `<p class="weather-meta">Loading…</p>`;
      return;
    }
    body.innerHTML = buildWeatherVisualHtml(w);
  }

  btn.addEventListener("click", () => {
    setWeather(generateMockWeather());
    recomputeRecommendations();
  });

  return { render };
}
