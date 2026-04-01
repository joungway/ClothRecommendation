import { state } from "../state.js";
import { effectiveTempBand, outfitComfortScore } from "../engine/recommend.js";
import {
  NEUTRAL_COMFORT_C,
  totalWarmth,
  requiredWarmth,
} from "../engine/warmthModel.js";

function warmthFeedback(total, req) {
  const lines = [];
  let kind = "";
  if (total < req - 2) {
    lines.push(
      `Layered warmth +${total.toFixed(1)}°C is below the suggested ~+${req.toFixed(1)}°C; you may feel cold.`
    );
    kind = "cool";
  } else if (total > req + 10) {
    lines.push(
      `Layered warmth +${total.toFixed(1)}°C is well above the suggested +${req.toFixed(1)}°C; indoors or as it warms up it may feel bulky or warm.`
    );
    kind = "alert";
  } else {
    lines.push(`Layering is roughly in line with conditions; adjust to your own comfort.`);
  }
  return { lines, kind };
}

function placeholderPanel(hintPrimary, hintSecondary) {
  const sub =
    hintSecondary != null
      ? `<p class="feedback-placeholder-sub">${hintSecondary}</p>`
      : "";
  return `
      <h2>Live feedback</h2>
      <div class="feedback-layout feedback-layout--placeholder">
        <div class="feedback-col-main">
          <div class="feedback-suggested"><span class="feedback-metric-label">Suggested warmth ~</span><span class="feedback-suggested-val feedback-placeholder-val">--</span></div>
          <div class="feedback-range"><span class="feedback-metric-label">Outfit warmth: </span><span class="feedback-warmth-total feedback-placeholder-val">--</span> <span class="feedback-stack-note">(stackable)</span></div>
          <p class="feedback-placeholder-hint">${hintPrimary}</p>
          ${sub}
          <div class="feedback-ref">Reference baseline --</div>
        </div>
        <div class="feedback-comfort-badge" aria-label="Comfort score"><span class="feedback-metric-label">Comfort score </span><span class="feedback-comfort-val feedback-placeholder-val">--</span></div>
      </div>
    `;
}

export function mountFeedbackPanel(root, subscribe) {
  function render() {
    const w = state.weather;
    const edit = state.editingOutfit;
    const hasOutfit = Boolean(edit && edit.items.length);
    const showFull = Boolean(w && hasOutfit);

    if (!showFull) {
      const hintPrimary = hasOutfit
        ? "Select a location in Weather to load conditions."
        : "Start editing an outfit to see feedback.";
      const hintSecondary = !hasOutfit && !w ? "Weather is required for warmth feedback." : null;
      root.innerHTML = placeholderPanel(hintPrimary, hintSecondary);
      return;
    }

    const band = effectiveTempBand(w, state.context);
    const comfort = outfitComfortScore(edit, w, state.context, band);
    const total = totalWarmth(edit.items);
    const req = requiredWarmth(w, state.context, band);
    const { lines, kind } = warmthFeedback(total, req);

    const warnClass =
      kind === "alert"
        ? "feedback-warn feedback-warn--alert"
        : kind === "cool"
          ? "feedback-warn feedback-warn--cool"
          : "feedback-warn";

    root.innerHTML = `
      <h2>Live feedback</h2>
      <div class="feedback-layout">
        <div class="feedback-col-main">
          <div class="feedback-suggested"><span class="feedback-metric-label">Suggested warmth ~</span><span class="feedback-suggested-val">+${req.toFixed(1)}°C</span></div>
          <div class="feedback-range"><span class="feedback-metric-label">Outfit warmth: </span><span class="feedback-warmth-total">+${total.toFixed(1)}°C</span> <span class="feedback-stack-note">(stackable)</span></div>
          ${lines.map((l) => `<div class="${warnClass}">${l}</div>`).join("")}
          <div class="feedback-ref">Reference baseline ${NEUTRAL_COMFORT_C}°C</div>
        </div>
        <div class="feedback-comfort-badge" aria-label="Comfort score"><span class="feedback-metric-label">Comfort score </span><span class="feedback-comfort-val">${comfort}</span></div>
      </div>
    `;
  }

  subscribe(render);
  render();
}
