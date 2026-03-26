/**
 * @typedef {import('../data/clothingLibrary.js').ClothingItem} ClothingItem
 * @typedef {{ id: string, items: ClothingItem[], explanation: string, pros: string[], cons: string[], comfortScore: number }} Outfit
 */

import {
  NEUTRAL_COMFORT_C,
  totalWarmth,
  requiredWarmth,
  itemWarmthPickScore,
} from "./warmthModel.js";

/**
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 */
function outdoorStress(weather, ctx) {
  let stress = 0;
  if (ctx.duration === "2h") stress += 0.15;
  if (ctx.duration === "long") stress += 0.35;
  if (ctx.transport === "walking") stress += 0.25;
  if (ctx.transport === "transit") stress += 0.1;
  const outdoorRatio = (100 - ctx.indoorPct) / 100;
  return Math.min(1, stress * (0.5 + outdoorRatio * 0.5));
}

/**
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 */
export function effectiveTempBand(weather, ctx) {
  const stress = outdoorStress(weather, ctx);
  const ref =
    weather.feelsLikeC * (0.4 + stress * 0.35) +
    weather.currentTempC * (0.6 - stress * 0.35);
  const spread = 2 + stress * 3;
  return { low: ref - spread, high: ref + spread, stress };
}

/**
 * @param {ClothingItem} item
 * @param {typeof import('../state.js').state.context} ctx
 */
function purposeScore(item, ctx) {
  const tags = item.styleTags;
  if (ctx.purpose === "grocery") {
    return tags.includes("casual") ? 3 : tags.includes("smart") ? 1 : 2;
  }
  if (ctx.purpose === "dinner") {
    return tags.includes("smart") ? 4 : tags.includes("casual") ? 2 : 2;
  }
  return tags.includes("shopping") || tags.includes("casual") ? 3 : 2;
}

/**
 * @param {ClothingItem} item
 * @param {typeof import('../state.js').state.context} ctx
 */
function mobilityScore(item, ctx) {
  if (ctx.transport !== "walking") return 1;
  if (item.mobility === "high") return 3;
  if (item.mobility === "medium") return 2;
  return 0.5;
}

/**
 * @param {ClothingItem} item
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 */
function weatherItemScore(item, weather, ctx) {
  let s = 0;
  if (weather.isRainy && item.subcategory === "rain") s += 5;
  if (weather.isRainy && item.category === "shoes" && item.subcategory === "boots") s += 2;
  if (weather.isWindy && item.layering === "shell") s += 3;
  if (weather.isWindy && item.category === "outerwear") s += 1.5;
  if ((weather.currentTempC < 12 || weather.dayMinC < 8) && item.category === "outerwear") s += 2;
  if (ctx.indoorPct >= 65 && item.layering === "mid" && item.category === "top") s += 1;
  return s;
}

/**
 * @param {ClothingItem} item
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 * @param {{ low: number, high: number, stress: number }} band
 */
function scoreItem(item, weather, ctx, band) {
  const req = requiredWarmth(weather, ctx, band);
  return (
    itemWarmthPickScore(item, req) +
    purposeScore(item, ctx) +
    mobilityScore(item, ctx) +
    weatherItemScore(item, weather, ctx)
  );
}

/**
 * @param {ClothingItem[]} library
 * @param {string} cat
 */
function byCategory(library, cat) {
  return library.filter((i) => i.category === cat);
}

/**
 * @template T
 * @param {T[]} arr
 */
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * Warmth model: no hard temperature-band filter; full library scored by rules and outfit constraints
 * @param {ClothingItem[]} library
 */
function filterLibrary(library) {
  return library.filter((it) => typeof it.warmthC === "number" && it.warmthC >= 0);
}

/**
 * @param {ClothingItem[]} items
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 * @param {{ low: number, high: number, stress: number }} band
 */
function pickRandomTop(items, weather, ctx, band, n = 8) {
  const scored = items
    .map((it) => ({ it, s: scoreItem(it, weather, ctx, band) }))
    .sort((a, b) => b.s - a.s);
  return shuffle(scored.slice(0, Math.min(n, scored.length)).map((x) => x.it));
}

/**
 * @param {Outfit} outfit
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 * @param {{ low: number, high: number, stress: number }} band
 */
/**
 * Comfort score: ~85–100 when warmth tracks demand; penalize shortfall or excess
 */
export function outfitComfortScore(outfit, weather, ctx, band) {
  const total = totalWarmth(outfit.items);
  const req = requiredWarmth(weather, ctx, band);
  const diff = Math.abs(total - req);

  let score = 97;
  score -= Math.min(11, diff * 0.72);
  if (total < req - 4) score -= (req - total - 4) * 1.1;
  else if (total < req - 1.5) score -= (req - total - 1.5) * 0.55;
  if (total > req + 14) score -= (total - req - 14) * 0.32;

  if (weather.isRainy && !outfit.items.some((i) => i.subcategory === "rain" || i.layering === "shell")) {
    score -= 5;
  }
  if (
    !outfit.items.some((i) => i.category === "outerwear") &&
    (weather.currentTempC < 14 || weather.feelsLikeC < 13)
  ) {
    score -= 4;
  }
  score += Math.min(7, outfit.items.reduce((s, i) => s + purposeScore(i, ctx) * 0.5, 0));
  return Math.max(0, Math.min(100, Math.round(score)));
}

/**
 * @param {ClothingItem[]} items
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 */
function layeringOkFixed(items, weather, ctx) {
  const tops = items.filter((i) => i.category === "top");
  if (tops.length !== 1) return false;
  const needOuter =
    weather.isRainy ||
    weather.isWindy ||
    weather.currentTempC <= 14 ||
    weather.feelsLikeC <= 13;
  const hasOuter = items.some((i) => i.category === "outerwear");
  if (needOuter && !hasOuter) return false;
  return true;
}

/**
 * @param {ClothingItem[]} items
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 * @param {{ low: number, high: number, stress: number }} band
 */
function buildCopyText(items, weather, ctx, band) {
  const parts = [];
  if (weather.isRainy) parts.push("Rain: favor a wind- and water-resistant outer layer");
  if (weather.isWindy) parts.push("Wind: a shell or structured jacket helps");
  if (ctx.transport === "walking") parts.push("Lots of walking—shoes and mobility matter");
  if (ctx.indoorPct >= 60) parts.push("Mostly indoors—lighter layers that layer on/off work well");
  if (ctx.purpose === "dinner") parts.push("Dinner out—lean slightly smarter");
  const tw = totalWarmth(items);
  const rq = requiredWarmth(weather, ctx, band);
  parts.push(
    `Stacked warmth about +${tw.toFixed(1)}°C vs ${NEUTRAL_COMFORT_C}°C baseline comfort; conditions suggest ~+${rq.toFixed(1)}°C`
  );
  return parts.join("; ") + ".";
}

/**
 * @param {ClothingItem[]} items
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 * @param {{ low: number, high: number, stress: number }} band
 */
function buildProsCons(items, weather, ctx, band) {
  const pros = [];
  const cons = [];
  const tw = totalWarmth(items);
  const rq = requiredWarmth(weather, ctx, band);
  const hasShell = items.some((i) => i.layering === "shell");
  const hasMid = items.some((i) => i.layering === "mid");
  if (hasShell || hasMid) pros.push("Clear layering—easy to adjust with temperature");
  else pros.push("Simple build—lighter to move between indoors and out");
  if (items.some((i) => i.mobility === "high")) pros.push("Good mobility for walking");
  if (weather.isRainy && items.some((i) => i.subcategory === "rain")) pros.push("Outer layer handles wet weather better");
  if (ctx.purpose === "dinner" && items.some((i) => i.styleTags.includes("smart"))) pros.push("Reads a bit sharper for the occasion");
  if (tw >= rq - 1 && tw <= rq + 8) pros.push("Warmth is close to what conditions suggest");
  if (tw < rq - 2) cons.push("May run cool—stacked warmth a bit low");
  if (tw > rq + 11) cons.push("Plenty of margin—could feel warm indoors or if it heats up");
  if (!items.some((i) => i.category === "outerwear") && weather.currentTempC < 16) {
    cons.push("No outer layer buffer when it’s chilly");
  }
  if (weather.isRainy && !items.some((i) => i.subcategory === "rain")) {
    cons.push("Rain protection is average—consider a waterproof shell");
  }
  if (ctx.transport === "walking" && items.some((i) => i.mobility === "low")) {
    cons.push("Long walks may feel a bit restrictive");
  }
  if (cons.length === 0) cons.push("Tune layers to your own cold tolerance");
  return { pros, cons };
}

let outfitSeq = 0;

const MIN_COMFORT_RETURNED = 85;

/**
 * Top k items nearest target warmth for grid synthesis of high-comfort outfits
 */
function nearestWarmth(pool, category, target, k) {
  const items = byCategory(pool, category);
  if (!items.length) return [];
  return [...items]
    .sort(
      (a, b) =>
        Math.abs((Number(a.warmthC) || 0) - target) -
        Math.abs((Number(b.warmthC) || 0) - target)
    )
    .slice(0, k);
}

/**
 * Enumerate warmth mixes near demand; aim for comfort ≥ MIN_COMFORT_RETURNED
 * @param {Set<string>} existingSigs
 */
function synthesizeHighComfortOutfits(weather, ctx, band, pool, needCount, existingSigs) {
  const req = requiredWarmth(weather, ctx, band);
  const needOuter =
    weather.isRainy ||
    weather.isWindy ||
    weather.currentTempC <= 14 ||
    weather.feelsLikeC <= 13;

  let tTop = needOuter ? req * 0.33 : Math.min(13, req * 0.46);
  let tBot = req * 0.24;
  let tShoe = Math.max(1.5, req * 0.12);
  let tOuter = needOuter ? Math.max(6, req * 0.34) : 0;

  const tops = nearestWarmth(pool, "top", tTop, 7);
  const bottoms = nearestWarmth(pool, "bottom", tBot, 7);
  const shoes = nearestWarmth(pool, "shoes", tShoe, 6);
  let outers = needOuter ? nearestWarmth(pool, "outerwear", tOuter, 6) : [];
  if (needOuter && outers.length === 0) {
    outers = byCategory(pool, "outerwear").slice(0, 8);
  }
  const outerList = needOuter ? outers : [null];
  const accPool = byCategory(pool, "accessories");
  const accTry = accPool.length
    ? nearestWarmth(pool, "accessories", Math.max(1, req * 0.08), 4)
    : [];

  const built = [];
  for (const top of tops) {
    for (const bottom of bottoms) {
      for (const shoe of shoes) {
        for (const outer of outerList) {
          let items = [top, bottom, shoe].filter(Boolean);
          if (outer) items.push(outer);
          if (!layeringOkFixed(items, weather, ctx)) continue;

          const tryVariants = (baseItems) => {
            const sig = baseItems
              .map((i) => i.id)
              .sort()
              .join("|");
            if (existingSigs.has(sig)) return;
            const id = `outfit-${++outfitSeq}`;
            const { pros, cons } = buildProsCons(baseItems, weather, ctx, band);
            const explanation = buildCopyText(baseItems, weather, ctx, band);
            const comfortScore = outfitComfortScore(
              { id, items: baseItems, explanation, pros, cons, comfortScore: 0 },
              weather,
              ctx,
              band
            );
            if (comfortScore < MIN_COMFORT_RETURNED) return;
            existingSigs.add(sig);
            built.push({
              id,
              items: baseItems.map((i) => ({ ...i })),
              explanation,
              pros,
              cons,
              comfortScore,
            });
          };

          tryVariants(items);

          if (accTry.length && built.length < needCount * 3) {
            for (const a of accTry) {
              if (items.some((i) => i.id === a.id)) continue;
              tryVariants([...items, a]);
            }
          }
        }
      }
    }
  }

  built.sort((a, b) => b.comfortScore - a.comfortScore);
  return built.slice(0, needCount);
}

/**
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 * @param {ClothingItem[]} library
 * @param {number} [maxOutfits=3]
 * @returns {Outfit[]}
 */
export function recommendOutfits(weather, ctx, library, maxOutfits = 3) {
  const band = effectiveTempBand(weather, ctx);
  const pool = filterLibrary(library);
  if (pool.length < 6) {
    return ensureMinComfortOutfits(fallbackOutfits(weather, ctx, library, band), weather, ctx, band, pool);
  }

  const tops = pickRandomTop(byCategory(pool, "top"), weather, ctx, band);
  const bottoms = pickRandomTop(byCategory(pool, "bottom"), weather, ctx, band);
  const shoes = pickRandomTop(byCategory(pool, "shoes"), weather, ctx, band);
  const outers = pickRandomTop(byCategory(pool, "outerwear"), weather, ctx, band, 12);
  const accs = pickRandomTop(byCategory(pool, "accessories"), weather, ctx, band, 10);

  const candidates = [];
  const tries = 96;
  for (let k = 0; k < tries && candidates.length < 24; k++) {
    const top = tops[Math.floor(Math.random() * tops.length)] || tops[0];
    const bottom = bottoms[Math.floor(Math.random() * bottoms.length)] || bottoms[0];
    const shoe = shoes[Math.floor(Math.random() * shoes.length)] || shoes[0];
    if (!top || !bottom || !shoe) continue;

    let items = [top, bottom, shoe];
    const needOuter =
      weather.isRainy ||
      weather.isWindy ||
      weather.currentTempC <= 14 ||
      weather.feelsLikeC <= 13;
    if (needOuter && outers.length) {
      const o = outers[Math.floor(Math.random() * outers.length)];
      if (o) items.push(o);
    } else if (outers.length && Math.random() < 0.35) {
      const o = outers[Math.floor(Math.random() * outers.length)];
      if (o) items.push(o);
    }

    if (accs.length && Math.random() < (weather.currentTempC < 12 ? 0.55 : 0.28)) {
      const a = accs[Math.floor(Math.random() * accs.length)];
      if (a && !items.some((i) => i.id === a.id)) items.push(a);
    }

    if (!layeringOkFixed(items, weather, ctx)) continue;

    const id = `outfit-${++outfitSeq}`;
    const { pros, cons } = buildProsCons(items, weather, ctx, band);
    const explanation = buildCopyText(items, weather, ctx, band);
    const comfortScore = outfitComfortScore(
      { id, items, explanation, pros, cons, comfortScore: 0 },
      weather,
      ctx,
      band
    );

    const sig = items
      .map((i) => i.id)
      .sort()
      .join("|");
    if (candidates.some((c) => c._sig === sig)) continue;
    candidates.push({
      id,
      items,
      explanation,
      pros,
      cons,
      comfortScore,
      _sig: sig,
    });
  }

  if (candidates.length === 0) {
    return ensureMinComfortOutfits(fallbackOutfits(weather, ctx, library, band), weather, ctx, band, pool);
  }

  candidates.sort((a, b) => b.comfortScore - a.comfortScore);
  const cap = Math.max(1, Math.min(5, maxOutfits));
  const sigSet = new Set();
  /** @type {typeof candidates} */
  const selected = [];

  for (const c of candidates) {
    if (selected.length >= cap) break;
    if (c.comfortScore < MIN_COMFORT_RETURNED || sigSet.has(c._sig)) continue;
    sigSet.add(c._sig);
    selected.push(c);
  }

  let guard = 0;
  while (selected.length < cap && guard++ < 6) {
    const synth = synthesizeHighComfortOutfits(
      weather,
      ctx,
      band,
      pool,
      cap - selected.length + 2,
      sigSet
    );
    if (!synth.length) break;
    for (const s of synth) {
      if (selected.length >= cap) break;
      const sig = s.items
        .map((i) => i.id)
        .sort()
        .join("|");
      if (sigSet.has(sig)) continue;
      sigSet.add(sig);
      selected.push({ ...s, _sig: sig, comfortScore: s.comfortScore });
    }
  }

  const result = selected
    .filter((c) => c.comfortScore >= MIN_COMFORT_RETURNED)
    .slice(0, cap)
    .map(({ _sig, ...rest }) => rest);

  if (result.length === 0) {
    return ensureMinComfortOutfits(fallbackOutfits(weather, ctx, library, band), weather, ctx, band, pool);
  }
  return result;
}

/**
 * Fallback: replace sub-threshold outfits via warmth-grid synthesis
 * @param {Outfit[]} list
 */
function ensureMinComfortOutfits(list, weather, ctx, band, pool) {
  const cap = list.length;
  if (pool.length >= 6) {
    const sigs = new Set();
    const synth = synthesizeHighComfortOutfits(weather, ctx, band, pool, Math.max(cap, 3), sigs);
    const ok = synth.filter((o) => o.comfortScore >= MIN_COMFORT_RETURNED);
    if (ok.length >= cap) {
      return ok.slice(0, cap).map((o) => ({ ...o }));
    }
  }
  const sigs = new Set();
  const out = [];
  for (const o of list) {
    if (o.comfortScore >= MIN_COMFORT_RETURNED) {
      const sig = o.items
        .map((i) => i.id)
        .sort()
        .join("|");
      if (!sigs.has(sig)) {
        sigs.add(sig);
        out.push({ ...o });
      }
      continue;
    }
    const repl = synthesizeHighComfortOutfits(weather, ctx, band, pool, 4, sigs);
    const pick = repl.find((r) => r.comfortScore >= MIN_COMFORT_RETURNED);
    if (pick) {
      const sig = pick.items
        .map((i) => i.id)
        .sort()
        .join("|");
      sigs.add(sig);
      out.push({ ...pick });
    } else {
      out.push({ ...o });
    }
  }
  const good = out.filter((o) => o.comfortScore >= MIN_COMFORT_RETURNED);
  if (good.length >= cap) return good.slice(0, cap);
  const fill = synthesizeHighComfortOutfits(weather, ctx, band, pool, cap, new Set());
  return fill.slice(0, cap).length
    ? fill.slice(0, cap).map((o) => ({ ...o }))
    : out.slice(0, cap);
}

/**
 * @param {import('../state.js').WeatherSnapshot} weather
 * @param {typeof import('../state.js').state.context} ctx
 * @param {ClothingItem[]} library
 * @param {{ low: number, high: number, stress: number }} band
 */
function fallbackOutfits(weather, ctx, library, band) {
  const top = library.find((i) => i.category === "top") || library[0];
  const bottom = library.find((i) => i.category === "bottom") || library[1];
  const shoe = library.find((i) => i.category === "shoes") || library[2];
  const outer = library.find((i) => i.category === "outerwear");
  const items = [top, bottom, shoe].filter(Boolean);
  if (outer) items.push(outer);
  const { pros, cons } = buildProsCons(items, weather, ctx, band);
  const explanation = buildCopyText(items, weather, ctx, band);
  const comfortScore = outfitComfortScore(
    { id: "o-fb", items, explanation, pros, cons, comfortScore: 0 },
    weather,
    ctx,
    band
  );
  return [{ id: "outfit-fallback", items, explanation, pros, cons, comfortScore }];
}
