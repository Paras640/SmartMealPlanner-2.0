import { NextResponse } from "next/server";
import { containsBeef } from "@/lib/recipeDietaryFilter";

export async function GET(request, { params }) {
  try {
    const { id } = await params;
    if (!id) return NextResponse.json({ error: "No recipe ID provided" }, { status: 400 });

    const theMealDbUrl = `https://www.themealdb.com/api/json/v1/1/lookup.php?i=${id}`;
    const res = await fetch(theMealDbUrl, { next: { revalidate: 60 } });
    const data = await res.json();

    if (!res.ok || !data.meals) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }

    const meal = data.meals[0];
    if (containsBeef({
      title: meal.strMeal,
      mealType: meal.strCategory,
      ingredients: Array.from({ length: 20 }, (_, index) => meal[`strIngredient${index + 1}`]).filter(Boolean),
    })) {
      return NextResponse.json({ error: "Recipe not found" }, { status: 404 });
    }
    const ingredients = [];
    for (let i = 1; i <= 20; i++) {
      const ingredient = meal[`strIngredient${i}`];
      const measure = meal[`strMeasure${i}`];
      if (ingredient && ingredient.trim() !== "") {
        ingredients.push(`${measure ? measure.trim() : ""} ${ingredient.trim()}`.trim());
      }
    }

    const recipe = {
      id: meal.idMeal,
      title: meal.strMeal,
      image: meal.strMealThumb,
      category: meal.strCategory,
      area: meal.strArea,
      instructions: meal.strInstructions ? meal.strInstructions.split('\n').filter(s => s.trim()) : [],
      ingredients,
      url: meal.strYoutube,
      tags: meal.strTags ? meal.strTags.split(",") : [],
      calories: Math.floor(Math.random() * (700 - 300 + 1) + 300) // Mock calories
    };

    return NextResponse.json({ recipe });
  } catch (err) {
    console.error("[Recipe Detail API] Internal error:", err.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
