const CONDITIONS = [
  { key: "sunny", label: "Sunny", wind: false, rain: false },
  { key: "cloudy", label: "Cloudy", wind: false, rain: false },
  { key: "windy", label: "Windy", wind: true, rain: false },
  { key: "rainy", label: "Rain", wind: false, rain: true },
  { key: "storm", label: "Storm", wind: true, rain: true },
];

function randBetween(min, max) {
  return min + Math.random() * (max - min);
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** @returns {object} Weather snapshot for UI + engine */
export function generateMockWeather() {
  const dayMin = Math.round(randBetween(-2, 28));
  const dayMax = Math.min(40, dayMin + Math.round(randBetween(4, 14)));
  const current = Math.round(randBetween(dayMin, dayMax));
  const feelsLike = Math.round(current + randBetween(-3, 3));
  const cond = pick(CONDITIONS);

  return {
    currentTempC: current,
    dayMinC: dayMin,
    dayMaxC: dayMax,
    feelsLikeC: feelsLike,
    conditionKey: cond.key,
    conditionLabel: cond.label,
    isWindy: cond.wind,
    isRainy: cond.rain,
    updatedAt: new Date().toISOString(),
  };
}
