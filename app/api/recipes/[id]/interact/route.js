import { NextResponse } from "next/server";
import { initDb } from "@/lib/models";

// GET: Fetch interactions (likes, dislikes, comments) for a recipe
export async function GET(request, { params }) {
  try {
    const { id } = await params;
    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    // Fetch or create recipe doc to track likes/dislikes
    let recipeDoc = await db.Recipe.findOne({ spoonacularId: id }).lean();
    if (!recipeDoc) {
      recipeDoc = { likes: [], dislikes: [] }; // Default empty state if not interacted yet
    } else {
        recipeDoc.likes = recipeDoc.likes || [];
        recipeDoc.dislikes = recipeDoc.dislikes || [];
    }

    // Fetch comments (threads linked to this recipeId)
    const comments = await db.Thread.find({ recipeId: id }).sort({ createdAt: -1 }).lean();

    return NextResponse.json({
      likes: recipeDoc.likes,
      dislikes: recipeDoc.dislikes,
      comments,
    });
  } catch (err) {
    console.error("[Recipe Interact GET]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST: Add comment, like, or dislike
export async function POST(request, { params }) {
  try {
    const { id } = await params;
    const { action, firebaseUID, user, email, avatar, content, recipeTitle } = await request.json();

    if (!firebaseUID) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    if (action === "comment") {
      if (!content?.trim()) {
        return NextResponse.json({ error: "Content is required" }, { status: 400 });
      }
      const comment = await db.Thread.create({
        recipeId: id,
        recipeTitle: recipeTitle || "Recipe",
        user: user || "Anonymous",
        email: email || "",
        avatar: avatar || "",
        content: content.trim(),
        tag: "Recipe Comment",
        createdAt: new Date(),
      });
      return NextResponse.json({ success: true, comment });
    } 
    
    if (action === "like" || action === "dislike") {
      // Find or create recipe doc using spoonacularId field to store the string ID (or we can just query it)
      // Note: spoonacularId in schema is Number, but strict is false. Let's use id directly as string
      // To avoid schema type errors, let's query by mealDbId if we created one, but we'll reuse spoonacularId for now
      // Actually let's use a standard upsert on spoonacularId by casting ID to string if needed.
      // But spoonacularId is typed as Number in models.js. Let's use `mealDbId` instead.
      
      let recipe = await db.Recipe.findOne({ mealDbId: id });
      if (!recipe) {
          // If not found by mealDbId, try spoonacularId just in case it's an old one, or create new
          recipe = await db.Recipe.findOne({ spoonacularId: id });
      }

      if (!recipe) {
        recipe = new db.Recipe({ mealDbId: id, title: recipeTitle || "Unknown Recipe", likes: [], dislikes: [] });
      }

      // Initialize arrays if they don't exist
      recipe.likes = recipe.likes || [];
      recipe.dislikes = recipe.dislikes || [];

      // Check current state before modifying
      const hasLiked = recipe.likes.includes(firebaseUID);
      const hasDisliked = recipe.dislikes.includes(firebaseUID);

      // Remove from both first to ensure mutually exclusive
      recipe.likes = recipe.likes.filter(uid => uid !== firebaseUID);
      recipe.dislikes = recipe.dislikes.filter(uid => uid !== firebaseUID);

      if (action === "like" && !hasLiked) {
        recipe.likes.push(firebaseUID);
      } else if (action === "dislike" && !hasDisliked) {
        recipe.dislikes.push(firebaseUID);
      }

      await recipe.save();
      return NextResponse.json({ success: true, likes: recipe.likes, dislikes: recipe.dislikes });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  } catch (err) {
    console.error("[Recipe Interact POST]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
