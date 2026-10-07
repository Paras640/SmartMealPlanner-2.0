import { NextResponse } from "next/server";
import Groq from "groq-sdk";
import { randomUUID } from "node:crypto";
import { initDb } from "@/lib/models";
import { hasListedAllergen, isValidMealPlan } from "@/lib/mealPlanValidation";

const MAX_INGREDIENTS = 40;
const MAX_ALLERGIES = 20;
const MAX_GENERATION_ATTEMPTS = 2;
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
  "Include exactly seven days and 2-3 meals per day. Keep recipes concise: 3-5 ingredients and 2-3 short steps each.",
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

export async function GET(request) {
  try {
    const uid = new URL(request.url).searchParams.get("uid")?.trim();
    if (!uid) return NextResponse.json({ error: "Missing user ID." }, { status: 400 });

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    const user = await db.User.findOne({ firebaseUID: uid }, { recentMealPlans: 1 }).lean();
    return NextResponse.json({ recentPlans: [...(user?.recentMealPlans || [])].reverse() });
  } catch (error) {
    console.error("[Meal Planner GET]", error.message);
    return NextResponse.json({ error: "Could not load recent meal plans." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const firebaseUID = typeof body.firebaseUID === "string" ? body.firebaseUID.trim() : "";
    const userName = typeof body.userName === "string" ? body.userName.trim().slice(0, 100) : "";
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
    const requestDetails = JSON.stringify({
      pantry,
      dietaryPreference,
      allergies,
      servings,
      currency,
      weeklyBudget: budget,
      dailyCalorieTarget: calorieTarget,
    });
    let previousResponse = null;

    for (let attempt = 0; attempt < MAX_GENERATION_ATTEMPTS; attempt += 1) {
      const messages = [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: requestDetails },
      ];
      if (previousResponse) {
        messages.push(
          { role: "assistant", content: previousResponse },
          {
            role: "user",
            content: "The previous result was incomplete or invalid. Return a complete, compact, valid JSON plan with exactly seven days, two meals per day, every required nutrition field, and a groceryList. Do not omit fields or truncate the JSON. Avoid every listed allergy.",
          },
        );
      }

      let completion;
      try {
        completion = await groq.chat.completions.create({
          model: "openai/gpt-oss-120b",
          temperature: 0.3,
          max_completion_tokens: 16000,
          reasoning_effort: "low",
          response_format: { type: "json_object" },
          messages,
        });
      } catch (error) {
        const providerError = error.error?.error || error.error;
        if (providerError?.code !== "json_validate_failed" || typeof providerError.failed_generation !== "string") {
          throw error;
        }

        console.warn(`[Meal Planner] Provider rejected malformed JSON (attempt ${attempt + 1}); retrying with a repair prompt`);
        previousResponse = providerError.failed_generation;
        continue;
      }

      const choice = completion.choices[0];
      const content = choice?.message?.content;
      if (typeof content !== "string") {
        console.error("[Meal Planner] AI returned no content");
        previousResponse = null;
        continue;
      }
      previousResponse = content;

      if (choice.finish_reason === "length") {
        console.warn(`[Meal Planner] AI response was truncated (attempt ${attempt + 1})`);
        continue;
      }

      let plan;
      try {
        plan = JSON.parse(content);
      } catch (error) {
        console.warn(`[Meal Planner] AI response was not valid JSON (attempt ${attempt + 1}):`, error.message);
        continue;
      }

      if (!isValidMealPlan(plan) || !Array.isArray(plan.groceryList)
        || !plan.groceryList.every((item) => typeof item.name === "string" && typeof item.quantity === "string")) {
        console.warn(`[Meal Planner] AI response did not match the expected shape (attempt ${attempt + 1})`);
        continue;
      }

      if (hasListedAllergen(plan, plan.groceryList, allergies)) {
        console.warn(`[Meal Planner] AI response contained a listed allergen (attempt ${attempt + 1})`);
        continue;
      }

      const generatedPlan = {
        days: plan.days,
        groceryList: plan.groceryList.slice(0, 120),
        currency,
        estimated: true,
      };
      let saved = false;
      let familySynced = false;
      let saveWarning = null;
      let savedPlanId = null;
      let savedAt = null;

      if (firebaseUID) {
        try {
          const db = await initDb();
          if (!db) {
            saveWarning = "The plan was generated, but saving is temporarily unavailable.";
          } else {
            const savedPlan = {
              ...generatedPlan,
              id: randomUUID(),
              generatedAt: new Date(),
            };
            savedPlanId = savedPlan.id;
            savedAt = savedPlan.generatedAt;
            await db.User.findOneAndUpdate(
              { firebaseUID },
              { $push: { recentMealPlans: { $each: [savedPlan], $slice: -10 } } },
              { upsert: true, new: true, setDefaultsOnInsert: true },
            );
            saved = true;

            const familyUpdate = await db.FamilySync.findOneAndUpdate(
              { "members.firebaseUID": firebaseUID },
              {
                $set: {
                  sharedMealPlan: {
                    ...savedPlan,
                    updatedAt: savedPlan.generatedAt,
                    updatedBy: firebaseUID,
                    updatedByName: userName || "Family member",
                  },
                },
                $push: { recentSharedMealPlans: { $each: [savedPlan], $slice: -10 } },
              },
              { new: true },
            );
            familySynced = Boolean(familyUpdate);
          }
        } catch (error) {
          console.error("[Meal Planner Save]", error.message);
          saveWarning = "The plan was generated, but could not be saved. Please try again.";
        }
      } else {
        saveWarning = "The plan was generated, but sign in again to save it.";
      }

      return NextResponse.json({
        ...generatedPlan,
        id: savedPlanId,
        generatedAt: savedAt,
        saved,
        familySynced,
        saveWarning,
      });
    }

    console.error("[Meal Planner] Failed to produce a complete, safe plan after retries");
    return NextResponse.json({ error: "The planner could not produce a complete plan this time. Please try again." }, { status: 502 });
  } catch (error) {
    console.error("[Meal Planner POST]", error.message);
    if (error.status === 401 || error.status === 403) {
      return NextResponse.json({ error: "Meal planning is not authorized. Check the server's GROQ_API_KEY configuration." }, { status: 503 });
    }
    if (error.status === 429) {
      return NextResponse.json({ error: "The meal planning service is busy or its usage limit was reached. Please try again shortly." }, { status: 503 });
    }
    if (error.status >= 500) {
      return NextResponse.json({ error: "The meal planning service is temporarily unavailable. Please try again shortly." }, { status: 503 });
    }
    return NextResponse.json({ error: "Could not create a meal plan right now. Please try again." }, { status: 502 });
  }
}
