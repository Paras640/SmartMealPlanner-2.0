import { NextResponse } from "next/server";
import Groq from "groq-sdk";
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

Rules:
- ALWAYS stay on topic: food, nutrition, cooking, meal planning
- If asked something unrelated, gently redirect: "I'm best at food topics! 🍽️ Can I help with a recipe or meal plan?"
- For recipe requests: include ingredients list, step-by-step instructions, and approx. calories
- Keep responses concise but complete (2–5 paragraphs max)
- Never make up dangerous nutrition advice — recommend consulting a doctor for medical dietary needs
- CRITICAL: If you suggest a specific recipe/meal, or if the user asks you to generate/show an image, DO NOT say you cannot generate images. Instead, fulfill their request by saying "Here is a picture of [Dish Name]!" and you MUST append this exact tag at the very end of your response: [IMAGE: Exact Name of Dish]`;

// ── Groq Client ──────────────────────────────────────────────────────────────
let _groq = null;

function getGroq() {
  if (_groq) return _groq;
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) return null;
  _groq = new Groq({ apiKey });
  return _groq;
}

// ── Hugging Face Image Generation ─────────────────────────────────────────────
async function generateHuggingFaceImage(prompt) {
  const hfKey = process.env.HUGGINGFACE_API_KEY;
  if (!hfKey) return null;
  try {
    const response = await fetch("https://api-inference.huggingface.co/models/stabilityai/stable-diffusion-xl-base-1.0", {
      headers: { 
        Authorization: `Bearer ${hfKey}`, 
        "Content-Type": "application/json" 
      },
      method: "POST",
      body: JSON.stringify({ 
        inputs: "professional food photography of " + prompt + ", highly detailed, 4k, delicious, appetizing, cinematic lighting, restaurant quality" 
      }),
    });
    if (!response.ok) {
      console.warn("[HF API Error]:", response.status, response.statusText);
      return null;
    }
    const arrayBuffer = await response.arrayBuffer();
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:image/jpeg;base64,${base64}`;
  } catch (err) {
    console.error("[HF Image Gen Error]", err.message);
    return null;
  }
}

// ── Fallback (Offline/Overloaded Mode) ──────────────────────────────────────────
function fallbackResponse(message) {
  const lower = message.toLowerCase();
  let text = "I'm currently experiencing high server demand, but I'm still here to help! 🥗 ";

  if (lower.includes("hello") || lower.includes("hi") || lower.includes("hey")) {
    text = "Hi there! 👋 I'm NutriBot. The AI servers are super busy right now, but I can still answer basic questions about recipes, meal plans, or nutrition facts!";
  } else if (lower.includes("recipe") || lower.includes("cook") || lower.includes("make") || lower.includes("how")) {
    text = "I'd love to help with a recipe! 🍳 Since the AI is heavily loaded right now, I recommend trying a classic like Grilled Lemon Herb Chicken. Let me know if you need basic instructions!";
  } else if (lower.includes("calorie") || lower.includes("nutrition") || lower.includes("healthy") || lower.includes("diet")) {
    text = "Great nutrition question! 🥗 For a balanced meal, aim for lean proteins, complex carbs, and plenty of vegetables. Keep it simple and colorful!";
  } else if (lower.includes("vegan") || lower.includes("vegetarian") || lower.includes("keto")) {
    text = "Dietary lifestyles are important! 🌱 While my brain is a bit overloaded today, the best advice for any diet is to focus on whole, unprocessed foods.";
  } else {
    text += "That's an interesting question! 🤔 While my advanced AI is taking a quick breather due to high demand, please check out the 'Recipes' tab for some great meal ideas.";
  }

  return { text, imageUrl: null, dishName: null };
}

// ── Chat Response Generator ────────────────────────────────────────────────────
async function generateChatResponse(userMessage, history = [], modelId = "openai/gpt-oss-120b") {
  const groq = getGroq();
  if (!groq) {
    return {
      text: "⚠️ AI is not configured. Please add `GROQ_API_KEY` to `.env.local`.",
      imageUrl: null,
    };
  }

  // Handle decommissioned models fallback to an available model
  let activeModel = modelId || "openai/gpt-oss-120b";
  if (!["openai/gpt-oss-120b", "openai/gpt-oss-20b", "qwen/qwen3.8-27b"].includes(activeModel)) {
    activeModel = "openai/gpt-oss-120b";
  }

  try {
    // Build conversation history for multi-turn chat
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-10).map((m) => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: m.text,
      })),
      { role: "user", content: userMessage }
    ];

    const completion = await groq.chat.completions.create({
      model: activeModel,
      messages: messages,
      temperature: 0.85,
      max_tokens: 800,
    });

    let responseText = completion.choices[0]?.message?.content || "";
    let imageUrl = null;
    let dishName = null;

    // Check for image tag
    const imageMatch = responseText.match(/\[IMAGE:\s*(.+?)\]/i);
    if (imageMatch) {
      dishName = imageMatch[1].trim();
      responseText = responseText.replace(imageMatch[0], "").trim();
      console.log("[HF] Generating image for:", dishName);
      imageUrl = await generateHuggingFaceImage(dishName);
    }

    return { text: responseText, imageUrl, dishName };
  } catch (err) {
    console.error("[Chat API] Groq error:", err.message);
    // Fallback mode for exhibition if API is overloaded
    return fallbackResponse(userMessage);
  }
}

// ── POST: Send a message ───────────────────────────────────────────────────────
export async function POST(request) {
  try {
    const { message, userId, firebaseUID, modelId } = await request.json();
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

    const { text: replyText, imageUrl, dishName } = await generateChatResponse(message, history, modelId);

    // Save conversation to DB
    if (db && (userId || firebaseUID)) {
      try {
        const messagesToSave = [
          { role: "user", text: message, timestamp: new Date() },
          { role: "bot", text: replyText, imageUrl, dishName, timestamp: new Date() },
        ];
        await db.ChatSession.findOneAndUpdate(
          { $or: [{ userId }, { firebaseUID }] },
          {
            $set: { userId, firebaseUID, updatedAt: new Date() },
            $push: { messages: { $each: messagesToSave } },
          },
          { upsert: true, returnDocument: 'after' }
        );
      } catch (saveErr) {
        console.warn("[Chat] Failed to save:", saveErr.message);
      }
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
