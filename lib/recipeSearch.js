function normalizeQuery(query) {
  return String(query || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ');
}

function buildRecipeSearchCandidates(query) {
  const normalized = normalizeQuery(query);
  if (!normalized) return ['vegetarian'];

  const terms = new Set([normalized]);
  const tokens = normalized.split(' ');

  tokens.forEach((token) => {
    if (token) terms.add(token);
  });

  const spaced = tokens.join(' ');
  if (tokens.length > 1) {
    terms.add(spaced);
  }

  const aliasTerms = [];
  if (normalized.includes('ice cream') || normalized.includes('ice-cream')) {
    aliasTerms.push('ice cream', 'dessert', 'icecream');
  }
  if (normalized.includes('chicken')) {
    aliasTerms.push('chicken');
  }
  if (normalized.includes('pasta')) {
    aliasTerms.push('pasta');
  }
  if (normalized.includes('dessert') || normalized.includes('cake') || normalized.includes('cookie')) {
    aliasTerms.push('dessert');
  }

  aliasTerms.forEach((term) => terms.add(term));

  return Array.from(terms);
}

async function fetchMealDbSearch(query) {
  const base = 'https://www.themealdb.com/api/json/v1/1';
  const candidates = buildRecipeSearchCandidates(query);
  const seen = new Set();
  const results = [];

  for (const candidate of candidates) {
    if (seen.has(candidate)) continue;
    seen.add(candidate);

    const urls = [
      `${base}/search.php?s=${encodeURIComponent(candidate)}`,
      `${base}/filter.php?c=${encodeURIComponent(candidate)}`,
      `${base}/filter.php?i=${encodeURIComponent(candidate)}`,
      `${base}/filter.php?a=${encodeURIComponent(candidate)}`,
    ];

    for (const url of urls) {
      try {
        const res = await fetch(url, { next: { revalidate: 60 } });
        const data = await res.json();
        if (data.meals && data.meals.length > 0) {
          const meals = data.meals.slice(0, 8);
          for (const meal of meals) {
            if (!meal.idMeal || seen.has(meal.idMeal)) continue;
            seen.add(meal.idMeal);
            results.push(meal);
          }
        }
      } catch (_) {
        // Ignore individual search failures and continue.
      }
    }
  }

  return results;
}

export { buildRecipeSearchCandidates, fetchMealDbSearch, normalizeQuery };
