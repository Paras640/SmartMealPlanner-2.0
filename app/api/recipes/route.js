import { NextResponse } from "next/server";
import { initDb } from "@/lib/models";
import { fetchMealDbSearch } from "@/lib/recipeSearch";

/**
 * Universal multi-stage recipe search using TheMealDB:
 * Stage 1: Search by name (s=)
 * Stage 2: Search by category (c=)
 * Stage 3: Search by main ingredient (i=)
 * Stage 4: Search by area/cuisine (a=)
 * Stage 5: First-letter with strict filter
 */
async function fetchWithFallback(query) {
  const meals = await fetchMealDbSearch(query);

  if (meals.length > 0) {
    return { meals: meals.slice(0, 24), matchedBy: "universal-search" };
  }

  return { meals: [], matchedBy: "none" };
}

function mapMeal(meal) {
  const ingredients = [];
  for (let i = 1; i <= 20; i++) {
    const ingredient = meal[`strIngredient${i}`];
    const measure = meal[`strMeasure${i}`];
    if (ingredient && ingredient.trim() !== "") {
      ingredients.push(`${measure ? measure.trim() : ""} ${ingredient.trim()}`.trim());
    }
  }

  let readyInMinutes = 30;
  const cat = meal.strCategory ? meal.strCategory.toLowerCase() : "";
  if (["dessert", "beef", "pork", "lamb"].includes(cat)) {
    readyInMinutes = 45 + Math.floor(Math.random() * 30);
  } else if (["breakfast", "starter"].includes(cat)) {
    readyInMinutes = 10 + Math.floor(Math.random() * 15);
  } else if (["seafood", "side", "vegetarian", "vegan"].includes(cat)) {
    readyInMinutes = 20 + Math.floor(Math.random() * 15);
  } else if (["chicken", "pasta"].includes(cat)) {
    readyInMinutes = 25 + Math.floor(Math.random() * 15);
  } else {
    readyInMinutes = 20 + Math.floor(Math.random() * 40);
  }

  return {
    id: meal.idMeal,
    title: meal.strMeal,
    image: meal.strMealThumb ?? null,
    calories: Math.floor(Math.random() * 400 + 300),
    readyInMinutes,
    cuisineType: meal.strArea ?? null,
    mealType: meal.strCategory ?? null,
    dietLabels: meal.strTags ? meal.strTags.split(",").map(t => t.trim()).filter(Boolean) : [],
    ingredients,
    url: meal.strYoutube ?? meal.strSource ?? null,
    source: "TheMealDB",
  };
}

// ─── GET: Search recipes ──────────────────────────────────────────────────────

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const query = searchParams.get("query") || "chicken";

    const { meals, matchedBy } = await fetchWithFallback(query.trim());
    const recipes = meals.map(mapMeal);

    return NextResponse.json({ recipes, count: recipes.length, matchedBy });
  } catch (err) {
    console.error("[Recipes API] Internal error:", err.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ─── POST: Save a recipe to MongoDB ──────────────────────────────────────────
// Use this endpoint to persist a recipe from TheMealDB into your own database.
// Body: { mealDbId, title, category, area, ingredients, instructions, image, tags, calories }

export async function POST(request) {
  try {
    const body = await request.json();
    const { mealDbId, title, category, area, ingredients, instructions, image, tags, calories, firebaseUID } = body;

    if (!title) {
      return NextResponse.json({ error: "title is required" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    // Build the document — use mealDbId as the unique external key
    const recipeData = {
      title,
      category: category || "All",
      area,
      ingredients: Array.isArray(ingredients)
        ? ingredients.map(i => (typeof i === "string" ? { name: i } : i))
        : [],
      steps: Array.isArray(instructions) ? instructions : [],
      imageURL: image || null,
      tags: tags || [],
      calories: calories || 0,
      scrapedFromWeb: false,
      createdBy: firebaseUID || null,
      createdAt: new Date(),
    };

    // If mealDbId provided, upsert so we don't duplicate
    let recipe;
    if (mealDbId) {
      recipe = await db.Recipe.findOneAndUpdate(
        { mealDbId: String(mealDbId) },
        { $set: { ...recipeData, mealDbId: String(mealDbId) } },
        { upsert: true, new: true }
      );
    } else {
      recipe = await db.Recipe.create(recipeData);
    }

    return NextResponse.json({ success: true, recipe }, { status: 201 });
  } catch (err) {
    console.error("[Recipes POST]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}