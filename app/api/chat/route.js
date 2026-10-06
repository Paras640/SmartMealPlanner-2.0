import { NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { initDb } from "@/lib/models";

// ── System Prompt ──────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `You are NutriBot, a warm, intelligent AI nutrition and meal planning assistant built into SmartMeal Planner.

Your personality:
- Friendly, encouraging, and conversational — like a knowledgeable chef friend
- You use occasional emojis to keep things lively 🍳🥗✨
- You speak naturally, never robotically

Your capabilities:
- Suggest recipes based on ingredients, cuisine, dietary needs, or mood
- Provide step-by-step cooking instructions with ingredient quantities
- Give nutritional information (calories, protein, carbs, fat, fiber)
- Create weekly/daily meal plans tailored to goals
- Suggest ingredient substitutions
- Help with dietary restrictions (vegan, keto, diabetic-friendly, gluten-free, etc.)
- Calculate portion sizes and macros

IMPORTANT — Recipe Image Generation:
- Whenever you suggest or describe a specific dish/recipe, ALWAYS end your message with this exact tag on its own line:
  [GENERATE_IMAGE: <dish name>]
- Example: [GENERATE_IMAGE: Creamy Garlic Butter Chicken]
- Only include this tag when talking about a specific dish, not for general nutrition advice.

Rules:
- ALWAYS stay on topic: food, nutrition, cooking, meal planning
- If asked something unrelated, gently redirect: "I'm best at food topics! 🍽️ Can I help with a recipe or meal plan?"
- For recipe requests: include ingredients list, step-by-step instructions, and approx. calories
- Keep responses concise but complete (2–5 paragraphs max)
- Never make up dangerous nutrition advice — recommend consulting a doctor for medical dietary needs`;

// ── Gemini Client ──────────────────────────────────────────────────────────────
let _genAI = null;

function getGenAI() {
  if (_genAI) return _genAI;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;
  _genAI = new GoogleGenerativeAI(apiKey);
  return _genAI;
}

// ── Image Generation ───────────────────────────────────────────────────────────
async function generateDishImage(dishName) {
  try {
    const genAI = getGenAI();
    if (!genAI) return null;

    // Use gemini-3.1-flash-image for food image generation
    const model = genAI.getGenerativeModel({ model: "gemini-3.1-flash-image" });
    const result = await model.generateContent(
      `Generate a professional food photography image of: ${dishName}. Beautiful plating, soft natural lighting, restaurant quality, appetizing, high resolution.`
    );
    
    const parts = result?.response?.candidates?.[0]?.content?.parts;
    const imagePart = parts?.find(p => p.inlineData);
    if (imagePart?.inlineData) {
      return `data:${imagePart.inlineData.mimeType};base64,${imagePart.inlineData.data}`;
    }
    return null;
  } catch (err) {
    console.error("[Image Gen] Error:", err.message);
    return null;
  }
}

// ── Chat Response Generator ────────────────────────────────────────────────────
async function generateChatResponse(userMessage, history = []) {
  const genAI = getGenAI();
  if (!genAI) {
    return {
      text: "⚠️ AI is not configured. Please add `GEMINI_API_KEY` to `.env.local`.",
      imageUrl: null,
    };
  }

  try {
    const model = genAI.getGenerativeModel({
      model: "gemini-2.5-flash",
      systemInstruction: SYSTEM_PROMPT,
    });

    // Build conversation history for multi-turn chat
    const chatHistory = history.slice(-10).map((m) => ({
      role: m.role === "bot" ? "model" : "user",
      parts: [{ text: m.text }],
    }));

    const chat = model.startChat({
      history: chatHistory,
      generationConfig: {
        temperature: 0.85,
        maxOutputTokens: 800,
      },
    });

    const result = await chat.sendMessage(userMessage);
    let responseText = result.response.text();

    // Extract image generation tag if present
    const imageTagMatch = responseText.match(/\[GENERATE_IMAGE:\s*(.+?)\]/);
    let imageUrl = null;
    let dishName = null;

    if (imageTagMatch) {
      dishName = imageTagMatch[1].trim();
      // Remove the tag from the displayed text
      responseText = responseText.replace(imageTagMatch[0], "").trim();
      // Generate the image in parallel (non-blocking display)
      imageUrl = await generateDishImage(dishName);
    }

    return { text: responseText, imageUrl, dishName };
  } catch (err) {
    console.error("[Chat API] Gemini error:", err.message);
    return {
      text: "I'm having trouble connecting right now. Please try again in a moment! 🙏",
      imageUrl: null,
    };
  }
}

// ── POST: Send a message ───────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { message, userId, firebaseUID } = await request.json();
    if (!message?.trim()) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 });
    }

    // Load conversation history
    let history = [];
    let db = null;
    try {
      db = await initDb();
      if (db && (userId || firebaseUID)) {
        const session = await db.ChatSession.findOne({
          $or: [{ userId }, { firebaseUID }],
        });
        history = session?.messages || [];
      }
    } catch (dbErr) {
      console.warn("[Chat] DB unavailable:", dbErr.message);
    }

    const { text: replyText, imageUrl, dishName } = await generateChatResponse(message, history);

    // Save conversation to DB
    if (db && (userId || firebaseUID)) {
      try {
        const messagesToSave = [
          { role: "user", text: message, timestamp: new Date() },
          { role: "bot", text: replyText, timestamp: new Date() },
        ];
        await db.ChatSession.findOneAndUpdate(
          { $or: [{ userId }, { firebaseUID }] },
          {
            $set: { userId, firebaseUID, updatedAt: new Date() },
            $push: { messages: { $each: messagesToSave } },
          },
          { upsert: true, new: true }
        );
      } catch (saveErr) {
        console.warn("[Chat] Failed to save:", saveErr.message);
      }
    }

    if (replyText.includes("⚠️ AI is not configured") || replyText.includes("I'm having trouble connecting right now")) {
       return NextResponse.json({ error: "AI is currently overloaded due to high demand. Spikes in demand are temporary. Please try again." }, { status: 503 });
    }

    return NextResponse.json({ text: replyText, imageUrl, dishName });
  } catch (err) {
    console.error("[Chat API] Error:", err.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── DELETE: Delete a message ───────────────────────────────────────────────────
export async function DELETE(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    const messageId = searchParams.get("messageId");
    if (!userId || !messageId) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    await db.ChatSession.updateOne(
      { $or: [{ userId }, { firebaseUID: userId }] },
      { $pull: { messages: { _id: messageId } } }
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Chat DELETE]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── PUT: Edit a message ────────────────────────────────────────────────────────
export async function PUT(request) {
  try {
    const { userId, messageId, newText } = await request.json();
    if (!userId || !messageId || !newText) return NextResponse.json({ error: "Missing params" }, { status: 400 });

    const db = await initDb();
    if (!db) return NextResponse.json({ error: "DB unavailable" }, { status: 503 });

    await db.ChatSession.updateOne(
      { $or: [{ userId }, { firebaseUID: userId }], "messages._id": messageId },
      { $set: { "messages.$.text": newText, updatedAt: new Date() } }
    );
    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[Chat PUT]", err.message);
    return NextResponse.json({ error: "Server error" }, { status: 500 });
  }
}

// ── GET: Fetch chat history ────────────────────────────────────────────────────
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get("userId");
    if (!userId) return NextResponse.json([]);

    const db = await initDb();
    if (!db) return NextResponse.json([]);

    const session = await db.ChatSession.findOne({
      $or: [{ userId }, { firebaseUID: userId }],
    });

    return NextResponse.json(session?.messages || []);
  } catch (err) {
    console.error("[Chat GET]", err.message);
    return NextResponse.json([]);
  }
}
