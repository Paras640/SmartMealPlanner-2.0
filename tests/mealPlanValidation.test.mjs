import test from "node:test";
import assert from "node:assert/strict";
import { hasBeef, hasListedAllergen, isValidMealPlan } from "../lib/mealPlanValidation.js";

function createPlan() {
  return {
    days: Array.from({ length: 7 }, (_, index) => ({
      day: `Day ${index + 1}`,
      meals: [
        {
          type: "Lunch",
          name: "Chickpea bowl",
          description: "A quick meal.",
          ingredients: [{ name: "Chickpeas", quantity: "1 cup" }],
          steps: ["Cook the chickpeas.", "Serve."],
          usesPantry: ["Chickpeas"],
          calories: 400,
          protein: 18,
          carbs: 55,
          fat: 10,
          fiber: 12,
          estimatedCost: 4,
          substitutions: [{ avoid: "Rice", use: "Quinoa" }],
        },
        {
          type: "Dinner",
          name: "Vegetable soup",
          description: "A simple soup.",
          ingredients: [{ name: "Carrots", quantity: "2" }],
          steps: ["Chop.", "Simmer."],
          usesPantry: [],
          calories: 300,
          protein: 12,
          carbs: 40,
          fat: 8,
          fiber: 9,
          estimatedCost: 5,
          substitutions: [],
        },
      ],
    })),
  };
}

test("accepts a complete seven-day meal plan", () => {
  assert.equal(isValidMealPlan(createPlan()), true);
});

test("rejects meal plans missing days or nutrition values", () => {
  const missingDay = createPlan();
  missingDay.days.pop();
  assert.equal(isValidMealPlan(missingDay), false);

  const missingNutrition = createPlan();
  delete missingNutrition.days[0].meals[0].protein;
  assert.equal(isValidMealPlan(missingNutrition), false);
});

test("detects listed allergens in recipes, substitutions, and the shopping list", () => {
  const plan = createPlan();
  plan.days[0].meals[0].ingredients.push({ name: "Peanut butter", quantity: "1 tbsp" });
  assert.equal(hasListedAllergen(plan, [], ["peanut"]), true);

  const safePlan = createPlan();
  safePlan.days[0].meals[0].substitutions[0].use = "Peanut butter";
  assert.equal(hasListedAllergen(safePlan, [], ["peanut"]), true);

  assert.equal(hasListedAllergen(createPlan(), [{ name: "Peanuts", quantity: "1 bag" }], ["peanut"]), true);
  assert.equal(hasListedAllergen(createPlan(), [], ["shellfish"]), false);
});

test("detects beef anywhere in generated meals or the grocery list", () => {
  const plan = createPlan();
  plan.days[0].meals[0].ingredients[0].name = "Beef stock";
  assert.equal(hasBeef(plan), true);

  const safePlan = createPlan();
  assert.equal(hasBeef(safePlan), false);
});
