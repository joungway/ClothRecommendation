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

export function mountFeedbackPanel(root, subscribe) {
  function render() {
    const w = state.weather;
    const edit = state.editingOutfit;
    if (!w) {
      root.innerHTML = `<h2>Live feedback</h2><p class="weather-meta">Waiting for weather…</p>`;
      return;
    }
    if (!edit || !edit.items.length) {
      root.innerHTML = `
        <h2>Live feedback</h2>
        <p class="weather-meta">Pick an outfit to see warmth totals and tips.</p>
      `;
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
      <div class="feedback-range">Outfit warmth: <span class="feedback-warmth-total">+${total.toFixed(1)}°C</span> (stackable)</div>
      <div class="weather-meta" style="margin-top:0.35rem">Reference baseline ${NEUTRAL_COMFORT_C}°C · suggested warmth ~<strong>+${req.toFixed(1)}°C</strong> · comfort score ${comfort}</div>
      ${lines.map((l) => `<div class="${warnClass}">${l}</div>`).join("")}
    `;
  }

  subscribe(render);
  render();
}
