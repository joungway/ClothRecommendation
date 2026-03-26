/**
 * Warmth model: each item adds stackable warmthC (approx °C vs neutral comfort).
 * Demand uses NEUTRAL_COMFORT_C as “comfortable in one layer”; colder, windier, wetter, more outdoor time → higher needed warmth.
 */

export const NEUTRAL_COMFORT_C = 22;

/**
 * @param {import('../data/clothingLibrary.js').ClothingItem[]} items
 */
export function totalWarmth(items) {
  if (!items || !items.length) return 0;
  return items.reduce((s, it) => s + (Number(it.warmthC) || 0), 0);
}

/**
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 * @param {{ stress?: number }} band
 */
export function requiredWarmth(weather, ctx, band) {
  const stress = band.stress ?? 0;
  const ambient =
    weather.feelsLikeC * (0.55 + stress * 0.2) +
    weather.dayMinC * (0.45 - stress * 0.2);
  let w = Math.max(0, NEUTRAL_COMFORT_C - ambient);
  if (weather.isWindy) w += 2;
  if (weather.isRainy) w += 2.5;
  if (ctx.transport === "walking") {
    if (ctx.duration === "long") w += 2.5;
    else if (ctx.duration === "2h") w += 1.5;
    else w += 0.8;
  }
  if (ctx.duration === "long") w += 1.2;
  return Math.round(w * 10) / 10;
}

/**
 * Helper score for sampling sort: how well item warmth matches demand (not final comfort)
 * @param {import('../data/clothingLibrary.js').ClothingItem} item
 * @param {number} req
 */
export function itemWarmthPickScore(item, req) {
  const w = Number(item.warmthC) || 0;
  const slot = item.category;
  if (slot === "outerwear") {
    if (req > 14) return Math.min(12, 4 + w * 0.45);
    if (req < 6) return Math.min(12, 10 - w * 0.35);
    return 8 - Math.abs(w - req * 0.35) * 0.25;
  }
  if (slot === "top") {
    const target = Math.min(14, Math.max(2, req * 0.42));
    return 8 - Math.abs(w - target) * 0.3;
  }
  if (slot === "bottom") {
    const target = Math.min(10, Math.max(1, req * 0.22));
    return 6 - Math.abs(w - target) * 0.35;
  }
  if (slot === "shoes") {
    const target = req > 12 ? 6 : req < 5 ? 2 : 4;
    return 5 - Math.abs(w - target) * 0.4;
  }
  return 4 - Math.abs(w - req * 0.08) * 0.2;
}
