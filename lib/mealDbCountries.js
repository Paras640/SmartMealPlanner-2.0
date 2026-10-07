import { fetchMealDbSearch } from "./recipeSearch.js";

const MEAL_DB_BASE_URL = "https://www.themealdb.com/api/json/v1/1";

export async function fetchMealDbCountries() {
  const response = await fetch(`${MEAL_DB_BASE_URL}/list.php?a=list`, {
    next: { revalidate: 86400 },
  });
  if (!response.ok) throw new Error(`Country list request failed with HTTP ${response.status}`);

  const data = await response.json();
  const countries = new Map();
  for (const meal of data.meals || []) {
    if (typeof meal.strCountry !== "string" || typeof meal.strArea !== "string") continue;
    const country = meal.strCountry.trim();
    const area = meal.strArea.trim();
    if (country && area && !countries.has(country)) countries.set(country, area);
  }
  if (countries.size === 0) throw new Error("No recipe countries were returned.");

  return Array.from(countries, ([country, area]) => ({ country, area }))
    .sort((first, second) => first.country.localeCompare(second.country));
}

export async function fetchMealDbMealsByCountry(country, query = "") {
  const countries = await fetchMealDbCountries();
  const selectedCountry = countries.find((item) => item.country.toLowerCase() === country.toLowerCase());
  if (!selectedCountry) return null;

  const response = await fetch(
    `${MEAL_DB_BASE_URL}/filter.php?a=${encodeURIComponent(selectedCountry.area)}`,
    { next: { revalidate: 3600 } },
  );
  if (!response.ok) throw new Error(`Country recipe request failed with HTTP ${response.status}`);
  const data = await response.json();
  const countryMeals = data.meals || [];
  if (!query.trim()) return countryMeals;

  const matchingMeals = await fetchMealDbSearch(query);
  const matchingIds = new Set(matchingMeals.map((meal) => meal.idMeal));
  return countryMeals.filter((meal) => matchingIds.has(meal.idMeal));
}
