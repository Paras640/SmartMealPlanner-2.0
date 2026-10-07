import test from 'node:test';
import assert from 'node:assert/strict';
import { buildRecipeSearchCandidates, fetchMealDbSearch } from '../lib/recipeSearch.js';

test('expands fuzzy search terms like ice-cream', () => {
  const terms = buildRecipeSearchCandidates('ice-cream');

  assert(terms.some((term) => term.includes('ice')));
  assert(terms.some((term) => term.includes('cream')));
  assert(terms.includes('dessert'));
});

test('splits multi-word queries into smaller search terms', () => {
  const terms = buildRecipeSearchCandidates('chicken curry');

  assert(terms.includes('chicken curry'));
  assert(terms.includes('chicken'));
  assert(terms.includes('curry'));
});

test('searches the Seafood category for seafood recipes', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/search.php')) return Response.json({ meals: null });
    if (url.pathname.endsWith('/filter.php') && url.searchParams.get('c') === 'seafood') {
      return Response.json({ meals: [{ idMeal: 'seafood-recipe' }] });
    }
    return Response.json({ meals: null });
  };

  try {
    const recipes = await fetchMealDbSearch('Seafood');
    assert(recipes.some((recipe) => recipe.idMeal === 'seafood-recipe'));
  } finally {
    globalThis.fetch = originalFetch;
  }
});
