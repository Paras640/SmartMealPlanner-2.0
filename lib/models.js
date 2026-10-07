import mongoose from 'mongoose';
import { connectToDatabase } from './mongodb.js';

const userSchema = new mongoose.Schema({
  firebaseUID: { type: String, unique: true, sparse: true },
  email: String,
  name: String,
  photoURL: String,
  authProvider: { type: String, enum: ['google', 'email'] },
  dietaryType: { type: String, enum: ['Veg', 'Non-Veg', 'Vegan'] },
  allergies: [String],
  healthConditions: [{ type: String, enum: ['diabetic', 'hypertension', 'lactose-intolerant', 'celiac'] }],
  measurements: {
    height: Number,
    weight: Number,
    age: Number,
    gender: String,
    dailyCalorieGoal: Number,
  },
  points: { type: Number, default: 0 },
  mealPreference: { type: String, default: 'Veg' },
  goal: { type: String, default: 'Healthy' },
  password: { type: String },
  themeColor: { type: String, default: '#6dba5f' },
  isDarkMode: { type: Boolean, default: false },
  isAIEnabled: { type: Boolean, default: true },
  fontSize: { type: String, default: 'medium' },
  subscriptionLevel: { type: String, enum: ['Basic', 'Pro', 'Family'], default: 'Basic' },
  familyMembers: [{ email: String, name: String, role: String }],
}, { strict: false });

const recipeSchema = new mongoose.Schema({
  title: String,
  mealDbId: { type: String, unique: true, sparse: true }, // TheMealDB external ID
  spoonacularId: { type: Number, unique: true, sparse: true },
  category: { type: String },
  area: String, // Cuisine region e.g. "Indian", "Italian"
  ingredients: mongoose.Schema.Types.Mixed, // Accepts string[] or {name, qty, unit}[]
  steps: [String],
  calories: Number,
  proteinCount: Number,
  fiberCount: Number,
  sugarContent: Number,
  sodiumContent: Number,
  isPremium: { type: Boolean, default: false },
  scrapedFromWeb: { type: Boolean, default: false },
  imageURL: String,
  videoURL: String,
  sourceUrl: String,
  summary: String,
  readyInMinutes: Number,
  servings: Number,
  tags: [String],
  diabeticFlag: { type: Boolean, default: false },
  diabeticSafeQty: String,
  likes: { type: [String], default: [] },    // array of firebaseUIDs
  dislikes: { type: [String], default: [] }, // array of firebaseUIDs
  createdBy: String, // firebaseUID of creator
  createdAt: { type: Date, default: Date.now },
  ratings: [{
    userId: String,
    firebaseUID: String,
    userName: String,
    userPhoto: String,
    score: { type: Number, min: 1, max: 5 },
    review: String,
    createdAt: { type: Date, default: Date.now },
  }],
  averageRating: { type: Number, default: 0 },
  totalRatings: { type: Number, default: 0 },
}, { strict: false });

const calendarSchema = new mongoose.Schema({
  userId: String,
  firebaseUID: String,
  recipeId: { type: mongoose.Schema.Types.ObjectId, ref: 'Recipe' },
  recipeTitle: String,
  date: String,
  mealType: { type: String, enum: ['Breakfast', 'Lunch', 'Dinner', 'Snack'] },
  familyPlanId: String,
}, { strict: false });

const blogSchema = new mongoose.Schema({
  authorId: String,
  firebaseUID: String,
  authorName: String,
  title: String,
  bodyContent: String,
  tags: [String],
  publishedAt: { type: Date, default: Date.now },
}, { strict: false });

const analyticsSchema = new mongoose.Schema({
  userId: String,
  firebaseUID: String,
  actionType: String,
  timestamp: { type: Date, default: Date.now },
  engagementScore: { type: Number, default: 0 },
  wasteTracker: [{ itemRemoved: String, removedAt: Date }],
}, { strict: false });

const familySyncSchema = new mongoose.Schema({
  familyCode: { type: String, unique: true },
  createdBy: String,
  members: [{ userId: String, firebaseUID: String, name: String, email: String }],
  sharedCalendar: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Calendar' }],
  sharedGroceryList: [{ item: String, qty: String, addedBy: String, checked: Boolean }],
}, { strict: false });

const grocerySchema = new mongoose.Schema({
  firebaseUID: { type: String, required: true, unique: true },
  userId: String,
  items: [{ name: String, qty: String, checked: { type: Boolean, default: false } }],
  updatedAt: { type: Date, default: Date.now },
}, { strict: false });

const feedbackSchema = new mongoose.Schema({
  userId: String,
  firebaseUID: String,
  name: String,
  email: String,
  subject: String,
  message: String,
  status: { type: String, enum: ['New', 'In Progress', 'Resolved'], default: 'New' },
  createdAt: { type: Date, default: Date.now },
}, { strict: false });

const aiContentSchema = new mongoose.Schema({
  userId: String,
  firebaseUID: String,
  contentType: { type: String, default: 'Video' },
  contentUrl: String,
  promptUsed: String,
  metadata: mongoose.Schema.Types.Mixed,
  createdAt: { type: Date, default: Date.now },
}, { strict: false });

const chatSessionSchema = new mongoose.Schema({
  userId: String,
  firebaseUID: String,
  email: String,
  messages: [{ role: { type: String, enum: ['user', 'bot'] }, text: String, timestamp: { type: Date, default: Date.now } }],
  updatedAt: { type: Date, default: Date.now },
}, { strict: false });

const threadSchema = new mongoose.Schema({
  recipeId: String,
  recipeTitle: String,
  user: String,
  email: String,
  avatar: String,
  content: String,
  rating: { type: Number, default: 0 },
  likes: { type: Number, default: 0 },
  dislikes: { type: Number, default: 0 },
  likedBy: [{ type: String, default: [] }],
  dislikedBy: [{ type: String, default: [] }],
  tag: String,
  replies: [{ user: String, email: String, text: String, createdAt: { type: Date, default: Date.now } }],
  createdAt: { type: Date, default: Date.now },
}, { strict: false });

const inviteSchema = new mongoose.Schema({
  familyCode: String,
  senderUid: String,
  senderName: String,
  targetEmail: String,
  status: { type: String, enum: ['pending', 'accepted', 'rejected'], default: 'pending' },
  createdAt: { type: Date, default: Date.now }
}, { strict: false });

const getModel = (name, schema) => mongoose.models[name] || mongoose.model(name, schema);

/**
 * Initializes the database connection and returns all Mongoose models.
 * Returns null if MongoDB is unavailable — callers must check for null
 * and return a 503 or degrade gracefully (e.g., skip ratings merge).
 */
export async function initDb() {
  const conn = await connectToDatabase();
  if (!conn) return null;

  return {
    User: getModel('User', userSchema),
    Recipe: getModel('Recipe', recipeSchema),
    Calendar: getModel('Calendar', calendarSchema),
    Blog: getModel('Blog', blogSchema),
    Analytics: getModel('Analytics', analyticsSchema),
    FamilySync: getModel('FamilySync', familySyncSchema),
    Grocery: getModel('Grocery', grocerySchema),
    Feedback: getModel('Feedback', feedbackSchema),
    AIContent: getModel('AIContent', aiContentSchema),
    ChatSession: getModel('ChatSession', chatSessionSchema),
    Thread: getModel('Thread', threadSchema),
    Invite: getModel('Invite', inviteSchema),
  };
}
