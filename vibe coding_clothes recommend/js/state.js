import { cloneLibrary } from "./data/clothingLibrary.js";
import { effectiveTempBand, outfitComfortScore } from "./engine/recommend.js";

/** @typedef {{ currentTempC: number, dayMinC: number, dayMaxC: number, feelsLikeC: number, conditionKey: string, conditionLabel: string, isWindy: boolean, isRainy: boolean, updatedAt: string }} WeatherSnapshot */

const listeners = new Set();

export const state = {
  /** @type {WeatherSnapshot | null} */
  weather: null,
  context: {
    duration: "1h",
    transport: "driving",
    indoorPct: 50,
    purpose: "grocery",
  },
  /** @type {import('./data/clothingLibrary.js').ClothingItem[]} */
  library: cloneLibrary(),
  /** @type {import('./engine/recommend.js').Outfit[]} */
  recommendations: [],
  activeRecIndex: 0,
  /** @type {import('./engine/recommend.js').Outfit | null} */
  editingOutfit: null,
  /** @type {string | null} */
  selectedSlotCategory: null,
  /** After confirming one outfit, hide other candidates */
  outfitsConfirmed: false,
  customUploadCounter: 0,
};

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function notify() {
  listeners.forEach((fn) => fn());
}

export function setWeather(weather) {
  state.weather = weather;
  notify();
}

export function setContext(partial, silent = false) {
  Object.assign(state.context, partial);
  if (!silent) notify();
}

export function setRecommendations(list) {
  state.recommendations = list;
  if (state.activeRecIndex >= list.length) state.activeRecIndex = 0;
  if (list.length > 1) state.outfitsConfirmed = false;
  syncEditingFromActive();
  notify();
}

export function setActiveRecIndex(i) {
  state.activeRecIndex = i;
  syncEditingFromActive();
  notify();
}

export function syncEditingFromActive() {
  const rec = state.recommendations[state.activeRecIndex];
  if (!rec) {
    state.editingOutfit = null;
    return;
  }
  state.editingOutfit = {
    id: rec.id,
    items: rec.items.map((it) => ({ ...it })),
    explanation: rec.explanation,
    pros: [...rec.pros],
    cons: [...rec.cons],
    comfortScore: rec.comfortScore,
  };
}

export function setEditingOutfit(outfit) {
  state.editingOutfit = outfit;
  notify();
}

export function setSelectedSlotCategory(cat) {
  state.selectedSlotCategory = state.selectedSlotCategory === cat ? null : cat;
  notify();
}

export function clearSelectedSlot(silent = false) {
  state.selectedSlotCategory = null;
  if (!silent) notify();
}

/**
 * Confirm one candidate outfit; keep only that look and lock the view
 * @param {number} index
 */
export function confirmOutfitSelection(index) {
  const recs = state.recommendations;
  const rec = recs[index];
  if (!rec) return;
  const useEdit =
    state.activeRecIndex === index && state.editingOutfit;
  const final = useEdit
    ? {
        id: state.editingOutfit.id,
        items: state.editingOutfit.items.map((i) => ({ ...i })),
        explanation: state.editingOutfit.explanation,
        pros: [...state.editingOutfit.pros],
        cons: [...state.editingOutfit.cons],
        comfortScore: state.editingOutfit.comfortScore,
      }
    : {
        id: rec.id,
        items: rec.items.map((i) => ({ ...i })),
        explanation: rec.explanation,
        pros: [...rec.pros],
        cons: [...rec.cons],
        comfortScore: rec.comfortScore,
      };
  state.recommendations = [final];
  state.activeRecIndex = 0;
  state.outfitsConfirmed = true;
  state.selectedSlotCategory = null;
  syncEditingFromActive();
  notify();
}

/** Write edited items back to the active recommendation and refresh comfort score */
export function syncActiveRecommendationFromEditing() {
  const rec = state.recommendations[state.activeRecIndex];
  const ed = state.editingOutfit;
  if (!rec || !ed || !state.weather) {
    notify();
    return;
  }
  rec.items = ed.items.map((i) => ({ ...i }));
  const band = effectiveTempBand(state.weather, state.context);
  rec.comfortScore = outfitComfortScore(
    {
      id: rec.id,
      items: rec.items,
      explanation: rec.explanation,
      pros: rec.pros,
      cons: rec.cons,
      comfortScore: 0,
    },
    state.weather,
    state.context,
    band
  );
  ed.comfortScore = rec.comfortScore;
  notify();
}
