import { NextResponse } from "next/server";
import { initDb } from "@/lib/models";
import { hasBeef, isValidMealPlan } from "@/lib/mealPlanValidation";

const MAX_PLAN_SIZE = 200_000;
const MAX_COMMENT_LENGTH = 500;

async function getFamilyForMember(db, uid) {
  if (typeof uid !== "string" || !uid.trim()) return null;
  return db.FamilySync.findOne({ "members.firebaseUID": uid.trim() });
}

export async function PUT(request) {
  try {
    const body = await request.json();
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    const { plan } = body;
    if (!uid || !plan) return NextResponse.json({ error: "User and meal plan are required." }, { status: 400 });
    if (!isValidMealPlan(plan) || hasBeef(plan)
      || !Array.isArray(plan.groceryList)
      || !plan.groceryList.every((item) => typeof item.name === "string" && typeof item.quantity === "string")) {
      return NextResponse.json({ error: "The meal plan must contain seven complete days and a valid grocery list." }, { status: 400 });
    }
    if (Buffer.byteLength(JSON.stringify(plan), "utf8") > MAX_PLAN_SIZE) {
      return NextResponse.json({ error: "The meal plan is too large to share." }, { status: 413 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    const family = await getFamilyForMember(db, uid);
    if (!family) return NextResponse.json({ error: "Join a family group before sharing a meal plan." }, { status: 404 });

    const member = family.members.find((item) => item.firebaseUID === uid);
    const sharedMealPlan = {
      days: plan.days,
      groceryList: plan.groceryList,
      currency: typeof plan.currency === "string" ? plan.currency.slice(0, 3) : "USD",
      estimated: plan.estimated !== false,
      updatedAt: new Date(),
      updatedBy: uid,
      updatedByName: member?.name || member?.email || "Family member",
    };
    family.sharedMealPlan = sharedMealPlan;
    await family.save();
    return NextResponse.json({ success: true, sharedMealPlan });
  } catch (error) {
    console.error("[Family Meal Plan PUT]", error.message);
    return NextResponse.json({ error: "Could not share or update the family meal plan." }, { status: 500 });
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const uid = typeof body.uid === "string" ? body.uid.trim() : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!uid || !text) return NextResponse.json({ error: "A user and comment are required." }, { status: 400 });
    if (text.length > MAX_COMMENT_LENGTH) {
      return NextResponse.json({ error: `Comments must be ${MAX_COMMENT_LENGTH} characters or fewer.` }, { status: 400 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });
    const family = await getFamilyForMember(db, uid);
    if (!family) return NextResponse.json({ error: "Join a family group to comment on its meal plan." }, { status: 404 });
    if (!family.sharedMealPlan) return NextResponse.json({ error: "Share a meal plan with your family before commenting." }, { status: 409 });

    const member = family.members.find((item) => item.firebaseUID === uid);
    const comment = {
      uid,
      name: member?.name || member?.email || "Family member",
      text,
      createdAt: new Date(),
    };
    const updatedFamily = await db.FamilySync.findOneAndUpdate(
      { _id: family._id, "members.firebaseUID": uid, sharedMealPlan: { $ne: null } },
      { $push: { mealPlanComments: { $each: [comment], $slice: -100 } } },
      { new: true }
    ).lean();
    if (!updatedFamily) {
      return NextResponse.json({ error: "The shared meal plan is no longer available." }, { status: 409 });
    }
    return NextResponse.json({ success: true, comments: updatedFamily.mealPlanComments || [] });
  } catch (error) {
    console.error("[Family Meal Plan Comment]", error.message);
    return NextResponse.json({ error: "Could not add your comment." }, { status: 500 });
  }
}
