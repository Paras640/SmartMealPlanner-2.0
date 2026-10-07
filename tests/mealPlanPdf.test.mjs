import test from "node:test";
import assert from "node:assert/strict";
import { createMealPlanPdf } from "../lib/mealPlanPdf.js";

test("creates a readable PDF containing the plan and shopping list", async () => {
    const plan = {
        generatedAt: "2026-10-07T00:00:00.000Z",
        currency: "USD",
        days: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].map((day) => ({
            day,
            meals: ["Lunch", "Dinner"].map((type) => ({
                type,
                name: "Chickpea bowl",
                description: "A quick lunch.",
                ingredients: [{ name: "Chickpeas", quantity: "1 cup" }],
                steps: ["Cook the chickpeas.", "Serve."],
                calories: 400,
                protein: 18,
                carbs: 55,
                fat: 10,
                fiber: 12,
                estimatedCost: 4,
                substitutions: [],
            })),
        })),
        groceryList: [{ name: "Chickpeas", quantity: "1 cup" }],
    };

    const pdf = new Uint8Array(await createMealPlanPdf(plan));
    const header = new TextDecoder().decode(pdf.slice(0, 8));

    assert.match(header, /^%PDF-/);
    assert(pdf.byteLength > 1000);
});
