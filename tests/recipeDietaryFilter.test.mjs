import test from "node:test";
import assert from "node:assert/strict";
import { isRecipeAllowedForDiet } from "../lib/recipeDietaryFilter.js";

test("excludes animal ingredients and meat categories for vegetarian recipes", () => {
  assert.equal(isRecipeAllowedForDiet({ mealType: "Chicken", ingredients: ["Rice", "Tomato"] }, "Veg"), false);
  assert.equal(isRecipeAllowedForDiet({ mealType: "Vegetarian", ingredients: ["Eggplant", "Rice"] }, "Veg"), true);
  assert.equal(isRecipeAllowedForDiet({ mealType: "Pasta", ingredients: ["Anchovy", "Tomato"] }, "Vegetarian"), false);
});

test("vegan recipes exclude animal products without rejecting plant ingredient names", () => {
  assert.equal(isRecipeAllowedForDiet({ mealType: "Dessert", ingredients: ["Eggplant", "Flour"] }, "Vegan"), true);
  assert.equal(isRecipeAllowedForDiet({ mealType: "Vegetarian", ingredients: ["Milk", "Flour"] }, "Vegan"), false);
  assert.equal(isRecipeAllowedForDiet({ mealType: "Pasta", ingredients: ["Chicken", "Tomato"] }, "Vegan"), false);
  assert.equal(isRecipeAllowedForDiet({ mealType: "Vegan", dietLabels: ["vegan"], ingredients: ["Beans"] }, "Vegan"), true);
});

test("unrestricted preferences do not hide recipes", () => {
  assert.equal(isRecipeAllowedForDiet({ mealType: "Chicken", ingredients: ["Chicken"] }, "All"), true);
  assert.equal(isRecipeAllowedForDiet({ mealType: "Chicken", ingredients: ["Chicken"] }, "Non-Veg"), true);
});

test("does not allow vegetarian or vegan recipes without verifiable ingredients", () => {
  assert.equal(isRecipeAllowedForDiet({ mealType: "Vegetarian" }, "Veg"), false);
  assert.equal(isRecipeAllowedForDiet({ mealType: "Dessert" }, "Vegan"), false);
});
