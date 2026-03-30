import {
  state,
  setActiveRecIndex,
  setSelectedSlotCategory,
  syncActiveRecommendationFromEditing,
  syncEditingFromActive,
  confirmOutfitSelection,
} from "../state.js";
import { regenerateTwoOutfits } from "../recommendFlow.js";
import { effectiveTempBand, outfitComfortScore } from "../engine/recommend.js";
import {
  NEUTRAL_COMFORT_C,
  totalWarmth,
  requiredWarmth,
} from "../engine/warmthModel.js";
import { CATEGORY_LABELS } from "../data/clothingLibrary.js";

/** Each outfit baseline: one top, bottom, and shoes; empty slots stay until filled */
const MANDATORY_BASELINE = ["top", "bottom", "shoes"];

/**
 * Wireframe layout: [accessories] [top] [outerwear]
 *                      —— [bottom] ——
 *                      —— [shoes] ——
 */
function firstItemWithImage(items, category) {
  const list = Array.isArray(items) ? items : [];
  return list.find(
    (i) =>
      i.category === category &&
      i.imageUrl &&
      String(i.imageUrl).trim()
  );
}

function renderPreviewSlot(item, slotClass, labelKey) {
  const label = CATEGORY_LABELS[labelKey] || labelKey;
  if (item) {
    return `<div class="outfit-preview-slot outfit-preview-slot--filled ${slotClass}"><img class="outfit-preview-slot-img" src="${item.imageUrl}" alt="" loading="lazy" /></div>`;
  }
  return `<div class="outfit-preview-slot outfit-preview-slot--empty ${slotClass}" aria-hidden="true"><span class="outfit-preview-slot-label">${label}</span></div>`;
}

function renderOutfitPreviewHtml(displayItems) {
  const items = Array.isArray(displayItems) ? displayItems : [];
  const acc = firstItemWithImage(items, "accessories");
  const top = firstItemWithImage(items, "top");
  const outer = firstItemWithImage(items, "outerwear");
  const bottom = firstItemWithImage(items, "bottom");
  const shoes = firstItemWithImage(items, "shoes");

  return `
    <div class="outfit-preview outfit-preview--grid" role="img" aria-label="Outfit preview">
      <div class="outfit-preview-grid">
        ${renderPreviewSlot(acc, "outfit-preview-slot--accessories", "accessories")}
        ${renderPreviewSlot(top, "outfit-preview-slot--top", "top")}
        ${renderPreviewSlot(outer, "outfit-preview-slot--outerwear", "outerwear")}
        ${renderPreviewSlot(bottom, "outfit-preview-slot--bottom", "bottom")}
        ${renderPreviewSlot(shoes, "outfit-preview-slot--shoes", "shoes")}
      </div>
    </div>`;
}

const EMPTY_SLOT_MSG = {
  top: "Choose a top (required slot)",
  bottom: "Choose a bottom (required slot)",
  shoes: "Choose shoes (required slot)",
};

/**
 * Comfort score from the items currently shown (decoupled from cached score on state)
 */
function comfortScoreForDisplayed(w, ctx, rec, displayItems) {
  if (!w || !displayItems || displayItems.length === 0) {
    return rec.comfortScore ?? "—";
  }
  const band = effectiveTempBand(w, ctx);
  return outfitComfortScore(
    {
      id: rec.id,
      items: displayItems,
      explanation: rec.explanation,
      pros: rec.pros,
      cons: rec.cons,
      comfortScore: 0,
    },
    w,
    ctx,
    band
  );
}

/** Hover: this piece on the warmth stack bar + suggested warmth marker */
function warmthStackBarHtml(item, w, ctx, band, outfitItems) {
  if (!w || !ctx || !band) return "";
  const total = totalWarmth(outfitItems);
  const req = requiredWarmth(w, ctx, band);
  const iw = Number(item.warmthC) || 0;
  let acc = 0;
  for (const x of outfitItems) {
    if (x.id === item.id) break;
    acc += Number(x.warmthC) || 0;
  }
  const maxScale = Math.max(26, total + 6, req + 5);
  const left = (acc / maxScale) * 100;
  const width = iw > 0 ? Math.max(2, (iw / maxScale) * 100) : 0;
  const reqMark = Math.min(100, (req / maxScale) * 100);
  const piece =
    iw > 0
      ? `<div class="temp-bar-span warmth-piece-span" style="left:${left}%;width:${width}%"></div>`
      : "";
  return `
    <div class="temp-bar-pop" role="tooltip">
      <div class="temp-bar-track warmth-stack-track">
        ${piece}
        <div class="temp-bar-marker warmth-req-marker" style="left:${reqMark}%" title="Suggested warmth ~+${req.toFixed(1)}°C"></div>
      </div>
      <div class="temp-bar-label">This piece <strong>+${iw}°C</strong> · outfit total <strong>+${total.toFixed(1)}°C</strong> · suggest ~<strong>+${req.toFixed(1)}°C</strong> (${NEUTRAL_COMFORT_C}°C baseline)</div>
    </div>
  `;
}

function renderFilledItemRow(
  it,
  isActive,
  slot,
  w,
  ctx,
  band,
  displayItems,
  baselineSlot = false
) {
  const rowClass =
    slot === it.category ? "item-row item-row--slot-selected" : "item-row";
  const baselineClass = baselineSlot ? " item-row--baseline" : "";
  const pill =
    baselineSlot
      ? `<span class="baseline-pill" title="Required slot for this outfit">Required</span>`
      : "";
  const thumb = it.imageUrl
    ? `<span class="item-row-thumb-wrap"><img class="item-row-thumb" src="${it.imageUrl}" alt="" loading="lazy" /></span>`
    : `<span class="item-row-thumb-wrap item-row-thumb-wrap--empty" aria-hidden="true"></span>`;
  return `
            <li class="${rowClass}${baselineClass}" data-slot-cat="${it.category}"${baselineSlot ? ' data-baseline-slot="true"' : ""}>
              ${thumb}
              <div class="item-hover-zone">
                <div class="item-name">${pill}${it.name}</div>
                <div class="item-meta"><span class="cat-dot" data-cat="${it.category}" title="${CATEGORY_LABELS[it.category] || it.category}"></span><span>${CATEGORY_LABELS[it.category] || it.category} · ${it.subcategory}</span></div>
                ${warmthStackBarHtml(it, w, ctx, band, displayItems)}
              </div>
              <span class="item-temp-hint">+${Number(it.warmthC) || 0}°C</span>
              ${
                isActive
                  ? `<button type="button" class="icon-btn" data-remove-item="${it.id}" aria-label="Remove">×</button>`
                  : `<span></span>`
              }
            </li>`;
}

function renderEmptyMandatoryRow(cat, isActive, slot) {
  const rowClass = [
    "item-row",
    "item-row--empty",
    "item-row--baseline",
    slot === cat ? "item-row--slot-selected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const label = CATEGORY_LABELS[cat] || cat;
  return `
            <li class="${rowClass}" data-slot-cat="${cat}" data-empty-required="true" data-baseline-slot="true" role="listitem" aria-label="${label} required, not selected">
              <span class="item-row-thumb-wrap item-row-thumb-wrap--empty" aria-hidden="true"></span>
              <div class="item-hover-zone" tabindex="0">
                <div class="item-name empty-slot-title"><span class="baseline-pill" title="Required slot for this outfit">Required</span> Not selected</div>
                <div class="item-meta">
                  <span class="cat-dot" data-cat="${cat}" title="${label}"></span>
                  <span class="empty-slot-hint">${EMPTY_SLOT_MSG[cat]}</span>
                </div>
                <div class="temp-bar-pop empty-slot-pop" role="tooltip">
                  <div class="temp-bar-label">This slot can’t stay empty: in the wardrobe, open “${label}” and tap an item to add it.</div>
                </div>
              </div>
              <span class="item-temp-hint">—</span>
              <span></span>
            </li>`;
}

/**
 * Render three required slots first (empty if missing), then the rest
 */
function buildOutfitItemsHtml(displayItems, isActive, slot, w, ctx, band) {
  const list = Array.isArray(displayItems) ? displayItems : [];
  const consumed = new Set();
  const chunks = [];

  for (const cat of MANDATORY_BASELINE) {
    const it = list.find((i) => i.category === cat && !consumed.has(i.id));
    if (it) {
      consumed.add(it.id);
      chunks.push(
        renderFilledItemRow(it, isActive, slot, w, ctx, band, list, true)
      );
    } else {
      chunks.push(renderEmptyMandatoryRow(cat, isActive, slot));
    }
  }

  for (const it of list) {
    if (consumed.has(it.id)) continue;
    consumed.add(it.id);
    chunks.push(
      renderFilledItemRow(it, isActive, slot, w, ctx, band, list, false)
    );
  }

  return chunks.join("");
}

function renderCard(rec, idx, opts) {
  const {
    w,
    ctx,
    band,
    slot,
    edit,
    active,
    showPickControls,
  } = opts;
  const isActive = idx === active;
  const displayItems =
    isActive && edit && Array.isArray(edit.items)
      ? edit.items
      : Array.isArray(rec.items)
        ? rec.items
        : [];
  const score = comfortScoreForDisplayed(w, ctx, rec, displayItems);

  const itemsHtml = buildOutfitItemsHtml(displayItems, isActive, slot, w, ctx, band);

  const pros = (isActive && edit ? edit.pros : rec.pros)
    .map((p) => `<li>${p}</li>`)
    .join("");
  const cons = (isActive && edit ? edit.cons : rec.cons)
    .map((c) => `<li>${c}</li>`)
    .join("");
  const explain = isActive && edit ? edit.explanation : rec.explanation;

  const pickRow = showPickControls
    ? `
            <div class="outfit-pick-row">
              <label class="outfit-pick-label">
                <input type="radio" name="outfit-pick" value="${idx}" class="outfit-pick-input" />
                <span>Use this outfit</span>
              </label>
            </div>`
    : "";

  const previewHtml = renderOutfitPreviewHtml(displayItems);

  return `
          <article class="outfit-card outfit-card--row ${isActive ? "outfit-card--active" : ""}" data-idx="${idx}">
            <div class="outfit-card-col outfit-card-col--meta">
              <div class="outfit-card-header">
                <div class="outfit-title">Option ${idx + 1}</div>
                <div class="comfort-badge">Comfort ${score ?? "—"}</div>
              </div>
              <p class="outfit-explain">${explain}</p>
              <div class="pros-cons">
                <div>
                  <div class="pros-cons-title">Pros</div>
                  <ul>${pros}</ul>
                </div>
                <div>
                  <div class="pros-cons-title">Watch-outs</div>
                  <ul>${cons}</ul>
                </div>
              </div>
              <div class="btn-row outfit-card-actions">
                <button type="button" class="${isActive ? "primary" : ""}" data-select-outfit="${idx}">
                  ${isActive ? "Editing this outfit" : "Edit this outfit first"}
                </button>
              </div>
              ${pickRow}
              ${
                isActive
                  ? `<p class="weather-meta outfit-edit-hint">Top, bottom, and shoes are required—after removal, empty slots stay until you pick from the wardrobe. Click a row to select a slot; other category tabs dim when locked (hover for why).</p>`
                  : ""
              }
            </div>
            <div class="outfit-card-col outfit-card-col--items">
              <div class="outfit-col-label">Selected pieces</div>
              <ul class="items-list">${itemsHtml}</ul>
            </div>
            <div class="outfit-card-col outfit-card-col--preview">
              <div class="outfit-col-label">Assembled look</div>
              ${previewHtml}
            </div>
          </article>
        `;
}

export function mountOutfitsPanel(root) {
  function removeItem(itemId) {
    if (!state.editingOutfit) return;
    state.editingOutfit.items = state.editingOutfit.items.filter((i) => i.id !== itemId);
    syncActiveRecommendationFromEditing();
  }

  function bindCard(rootEl) {
    rootEl.querySelectorAll("[data-select-outfit]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const i = Number(btn.getAttribute("data-select-outfit"));
        setActiveRecIndex(i);
      });
    });
    rootEl.querySelectorAll(".outfit-pick-input").forEach((inp) => {
      inp.addEventListener("change", () => {
        if (inp.checked) {
          confirmOutfitSelection(Number(inp.value));
        }
      });
    });
    rootEl.querySelectorAll("[data-slot-cat]").forEach((row) => {
      row.addEventListener("click", (e) => {
        if (e.target.closest("button[data-remove-item]")) return;
        const card = row.closest("[data-idx]");
        if (!card) return;
        const idx = Number(card.getAttribute("data-idx"));
        if (idx !== state.activeRecIndex) return;
        const cat = row.getAttribute("data-slot-cat");
        setSelectedSlotCategory(cat);
      });
    });
    rootEl.querySelectorAll("[data-remove-item]").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        removeItem(btn.getAttribute("data-remove-item"));
      });
    });
    const regen = rootEl.querySelector("#btn-regen-two");
    if (regen) {
      regen.addEventListener("click", () => regenerateTwoOutfits());
    }
  }

  function render() {
    const recs = state.recommendations;
    const active = state.activeRecIndex;
    const w = state.weather;
    const slot = state.selectedSlotCategory;
    const edit = state.editingOutfit;
    const confirmed = state.outfitsConfirmed;
    const ctx = state.context;
    const band = w ? effectiveTempBand(w, ctx) : null;

    if (!recs.length) {
      root.innerHTML = `
        <h2>Outfits</h2>
        <p class="weather-meta">No suggestions yet—refresh weather or relax your context.</p>
      `;
      return;
    }

    if (!state.editingOutfit) {
      syncEditingFromActive();
    }

    const listClass = ["outfits-list", "outfits-list--rows"]
      .filter(Boolean)
      .join(" ");

    const toolbar = confirmed
      ? `
      <div class="outfits-toolbar">
        <button type="button" class="primary" id="btn-regen-two">Generate two new options</button>
        <p class="weather-meta outfits-toolbar-note">Draws two new outfits from current weather and trip settings; replaces your current picks with new candidates.</p>
      </div>`
      : "";

    const cards = recs
      .map((rec, idx) =>
        renderCard(rec, idx, {
          w,
          ctx,
          band,
          slot,
          edit,
          active,
          showPickControls: !confirmed,
        })
      )
      .join("");

    root.innerHTML = `<h2>Outfits</h2>
      ${toolbar}
      <p class="weather-meta cat-hint">Each piece shows stackable “+°C warmth”; hover for outfit total vs suggested warmth. Color bar and dot show category.${confirmed ? " Tap “Generate two new options” above for fresh picks." : " Check “Use this outfit” to keep only that look; you can “Edit this outfit first” before confirming."}</p>
      <div class="${listClass}">${cards}</div>`;
    bindCard(root);
  }

  return { render };
}
