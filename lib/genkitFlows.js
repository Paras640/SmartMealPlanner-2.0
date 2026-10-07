import { GoogleGenerativeAI } from '@google/generative-ai';

const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
const genAI = apiKey ? new GoogleGenerativeAI(apiKey) : null;

function localNutritionReply(message) {
  const text = String(message || '').toLowerCase();
  if (text.includes('diabet')) {
    return 'For diabetes-friendly meals, focus on high-fiber vegetables, lean protein, measured whole grains, and unsweetened drinks. Share ingredients you have and I can shape a balanced plate.';
  }
  if (text.includes('protein')) {
    return 'A high-protein meal can pair eggs, paneer, tofu, chicken, fish, dal, chickpeas, or Greek yogurt with vegetables and a slow carb like millets or brown rice.';
  }
  if (text.includes('weight') || text.includes('calorie')) {
    return 'For weight goals, build meals around protein first, add colorful vegetables, keep oils measured, and choose one smart carb portion. Tell me your goal and meal type for a tighter plan.';
  }
  if (text.includes('recipe') || text.includes('cook')) {
    return 'Tell me the main ingredients in your kitchen, your diet preference, and how much time you have. I will suggest a practical recipe with steps and nutrition notes.';
  }
  return 'I can help with recipe ideas, meal planning, grocery choices, and nutrition swaps. Tell me your ingredients, diet preference, health goal, and time available.';
}

export async function nutriChatFlow({ message, history = [] }) {
  if (!genAI) return localNutritionReply(message);

  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const historyText = history
    .slice(-8)
    .map(item => `${item.role === 'user' ? 'User' : 'Assistant'}: ${item.content?.[0]?.text || ''}`)
    .join('\n');
  const prompt = `You are NutriBot, a concise nutrition and recipe assistant for a smart meal planner. Give practical, safe food guidance, not medical diagnosis. Never suggest beef or recipes containing beef.\n${historyText}\nUser: ${message}\nAssistant:`;
  const result = await model.generateContent(prompt);
  return result.response.text().trim() || localNutritionReply(message);
}

export async function identifyIngredientsFlow({ imageBase64 }) {
  if (!genAI) {
    return {
      ingredients: [],
      suggestion: 'Vision AI is not configured yet. Add GOOGLE_API_KEY on the backend, then upload the image again.',
    };
  }

  const [meta, data] = String(imageBase64).split(',');
  const mimeType = meta?.match(/data:(.*);base64/)?.[1] || 'image/jpeg';
  const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  const result = await model.generateContent([
    'Identify visible food ingredients in this image. Return JSON with ingredients array and one concise recipe suggestion.',
    { inlineData: { data, mimeType } },
  ]);

  const text = result.response.text().trim();
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      return {
        ingredients: Array.isArray(parsed.ingredients) ? parsed.ingredients : [],
        suggestion: parsed.suggestion || 'Use these ingredients in a simple balanced meal.',
      };
    } catch (_) {
      // fall through
    }
  }

  return { ingredients: [], suggestion: text || 'Use these ingredients in a simple balanced balanced meal.' };
}
