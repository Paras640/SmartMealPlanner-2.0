import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { hasListedAllergen, isValidMealPlan } from "@/lib/mealPlanValidation";

const MAX_INGREDIENTS = 40;
const MAX_ALLERGIES = 20;
const CURRENCIES = new Set(["USD", "INR", "EUR", "GBP", "CAD", "AUD"]);
const PLAN_SCHEMA_EXAMPLE = JSON.stringify({
  days: [{
    day: "Monday",
    meals: [{
      type: "Breakfast",
      name: "Example meal",
      description: "A short description",
      ingredients: [{ name: "Ingredient", quantity: "1 cup" }],
      steps: ["First step", "Second step"],
      usesPantry: ["Ingredient"],
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      fiber: 0,
      estimatedCost: 0,
      substitutions: [{ avoid: "Ingredient", use: "Alternative" }],
    }],
  }],
  groceryList: [{ name: "Ingredient", quantity: "1 cup" }],
});
const SYSTEM_PROMPT = [
  "Create practical, safe seven-day meal plans. Return only valid JSON matching this shape:",
  PLAN_SCHEMA_EXAMPLE,
  "Include exactly seven days and 2-3 meals per day. Keep recipes concise: 3-6 ingredients and 2-4 short steps each.",
  "Nutrition values are approximate per serving; meal cost is an approximate total for the requested servings in the requested currency.",
  "Consolidate the grocery list by ingredient, exclude items already in the pantry, and include quantities.",
  "List only substitutions that are safe and relevant. Treat every listed allergy as a strict exclusion: never include the allergen or suggest it as a substitute.",
  "Before returning the plan, check every recipe and shopping-list ingredient against each listed allergy.",
  "Do not make medical claims or promise exact nutrition or prices. Respect the requested diet, servings, budget, pantry, and calorie target as closely as practical.",
  "Use pantry items first to reduce waste. For meals without a known exact nutrition value, provide reasonable estimates.",
].join(" ");

function cleanList(value, limit) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((item) => typeof item === "string")
    .map((item) => item.trim().slice(0, 80))
    .filter(Boolean)
    .slice(0, limit);
}

export async function POST(request) {
  try {
    const body = await request.json();
    const pantry = cleanList(body.pantry, MAX_INGREDIENTS);
    const allergies = cleanList(body.allergies, MAX_ALLERGIES);
    const dietaryPreference = typeof body.dietaryPreference === "string"
      ? body.dietaryPreference.trim().slice(0, 60)
      : "No preference";
    const currency = CURRENCIES.has(body.currency) ? body.currency : "USD";
    const servings = Number(body.servings);
    const calorieTarget = body.calorieTarget ? Number(body.calorieTarget) : null;
    const budget = body.budget ? Number(body.budget) : null;

    if (pantry.length === 0) {
      return NextResponse.json({ error: "Add at least one ingredient you have on hand." }, { status: 400 });
    }
    if (!Number.isInteger(servings) || servings < 1 || servings > 12) {
      return NextResponse.json({ error: "Servings must be between 1 and 12." }, { status: 400 });
    }
    if (calorieTarget !== null && (!Number.isFinite(calorieTarget) || calorieTarget < 500 || calorieTarget > 10000)) {
      return NextResponse.json({ error: "Daily calorie target must be between 500 and 10,000." }, { status: 400 });
    }
    if (budget !== null && (!Number.isFinite(budget) || budget <= 0 || budget > 1000000)) {
      return NextResponse.json({ error: "Enter a valid weekly budget." }, { status: 400 });
    }

    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "Meal planning AI is not configured. Add GROQ_API_KEY to the server environment." }, { status: 503 });
    }

    const groq = new Groq({ apiKey });
    const completion = await groq.chat.completions.create({
      model: "openai/gpt-oss-120b",
      temperature: 0.4,
      max_tokens: 8192,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: SYSTEM_PROMPT,
        },
        {
          role: "user",
          content: JSON.stringify({
            pantry,
            dietaryPreference,
            allergies,
            servings,
            currency,
            weeklyBudget: budget,
            dailyCalorieTarget: calorieTarget,
          }),
        },
      ],
    });

    const content = completion.choices[0]?.message?.content;
    if (typeof content !== "string") {
      console.error("[Meal Planner] AI returned no content");
      return NextResponse.json({ error: "The planner did not return a meal plan. Please try again." }, { status: 502 });
    }

    let plan;
    try {
      plan = JSON.parse(content);
    } catch (error) {
      console.error("[Meal Planner] Could not parse AI response:", error.message);
      return NextResponse.json({ error: "The planner returned an unreadable result. Please try again." }, { status: 502 });
    }

    if (!isValidMealPlan(plan) || !Array.isArray(plan.groceryList)
      || !plan.groceryList.every((item) => typeof item.name === "string" && typeof item.quantity === "string")) {
      console.error("[Meal Planner] AI response did not match the expected meal-plan shape");
      return NextResponse.json({ error: "The planner returned an incomplete plan. Please try again." }, { status: 502 });
    }

    if (hasListedAllergen(plan, plan.groceryList, allergies)) {
      console.warn("[Meal Planner] AI response contained an ingredient matching a listed allergy");
      return NextResponse.json({ error: "The generated plan may contain an ingredient you listed as an allergy. Please try again." }, { status: 502 });
    }

    return NextResponse.json({
      days: plan.days,
      groceryList: plan.groceryList.slice(0, 120),
      currency,
      estimated: true,
    });
  } catch (error) {
    console.error("[Meal Planner POST]", error.message);
    return NextResponse.json({ error: "Could not create a meal plan right now. Please try again." }, { status: 500 });
  }
}
