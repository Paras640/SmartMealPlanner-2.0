"use client";

import { useEffect, useMemo, useState } from "react";
import { onAuthStateChanged } from "firebase/auth";
import { CalendarDays, Check, CircleAlert, DollarSign, LoaderCircle, ShoppingBasket, Sparkles, UtensilsCrossed } from "lucide-react";
import { toast } from "sonner";
import { auth } from "@/lib/firebaseConfig";
import "./meal-planner.css";

const DIETARY_OPTIONS = ["No preference", "Vegetarian", "Vegan", "Pescatarian", "Gluten-free", "Dairy-free", "Low-carb"];
const CURRENCIES = ["USD", "INR", "EUR", "GBP", "CAD", "AUD"];

function parseList(value) {
    return [...new Set(value.split(/[\n,]/).map((item) => item.trim()).filter(Boolean))];
}

function formatAmount(value, currency) {
    return new Intl.NumberFormat(undefined, {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
    }).format(value);
}

export default function MealPlannerPage() {
    const [user, setUser] = useState(null);
    const [pantryInput, setPantryInput] = useState("");
    const [allergyInput, setAllergyInput] = useState("");
    const [dietaryPreference, setDietaryPreference] = useState("No preference");
    const [servings, setServings] = useState("2");
    const [calorieTarget, setCalorieTarget] = useState("");
    const [budget, setBudget] = useState("");
    const [currency, setCurrency] = useState("USD");
    const [plan, setPlan] = useState(null);
    const [isGenerating, setIsGenerating] = useState(false);
    const [isAddingGroceries, setIsAddingGroceries] = useState(false);
    const [groceriesAdded, setGroceriesAdded] = useState(false);
    const [appliedSwaps, setAppliedSwaps] = useState([]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            setUser(firebaseUser || null);
            if (!firebaseUser) return;

            try {
                const response = await fetch(`/api/users?uid=${encodeURIComponent(firebaseUser.uid)}`);
                if (!response.ok) return;
                const profile = await response.json();
                setDietaryPreference(profile.dietaryType === "Veg" ? "Vegetarian" : profile.dietaryType === "Vegan" ? "Vegan" : "No preference");
                setAllergyInput(Array.isArray(profile.allergies) ? profile.allergies.join(", ") : "");
                setCalorieTarget(profile.measurements?.dailyCalorieGoal ? String(profile.measurements.dailyCalorieGoal) : "");
            } catch (error) {
                console.error("Could not load meal planner preferences:", error);
                toast.error("Could not load your saved food preferences.");
            }
        });
        return () => unsubscribe();
    }, []);

    const meals = useMemo(() => plan?.days.flatMap((day) => day.meals) || [], [plan]);
    const weeklyCost = useMemo(() => meals.reduce((sum, meal) => sum + meal.estimatedCost, 0), [meals]);

    const generatePlan = async (event) => {
        event.preventDefault();
        if (!user) {
            toast.error("Log in to generate and save your meal plan.");
            return;
        }

        setIsGenerating(true);
        setPlan(null);
        setGroceriesAdded(false);
        setAppliedSwaps([]);
        try {
            const response = await fetch("/api/meal-planner", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    pantry: parseList(pantryInput),
                    allergies: parseList(allergyInput),
                    dietaryPreference,
                    servings: Number(servings),
                    calorieTarget: calorieTarget ? Number(calorieTarget) : null,
                    budget: budget ? Number(budget) : null,
                    currency,
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not create your meal plan.");
            setPlan(data);
            toast.success("Your weekly plan is ready.");
        } catch (error) {
            toast.error(error.message || "Could not create your meal plan.");
        } finally {
            setIsGenerating(false);
        }
    };

    const addGroceries = async () => {
        if (!plan?.groceryList?.length || !user) return;

        setIsAddingGroceries(true);
        try {
            const response = await fetch("/api/grocery", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    firebaseUID: user.uid,
                    userId: user.email,
                    items: plan.groceryList.map((item) => ({
                        name: item.name,
                        qty: item.quantity,
                        checked: false,
                    })),
                }),
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Could not add groceries.");
            setGroceriesAdded(true);
            toast.success("Ingredients added to your grocery list.");
        } catch (error) {
            toast.error(error.message || "Could not add groceries.");
        } finally {
            setIsAddingGroceries(false);
        }
    };

    const applySubstitution = (dayIndex, mealIndex, swapIndex) => {
        setPlan((currentPlan) => {
            const nextPlan = structuredClone(currentPlan);
            const meal = nextPlan.days[dayIndex].meals[mealIndex];
            const swap = meal.substitutions[swapIndex];
            const matchingIngredients = meal.ingredients.filter((ingredient) => ingredient.name.toLowerCase().includes(swap.avoid.toLowerCase()));
            if (matchingIngredients.length === 0) return currentPlan;

            meal.ingredients = meal.ingredients.map((ingredient) => ingredient.name.toLowerCase().includes(swap.avoid.toLowerCase())
                ? { ...ingredient, name: swap.use }
                : ingredient);
            const replacedGrocery = nextPlan.groceryList.some((item) => item.name.toLowerCase().includes(swap.avoid.toLowerCase()));
            nextPlan.groceryList = nextPlan.groceryList.map((item) => item.name.toLowerCase().includes(swap.avoid.toLowerCase())
                ? { ...item, name: swap.use }
                : item);

            const pantryContainsSwap = parseList(pantryInput).some((item) => item.toLowerCase() === swap.use.toLowerCase());
            if (!replacedGrocery && !pantryContainsSwap) {
                nextPlan.groceryList.push({ name: swap.use, quantity: matchingIngredients[0].quantity });
            }
            return nextPlan;
        });
        setAppliedSwaps((current) => [...current, `${dayIndex}-${mealIndex}-${swapIndex}`]);
        setGroceriesAdded(false);
    };

    return (
        <div className="meal-planner-page">
            <div className="meal-planner-shell">
                <header className="meal-planner-hero">
                    <span className="meal-planner-eyebrow"><Sparkles size={15} /> SMART WEEKLY PLANNING</span>
                    <h1>Make the most of what you have.</h1>
                    <p>Build a practical weekly menu around your ingredients, food preferences, nutrition goals, and budget.</p>
                </header>

                <form className="planner-form" onSubmit={generatePlan}>
                    <label className="planner-field planner-field-wide">
                        <span>What ingredients do you already have?</span>
                        <textarea
                            value={pantryInput}
                            onChange={(event) => setPantryInput(event.target.value)}
                            placeholder="For example: chickpeas, spinach, rice, tomatoes, eggs"
                            rows={3}
                            required
                        />
                        <small>Separate ingredients with commas or put each on a new line. We’ll prioritize these to help reduce food waste.</small>
                    </label>

                    <div className="planner-field-grid">
                        <label className="planner-field">
                            <span>Eating style</span>
                            <select value={dietaryPreference} onChange={(event) => setDietaryPreference(event.target.value)}>
                                {DIETARY_OPTIONS.map((option) => <option key={option}>{option}</option>)}
                            </select>
                        </label>
                        <label className="planner-field">
                            <span>Allergies to avoid</span>
                            <input value={allergyInput} onChange={(event) => setAllergyInput(event.target.value)} placeholder="Peanuts, shellfish..." />
                        </label>
                        <label className="planner-field">
                            <span>People to serve</span>
                            <input type="number" min="1" max="12" value={servings} onChange={(event) => setServings(event.target.value)} required />
                        </label>
                        <label className="planner-field">
                            <span>Daily calorie goal <small>(optional)</small></span>
                            <input type="number" min="500" max="10000" value={calorieTarget} onChange={(event) => setCalorieTarget(event.target.value)} placeholder="e.g. 2000" />
                        </label>
                        <label className="planner-field">
                            <span>Weekly grocery budget <small>(optional)</small></span>
                            <input type="number" min="1" step="0.01" value={budget} onChange={(event) => setBudget(event.target.value)} placeholder="Set a spending limit" />
                        </label>
                        <label className="planner-field">
                            <span>Budget currency</span>
                            <select value={currency} onChange={(event) => setCurrency(event.target.value)}>
                                {CURRENCIES.map((option) => <option key={option}>{option}</option>)}
                            </select>
                        </label>
                    </div>

                    <button className="planner-generate-button" type="submit" disabled={isGenerating || !user}>
                        {isGenerating ? <LoaderCircle className="planner-spinner" size={19} /> : <Sparkles size={18} />}
                        {isGenerating ? "Building your week..." : "Create my 7-day plan"}
                    </button>
                    {!user && <p className="planner-login-note">Log in to generate a plan and save its grocery list.</p>}
                    <p className="planner-safety-note">Nutrition and cost figures are estimates. Allergy suggestions are not a guarantee—always check product labels and cross-contact risks.</p>
                </form>

                {plan && (
                    <section className="planner-results" aria-live="polite">
                        <div className="planner-results-heading">
                            <div>
                                <span className="meal-planner-eyebrow"><CalendarDays size={15} /> YOUR WEEK</span>
                                <h2>Seven days, planned.</h2>
                                <p>Nutrition and prices are estimates; actual values vary by ingredients, portions, and local prices.</p>
                            </div>
                            <button className="planner-grocery-button" onClick={addGroceries} disabled={isAddingGroceries || groceriesAdded || !plan.groceryList.length}>
                                {groceriesAdded ? <Check size={17} /> : isAddingGroceries ? <LoaderCircle className="planner-spinner" size={17} /> : <ShoppingBasket size={17} />}
                                {groceriesAdded ? "Added to groceries" : "Add grocery list"}
                            </button>
                        </div>

                        {budget && weeklyCost > Number(budget) && (
                            <div className="planner-budget-alert"><CircleAlert size={18} /> Estimated groceries ({formatAmount(weeklyCost, currency)}) may exceed your {formatAmount(Number(budget), currency)} budget.</div>
                        )}
                        {budget && weeklyCost <= Number(budget) && (
                            <div className="planner-budget-good"><Check size={18} /> Estimated grocery cost fits your {formatAmount(Number(budget), currency)} budget.</div>
                        )}

                        <div className="planner-week-grid">
                            {plan.days.map((day, dayIndex) => {
                                const dayNutrition = day.meals.reduce((total, meal) => ({
                                    calories: total.calories + meal.calories,
                                    protein: total.protein + meal.protein,
                                    fiber: total.fiber + meal.fiber,
                                }), { calories: 0, protein: 0, fiber: 0 });
                                const dayCost = day.meals.reduce((total, meal) => total + meal.estimatedCost, 0);

                                return (
                                    <article className="planner-day-card" key={day.day}>
                                        <div className="planner-day-heading">
                                            <h3>{day.day}</h3>
                                            <span><DollarSign size={14} /> ~{formatAmount(dayCost, currency)}</span>
                                        </div>
                                        <div className="planner-day-nutrition">
                                            <span>{Math.round(dayNutrition.calories)} kcal</span>
                                            <span>{Math.round(dayNutrition.protein)}g protein</span>
                                            <span>{Math.round(dayNutrition.fiber)}g fiber</span>
                                        </div>
                                        {calorieTarget && (
                                            <div className="planner-calorie-track" aria-label={`${Math.round(dayNutrition.calories)} of ${calorieTarget} daily calories`}>
                                                <span style={{ width: `${Math.min(100, (dayNutrition.calories / Number(calorieTarget)) * 100)}%` }} />
                                            </div>
                                        )}
                                        {day.meals.map((meal, mealIndex) => (
                                            <div className="planner-meal" key={`${day.day}-${meal.type}-${meal.name}`}>
                                                <span className="planner-meal-type"><UtensilsCrossed size={13} /> {meal.type}</span>
                                                <h4>{meal.name}</h4>
                                                <p>{meal.description}</p>
                                                <div className="planner-meal-facts">
                                                    <span>{Math.round(meal.calories)} kcal</span>
                                                    <span>{Math.round(meal.protein)}g protein</span>
                                                    <span>{meal.steps.length} steps</span>
                                                </div>
                                                {meal.usesPantry?.length > 0 && (
                                                    <p className="planner-pantry-match">Uses your ingredients: {meal.usesPantry.join(", ")}</p>
                                                )}
                                                <details>
                                                    <summary>Ingredients &amp; cooking</summary>
                                                    <ul>{meal.ingredients.map((ingredient, index) => <li key={`${ingredient.name}-${index}`}>{ingredient.quantity} {ingredient.name}</li>)}</ul>
                                                    <ol>{meal.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
                                                </details>
                                                {meal.substitutions?.length > 0 && (
                                                    <div className="planner-substitutions">
                                                        <strong>Swap idea{meal.substitutions.length > 1 ? "s" : ""}</strong>
                                                        {meal.substitutions.map((swap, index) => {
                                                            const swapKey = `${dayIndex}-${mealIndex}-${index}`;
                                                            const canApply = meal.ingredients.some((ingredient) => ingredient.name.toLowerCase().includes(swap.avoid.toLowerCase()));
                                                            return (
                                                                <div className="planner-swap-row" key={swapKey}>
                                                                    <span>{swap.avoid} → {swap.use}</span>
                                                                    {canApply && (
                                                                        <button
                                                                            type="button"
                                                                            onClick={() => applySubstitution(dayIndex, mealIndex, index)}
                                                                            disabled={appliedSwaps.includes(swapKey)}
                                                                        >
                                                                            {appliedSwaps.includes(swapKey) ? "Applied" : "Use swap"}
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </article>
                                );
                            })}
                        </div>

                        <section className="planner-shopping-list">
                            <div>
                                <span className="meal-planner-eyebrow"><ShoppingBasket size={15} /> SHOPPING LIST</span>
                                <h3>What you’ll need to pick up</h3>
                            </div>
                            {plan.groceryList.length ? (
                                <ul>{plan.groceryList.map((item, index) => <li key={`${item.name}-${index}`}><span>{item.name}</span><span>{item.quantity}</span></li>)}</ul>
                            ) : (
                                <p>Your pantry already covers the ingredients in this plan.</p>
                            )}
                        </section>
                    </section>
                )}
            </div>
        </div>
    );
}
