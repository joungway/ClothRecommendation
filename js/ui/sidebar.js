import {
  state,
  notify,
  syncActiveRecommendationFromEditing,
  clearSelectedSlot,
} from "../state.js";
import { CATEGORY_LABELS } from "../data/clothingLibrary.js";

const CATS = ["top", "bottom", "outerwear", "shoes", "accessories"];

function subcategoriesFor(cat, library) {
  const set = new Set();
  library.filter((i) => i.category === cat).forEach((i) => set.add(i.subcategory));
  return ["all", ...Array.from(set).sort()];
}

function addOrReplaceItem(item, onWarn) {
  if (!state.editingOutfit) {
    return;
  }
  const slot = state.selectedSlotCategory;
  if (slot && slot !== item.category) {
    onWarn(
      `The “${CATEGORY_LABELS[slot] || slot}” slot is selected—pick an item from that category, or click a row to clear selection.`
    );
    return;
  }
  const without = state.editingOutfit.items.filter((i) => i.category !== item.category);
  without.push({ ...item });
  state.editingOutfit.items = without;
  clearSelectedSlot(true);
  syncActiveRecommendationFromEditing();
}

export function mountSidebar(root) {
  let activeCat = "top";
  let activeSub = "all";
  let taggingTimer = null;
  let lastTagMessage = "";

  function render() {
    const lib = state.library;
    const slot = state.selectedSlotCategory;
    const lockBySlot = Boolean(slot && state.editingOutfit);
    if (lockBySlot) {
      activeCat = slot;
    }

    const subs = subcategoriesFor(activeCat, lib);
    if (!subs.includes(activeSub)) activeSub = "all";

    const filtered = lib.filter((i) => {
      if (i.category !== activeCat) return false;
      if (activeSub !== "all" && i.subcategory !== activeSub) return false;
      return true;
    });

    const tabBlockedTitle = lockBySlot
      ? `Unavailable: replacing the “${CATEGORY_LABELS[slot] || slot}” slot—finish the swap or click an outfit row to deselect.`
      : "";
    const uploadLockTitle = lockBySlot
      ? `Category locked to “${CATEGORY_LABELS[slot] || slot}” to match the selected slot`
      : "";

    const tabs = CATS.map((c) => {
      const isBlocked = lockBySlot && c !== slot;
      const active = c === activeCat;
      const cls = [active ? "is-active" : "", isBlocked ? "sidebar-tab--blocked" : ""]
        .filter(Boolean)
        .join(" ");
      const dis = isBlocked ? "disabled" : "";
      const titleAttr = isBlocked ? ` title="${tabBlockedTitle.replace(/"/g, "&quot;")}"` : "";
      const a11y = isBlocked ? ` aria-disabled="true"` : "";
      return `
      <button type="button" class="${cls}" data-cat="${c}" ${dis}${a11y}${titleAttr}>
        ${CATEGORY_LABELS[c]}
      </button>`;
    }).join("");

    const chips = subcategoriesFor(activeCat, lib)
      .filter((s) => s !== "all")
      .map(
        (s) => `
      <button type="button" class="chip ${s === activeSub ? "is-active" : ""}" data-sub="${s}">${s}</button>
    `
      )
      .join("");
    const chipAll = `<button type="button" class="chip ${activeSub === "all" ? "is-active" : ""}" data-sub="all">All</button>`;

    const list = filtered
      .map((it) => {
        const thumb = it.imageUrl
          ? `<img class="library-item-thumb" src="${it.imageUrl}" alt="" />`
          : `<div class="library-item-thumb" aria-hidden="true"></div>`;
        return `
        <div class="library-item" data-add-id="${it.id}" data-lib-cat="${it.category}">
          ${thumb}
          <div class="library-item-body">
            <div class="library-item-name">${it.name}</div>
            <div class="library-item-sub">${it.subcategory} · warmth +${Number(it.warmthC) || 0}°C</div>
          </div>
        </div>
      `;
      })
      .join("");

    const listLockHint = lockBySlot
      ? `<p class="library-list-hint" role="status">Replacing “${CATEGORY_LABELS[slot] || slot}”: only items in this category are available; other tabs are temporarily locked.</p>`
      : "";

    const uploadCatLockedHint = lockBySlot
      ? `<p class="upload-slot-hint" role="note">New uploads go to “${CATEGORY_LABELS[slot] || slot}” to match the selected slot.</p>`
      : "";

    root.innerHTML = `
      <h2>Wardrobe</h2>
      <div class="cat-legend" role="group" aria-label="Category color key">
        <span class="cat-legend-label">Key</span>
        <span class="cat-legend-item"><span class="cat-legend-swatch cat-legend-swatch--top"></span>Tops</span>
        <span class="cat-legend-item"><span class="cat-legend-swatch cat-legend-swatch--bottom"></span>Bottoms</span>
        <span class="cat-legend-item"><span class="cat-legend-swatch cat-legend-swatch--outerwear"></span>Outerwear</span>
        <span class="cat-legend-item"><span class="cat-legend-swatch cat-legend-swatch--shoes"></span>Shoes</span>
        <span class="cat-legend-item"><span class="cat-legend-swatch cat-legend-swatch--accessories"></span>Accessories</span>
      </div>
      <div class="sidebar-tabs" id="sidebar-tabs">${tabs}</div>
      <div class="subcat-filters">${chipAll}${chips}</div>
      <div class="library-list-wrap">${listLockHint}<div class="library-list" id="lib-list">${list || `<p class="weather-meta" style="padding:0.5rem">No items in this category</p>`}</div></div>
      <div class="upload-block" id="sidebar-body">
        <label>Custom item (mock AI tagging)</label>
        ${uploadCatLockedHint}
        <div class="upload-row">
          <input type="file" id="upload-file" accept="image/*" />
          <input type="text" id="upload-url" placeholder="Or paste image URL (optional)" />
          <select id="upload-category" ${lockBySlot ? `disabled title="${uploadLockTitle.replace(/"/g, "&quot;")}"` : ""}>
            ${CATS.map((c) => {
              const selAttr = lockBySlot ? (c === slot ? "selected" : "") : c === activeCat ? "selected" : "";
              return `<option value="${c}" ${selAttr}>${CATEGORY_LABELS[c]}</option>`;
            }).join("")}
          </select>
          <button type="button" class="primary" id="upload-submit">Upload & tag</button>
        </div>
        <div class="tagging-status" id="tagging-status">${lastTagMessage}</div>
      </div>
    `;

    root.querySelectorAll("[data-cat]").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        activeCat = btn.getAttribute("data-cat");
        activeSub = "all";
        render();
      });
    });
    root.querySelectorAll("[data-sub]").forEach((btn) => {
      btn.addEventListener("click", () => {
        activeSub = btn.getAttribute("data-sub");
        render();
      });
    });
    root.querySelectorAll("[data-add-id]").forEach((row) => {
      row.addEventListener("click", () => {
        const id = row.getAttribute("data-add-id");
        const item = state.library.find((i) => i.id === id);
        if (item)
          addOrReplaceItem(item, (msg) => {
            lastTagMessage = msg;
            notify();
          });
      });
    });

    const fileIn = root.querySelector("#upload-file");
    const urlIn = root.querySelector("#upload-url");
    const catSel = root.querySelector("#upload-category");
    const submit = root.querySelector("#upload-submit");

    submit.addEventListener("click", () => {
      if (taggingTimer) clearTimeout(taggingTimer);
      const slotNow = state.selectedSlotCategory;
      const locked = Boolean(slotNow && state.editingOutfit);
      const cat = locked ? slotNow : catSel.value;
      let imageUrl = "";
      const f = fileIn.files && fileIn.files[0];
      if (f) {
        const reader = new FileReader();
        reader.onload = () => {
          imageUrl = String(reader.result || "");
          runTagging(cat, imageUrl);
        };
        reader.readAsDataURL(f);
      } else if (urlIn.value.trim()) {
        imageUrl = urlIn.value.trim();
        runTagging(cat, imageUrl);
      } else {
        lastTagMessage = "Choose a local image or enter a URL.";
        notify();
      }
    });
  }

  function runTagging(cat, imageUrl) {
    lastTagMessage = "Mock-detecting fabric and weight…";
    notify();
    const delay = 600 + Math.random() * 500;
    taggingTimer = setTimeout(() => {
      state.customUploadCounter += 1;
      const n = state.customUploadCounter;
      const warmthC = Math.round(2 + Math.random() * 11);
      const subPick = {
        top: ["t-shirt", "shirt", "sweater"],
        bottom: ["jeans", "chinos", "trousers", "skirt"],
        outerwear: ["jacket", "coat"],
        shoes: ["sneakers", "boots"],
        accessories: ["bag", "hat", "scarf"],
      }[cat][
        Math.floor(
          Math.random() *
            {
              top: 3,
              bottom: 4,
              outerwear: 2,
              shoes: 2,
              accessories: 3,
            }[cat]
        )
      ];
      const styleRoll = Math.random() > 0.5 ? ["casual"] : ["casual", "smart"];
      const item = {
        id: `custom-${n}`,
        name: `Custom #${n}`,
        category: cat,
        subcategory: subPick,
        styleTags: styleRoll,
        warmthC,
        layering: warmthC >= 8 ? "mid" : "base",
        mobility: "high",
        imageUrl: imageUrl || undefined,
      };
      state.library.push(item);
      lastTagMessage = `Added: ${CATEGORY_LABELS[cat]} · ${subPick} · warmth +${warmthC}°C`;
      notify();
    }, delay);
  }

  return { render };
}
