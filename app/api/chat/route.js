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

// ── Pollinations.ai Image Generation (free, no API key needed) ────────────────
async function generateImage(dishName) {
  try {
    // Simple, direct prompt — just the dish name works best for food images
    const prompt = encodeURIComponent(
      `${dishName}, close-up, on a plate, food photo, white background, studio lighting, top-down view`
    );
    const seed = Math.floor(Math.random() * 1000000);
    const url = `https://image.pollinations.ai/prompt/${prompt}?width=512&height=512&seed=${seed}&nologo=true`;

    // Fetch with a 15-second timeout to avoid blocking the response
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15000);

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; SmartMealPlanner/1.0)',
        'Accept': 'image/jpeg,image/*',
      }
    });
    clearTimeout(timeout);

    if (!response.ok) {
      console.warn("[Image] Pollinations returned:", response.status);
      return null;
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    // Make sure we actually got an image, not an error page
    if (!contentType.startsWith('image/')) {
      console.warn("[Image] Got non-image content-type:", contentType);
      return null;
    }

    const arrayBuffer = await response.arrayBuffer();
    if (arrayBuffer.byteLength < 1000) {
      console.warn("[Image] Image too small, likely invalid:", arrayBuffer.byteLength);
      return null;
    }

    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch (err) {
    if (err.name === 'AbortError') {
      console.warn("[Image] Timed out generating image for:", dishName);
    } else {
      console.error("[Image Gen Error]", err.message);
    }
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
    // Build conversation history — strip any [IMAGE:] tags from history so the AI doesn't get confused
    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...history.slice(-10).map((m) => ({
        role: m.role === "bot" ? "assistant" : "user",
        content: (m.text || "").replace(/\[IMAGE:\s*.+?\]/gi, "").trim(),
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
    let dishName = null;

    // Method 1: Check for explicit [IMAGE:] tag from the AI
    const imageMatch = responseText.match(/\[IMAGE:\s*(.+?)\]/i);
    if (imageMatch) {
      dishName = imageMatch[1].trim();
      responseText = responseText.replace(imageMatch[0], "").trim();
    }

    // Method 2: If no tag found, do a quick separate call to extract dish name
    if (!dishName && responseText.length > 100) {
      try {
        const extractCompletion = await groq.chat.completions.create({
          model: "openai/gpt-oss-20b", // Use fast model for extraction
          messages: [
            {
              role: "system",
              content: "You extract dish names. Given a food/recipe response, reply with ONLY the main dish name (1-4 words). If the response does not contain a specific recipe or dish, reply with exactly: NONE"
            },
            { role: "user", content: responseText.substring(0, 500) }
          ],
          temperature: 0,
          max_tokens: 20,
        });
        const extracted = extractCompletion.choices[0]?.message?.content?.trim();
        if (extracted && extracted !== "NONE" && extracted.length < 50) {
          dishName = extracted;
        }
      } catch (extractErr) {
        console.warn("[Chat] Dish extraction failed:", extractErr.message);
      }
    }

    return { text: responseText, dishName };
  } catch (err) {
    console.error("[Chat API] Groq error:", err.message);
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

    const { text: replyText, dishName } = await generateChatResponse(message, history, modelId);

    // Generate image with timeout — never blocks response for more than 15s
    let imageUrl = null;
    if (dishName) {
      console.log("[Image] Generating for dish:", dishName);
      imageUrl = await generateImage(dishName);
    }

    // Save conversation to DB
    if (db && (userId || firebaseUID)) {
      try {
        const messagesToSave = [
          { role: "user", text: message, timestamp: new Date() },
          { role: "bot", text: replyText, dishName, imageUrl, timestamp: new Date() },
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

    return NextResponse.json({ text: replyText, dishName, imageUrl });
  } catch (err) {
    console.error("[Chat API] Error:", err.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// ── PATCH: Poll for generated image ───────────────────────────────────────────
export async function PATCH(request) {
  try {
    const { userId, messageId } = await request.json();
    if (!userId || !messageId) return NextResponse.json({ ready: false });

    const db = await initDb();
    if (!db) return NextResponse.json({ ready: false });

    const session = await db.ChatSession.findOne({
      $or: [{ userId }, { firebaseUID: userId }],
      "messages._id": messageId,
    });
    const msg = session?.messages?.find(m => m._id?.toString() === messageId);
    if (msg?.imageUrl) {
      return NextResponse.json({ ready: true, imageUrl: msg.imageUrl });
    }
    return NextResponse.json({ ready: false });
  } catch (err) {
    console.error("[Chat PATCH]", err.message);
    return NextResponse.json({ ready: false });
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

    if (messageId === 'all') {
      await db.ChatSession.updateOne(
        { $or: [{ userId }, { firebaseUID: userId }] },
        { $set: { messages: [] } }
      );
    } else {
      await db.ChatSession.updateOne(
        { $or: [{ userId }, { firebaseUID: userId }] },
        { $pull: { messages: { _id: messageId } } }
      );
    }
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
