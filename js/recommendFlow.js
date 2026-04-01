import { state, setRecommendations } from "./state.js";
import { recommendOutfits } from "./engine/recommend.js";

export function recomputeRecommendations() {
  if (!state.weather) return;
  state.outfitsConfirmed = false;
  state.selectedSlotCategory = null;
  const outfits = recommendOutfits(state.weather, state.context, state.library, 3);
  setRecommendations(outfits);
}

/**
 * After “keep this outfit”: keep that look as option 1 and add two new ones biased to its styleTags.
 */
export function regenerateTwoOutfits() {
  if (!state.weather) return;
  state.selectedSlotCategory = null;
  const recs = state.recommendations;
  if (state.outfitsConfirmed && recs.length === 1) {
    const kept = {
      id: recs[0].id,
      items: recs[0].items.map((i) => ({ ...i })),
      explanation: recs[0].explanation,
      pros: [...recs[0].pros],
      cons: [...recs[0].cons],
      comfortScore: recs[0].comfortScore,
    };
    const more = recommendOutfits(state.weather, state.context, state.library, 2, {
      anchorOutfit: kept,
    });
    setRecommendations([kept, ...more]);
    return;
  }
  state.outfitsConfirmed = false;
  const outfits = recommendOutfits(state.weather, state.context, state.library, 2);
  setRecommendations(outfits);
}
