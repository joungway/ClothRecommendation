import { state, setContext } from "../state.js";
import { recomputeRecommendations } from "../recommendFlow.js";

export function mountInputsPanel(root) {
  const c = state.context;
  root.innerHTML = `
    <h2>Context & trip</h2>
    <div class="inputs-grid">
      <div class="field">
        <label for="inp-duration">Time outdoors</label>
        <select id="inp-duration">
          <option value="1h">~1 hour</option>
          <option value="2h">~2 hours</option>
          <option value="long">Longer</option>
        </select>
      </div>
      <div class="field">
        <label for="inp-transport">Transport</label>
        <select id="inp-transport">
          <option value="driving">Driving</option>
          <option value="walking">Walking</option>
          <option value="transit">Public transit</option>
        </select>
      </div>
      <div class="field">
        <label for="inp-indoor">Indoor time share</label>
        <input type="range" id="inp-indoor" min="0" max="100" step="5" value="${c.indoorPct}" />
        <div class="indoor-value" id="inp-indoor-val">${c.indoorPct}%</div>
      </div>
      <div class="field">
        <label for="inp-purpose">Purpose</label>
        <select id="inp-purpose">
          <option value="grocery">Errands / grocery</option>
          <option value="dinner">Dinner / social</option>
          <option value="shopping">Shopping / leisure</option>
        </select>
      </div>
    </div>
    <div class="btn-row">
      <button type="button" class="primary" id="btn-recommend">Re-run recommendations</button>
    </div>
  `;

  const dur = root.querySelector("#inp-duration");
  const trans = root.querySelector("#inp-transport");
  const indoor = root.querySelector("#inp-indoor");
  const indoorVal = root.querySelector("#inp-indoor-val");
  const purpose = root.querySelector("#inp-purpose");
  const btn = root.querySelector("#btn-recommend");

  dur.value = c.duration;
  trans.value = c.transport;
  purpose.value = c.purpose;

  function readAndApply() {
    setContext(
      {
        duration: dur.value,
        transport: trans.value,
        indoorPct: Number(indoor.value),
        purpose: purpose.value,
      },
      true
    );
    recomputeRecommendations();
  }

  indoor.addEventListener("input", () => {
    indoorVal.textContent = `${indoor.value}%`;
  });

  dur.addEventListener("change", readAndApply);
  trans.addEventListener("change", readAndApply);
  purpose.addEventListener("change", readAndApply);
  indoor.addEventListener("change", readAndApply);
  btn.addEventListener("click", readAndApply);

  function render() {
    const x = state.context;
    dur.value = x.duration;
    trans.value = x.transport;
    purpose.value = x.purpose;
    indoor.value = String(x.indoorPct);
    indoorVal.textContent = `${x.indoorPct}%`;
  }

  return { render };
}
