import { NextResponse } from "next/server";
import { initDb } from "@/lib/models";

// GET: Fetch pending invites for a given email
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const email = searchParams.get("email");

    if (!email) {
      return NextResponse.json({ error: "Missing email" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    const invites = await db.Invite.find({ targetEmail: email, status: 'pending' }).lean();
    return NextResponse.json({ invites });
  } catch (err) {
    console.error("[Invites GET]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// POST: Create a new invite
export async function POST(request) {
  try {
    const { familyCode, senderUid, senderName, targetEmail } = await request.json();

    if (!familyCode || !targetEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    // Check if invite already exists
    const existingInvite = await db.Invite.findOne({ familyCode, targetEmail, status: 'pending' });
    if (existingInvite) {
      return NextResponse.json({ success: true, message: "Invite already pending" });
    }

    const newInvite = await db.Invite.create({
      familyCode,
      senderUid,
      senderName,
      targetEmail,
      status: 'pending'
    });

    return NextResponse.json({ success: true, invite: newInvite });
  } catch (err) {
    console.error("[Invites POST]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// PATCH: Update invite status (accept/reject)
export async function PATCH(request) {
  try {
    const { inviteId, status } = await request.json(); // status can be 'accepted' or 'rejected'

    if (!inviteId || !status) {
      return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
    }

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    const updated = await db.Invite.findByIdAndUpdate(inviteId, { status }, { new: true });
    return NextResponse.json({ success: true, invite: updated });
  } catch (err) {
    console.error("[Invites PATCH]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}
