import { NextResponse } from "next/server";
import { initDb } from "@/lib/models";
import { parseFamilyIdentifier } from "@/lib/familyInvite";
import { hasBeef } from "@/lib/mealPlanValidation";

// GET: Fetch family details by firebaseUID
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const uid = searchParams.get("uid");

    if (!uid) {
      return NextResponse.json({ error: "Missing uid" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    const family = await db.FamilySync.findOne({ "members.firebaseUID": uid }).lean();
    
    if (family) {
      family.sharedMealPlan = family.sharedMealPlan && !hasBeef(family.sharedMealPlan)
        ? family.sharedMealPlan
        : null;
      family.mealPlanComments = family.mealPlanComments || [];
      const memberUids = family.members.map(m => m.firebaseUID);
      const users = await db.User.find({ firebaseUID: { $in: memberUids } }).lean();
      const recipes = await db.Recipe.find({ likes: { $in: memberUids } }).lean();

      family.members = family.members.map(m => {
        const userDetails = users.find(u => u.firebaseUID === m.firebaseUID);
        const likedRecipes = recipes
          .filter(r => r.likes && r.likes.includes(m.firebaseUID))
          .map(r => ({ _id: r._id, title: r.title || r.strMeal, imageURL: r.imageURL || r.strMealThumb, mealDbId: r.mealDbId }));
        
        return {
          ...m,
          preferences: userDetails ? { 
            dietaryType: userDetails.dietaryType, 
            allergies: userDetails.allergies, 
            goal: userDetails.goal, 
            mealPreference: userDetails.mealPreference 
          } : {},
          likedRecipes
        };
      });
    }
    
    return NextResponse.json(family || null);
  } catch (err) {
    console.error("[Family GET]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST: Create or Join Family
export async function POST(request) {
  try {
    const { action, firebaseUID, email, name, familyCode, inviteValue } = await request.json();

    if (!firebaseUID) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    if (action === "create") {
      const code = Math.random().toString(36).substring(2, 8).toUpperCase();
      const newFamily = await db.FamilySync.create({
        familyCode: code,
        createdBy: firebaseUID,
        members: [{ firebaseUID, email, name }],
        sharedGroceryList: []
      });
      return NextResponse.json({ success: true, family: newFamily });
    }

    if (action === "join") {
      const identifier = parseFamilyIdentifier(inviteValue || familyCode || "");
      if (!identifier) return NextResponse.json({ error: "Family code or email is required" }, { status: 400 });

      let family = null;
      if (identifier.type === "code") {
        family = await db.FamilySync.findOne({ familyCode: identifier.value });
      } else {
        family = await db.FamilySync.findOne({ "members.email": identifier.value });
      }

      if (!family) {
        return NextResponse.json({ error: identifier.type === "email" ? "No family found for that email" : "Invalid family code" }, { status: 404 });
      }

      const existing = await db.FamilySync.findOne({ "members.firebaseUID": firebaseUID });
      if (existing) {
        if (existing.familyCode === family.familyCode) {
          return NextResponse.json({ success: true, family });
        }
        await db.FamilySync.updateOne({ _id: existing._id }, { $pull: { members: { firebaseUID } } });
      }

      const updated = await db.FamilySync.findOneAndUpdate(
        { familyCode: family.familyCode },
        { $push: { members: { firebaseUID, email, name } } },
        { new: true }
      );
      return NextResponse.json({ success: true, family: updated });
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  } catch (err) {
    console.error("[Family POST]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// DELETE: Remove member or leave family
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const familyCode = searchParams.get("familyCode");
    const targetUid = searchParams.get("targetUid");
    const requesterUid = searchParams.get("requesterUid"); // The person making the request

    if (!familyCode || !targetUid || !requesterUid) {
       return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    const family = await db.FamilySync.findOne({ familyCode });
    if (!family) return NextResponse.json({ error: "Family not found" }, { status: 404 });

    // Permissions: Only the creator can remove others. Anyone can remove themselves.
    if (targetUid !== requesterUid && family.createdBy !== requesterUid) {
       return NextResponse.json({ error: "Forbidden. Only the creator can remove other members." }, { status: 403 });
    }

    family.members = family.members.filter(m => m.firebaseUID !== targetUid);

    // If no members left, delete the family entirely
    if (family.members.length === 0) {
      await db.FamilySync.deleteOne({ familyCode });
      return NextResponse.json({ success: true, family: null });
    } else {
      // If the creator leaves, assign new creator
      if (family.createdBy === targetUid) {
        family.createdBy = family.members[0].firebaseUID;
      }
      await family.save();
      return NextResponse.json({ success: true, family });
    }
  } catch (err) {
    console.error("[Family DELETE]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
