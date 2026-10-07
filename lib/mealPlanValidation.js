function normalizeIngredient(value) {
  return value.toLowerCase().replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function isFiniteNumber(value) {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

const BEEF_TERMS = /\b(beef|veal|oxtail|ox\s+tail)\b/i;

export function hasBeef(value) {
  return BEEF_TERMS.test(JSON.stringify(value) || "");
}

export function isValidMealPlan(plan) {
  return Array.isArray(plan?.days)
    && plan.days.length === 7
    && plan.days.every((day) => typeof day.day === "string"
      && Array.isArray(day.meals) && day.meals.length >= 2 && day.meals.length <= 3
      && day.meals.every((meal) => typeof meal.name === "string"
        && typeof meal.type === "string"
        && typeof meal.description === "string"
        && Array.isArray(meal.ingredients)
        && meal.ingredients.every((ingredient) => typeof ingredient.name === "string" && typeof ingredient.quantity === "string")
        && isFiniteNumber(meal.calories)
        && isFiniteNumber(meal.protein)
        && isFiniteNumber(meal.carbs)
        && isFiniteNumber(meal.fat)
        && isFiniteNumber(meal.fiber)
        && isFiniteNumber(meal.estimatedCost)
        && Array.isArray(meal.steps) && meal.steps.every((step) => typeof step === "string")
        && Array.isArray(meal.usesPantry) && meal.usesPantry.every((item) => typeof item === "string")
        && Array.isArray(meal.substitutions)
        && meal.substitutions.every((swap) => typeof swap.avoid === "string" && typeof swap.use === "string")));
}

export function hasListedAllergen(plan, groceryList, allergies) {
  const ingredientNames = [
    ...plan.days.flatMap((day) => day.meals.flatMap((meal) => [
      ...meal.ingredients.map((ingredient) => ingredient.name),
      ...meal.substitutions.map((swap) => swap.use),
    ])),
    ...groceryList.map((item) => item.name),
  ].map(normalizeIngredient);

  return allergies.some((allergy) => {
    const normalizedAllergy = normalizeIngredient(allergy);
    return ingredientNames.some((ingredient) => ingredient.includes(normalizedAllergy));
  });
}
