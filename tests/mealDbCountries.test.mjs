import test from "node:test";
import assert from "node:assert/strict";
import { fetchMealDbCountries, fetchMealDbMealsByCountry } from "../lib/mealDbCountries.js";

const originalFetch = globalThis.fetch;

test("lists provider-supported countries and filters recipes by the selected country's cuisine", async () => {
  globalThis.fetch = async (input) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/list.php")) {
      return Response.json({
        meals: [
          { strCountry: "India", strArea: "Indian" },
          { strCountry: "Italy", strArea: "Italian" },
          { strCountry: "India", strArea: "Indian" },
        ],
      });
    }
    if (url.pathname.endsWith("/filter.php") && url.searchParams.get("a") === "Indian") {
      return Response.json({ meals: null });
    }
    if (url.pathname.endsWith("/filter.php") && url.searchParams.get("a") === "India") {
      return Response.json({ meals: [{ idMeal: "1" }, { idMeal: "2" }] });
    }
    throw new Error(`Unexpected provider request: ${url}`);
  };

  try {
    assert.deepEqual(await fetchMealDbCountries(), [
      { country: "India", area: "Indian" },
      { country: "Italy", area: "Italian" },
    ]);
    assert.deepEqual(await fetchMealDbMealsByCountry("India"), [{ idMeal: "1" }, { idMeal: "2" }]);
    assert.equal(await fetchMealDbMealsByCountry("Unknown"), null);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
