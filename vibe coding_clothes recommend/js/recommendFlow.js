import { state, setRecommendations } from "./state.js";
import { recommendOutfits } from "./engine/recommend.js";

export function recomputeRecommendations() {
  if (!state.weather) return;
  state.outfitsConfirmed = false;
  state.selectedSlotCategory = null;
  const outfits = recommendOutfits(state.weather, state.context, state.library, 3);
  setRecommendations(outfits);
}

/** After locking a pick, draw two fresh outfit candidates */
export function regenerateTwoOutfits() {
  if (!state.weather) return;
  state.outfitsConfirmed = false;
  state.selectedSlotCategory = null;
  const outfits = recommendOutfits(state.weather, state.context, state.library, 2);
  setRecommendations(outfits);
}
