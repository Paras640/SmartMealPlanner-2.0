"use client";
import { useState, useEffect, useCallback } from "react";
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';

export default function SmartMealPlanner() {
  const router = useRouter();
  const [recipes, setRecipes] = useState([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [activeCategory, setActiveCategory] = useState("all");
  const [randomRecipe, setRandomRecipe] = useState(null);
  const [loadingRandom, setLoadingRandom] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(true);
  const [dietaryPreference, setDietaryPreference] = useState("Veg");

  const fetchRecipes = useCallback(async (searchQuery, diet = dietaryPreference) => {
    if (!searchQuery?.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/recipes?query=${encodeURIComponent(searchQuery)}&diet=${encodeURIComponent(diet)}`);
      if (!res.ok) throw new Error(`Server error (${res.status})`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setRecipes(data.recipes || []);
    } catch (err) {
      console.error("Fetch error:", err.message);
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [dietaryPreference]);

  const fetchRandomRecipe = useCallback(async (diet) => {
    setLoadingRandom(true);
    try {
      const query = diet === "Vegan" ? "Vegan" : "Vegetarian";
      const res = await fetch(`/api/recipes?query=${encodeURIComponent(query)}&diet=${encodeURIComponent(diet)}`);
      const data = await res.json();
      const recipes = data.recipes || [];
      if (recipes.length) {
        const recipe = recipes[Math.floor(Math.random() * recipes.length)];
        setRandomRecipe({
          idMeal: recipe.id,
          strMeal: recipe.title,
          strMealThumb: recipe.image,
          strArea: recipe.cuisineType,
          strCategory: recipe.mealType
        });
      } else {
        setRandomRecipe(null);
      }
    } catch (err) {
      console.error("Failed to load a preference-safe featured recipe:", err);
      setRandomRecipe(null);
    } finally {
      setLoadingRandom(false);
    }
  }, []);

  useEffect(() => {
    const refreshUserProfile = async (firebaseUser) => {
      if (!firebaseUser) {
        setAiEnabled(true);
        setDietaryPreference("Veg");
        fetchRecipes("Vegetarian", "Veg");
        fetchRandomRecipe("Veg");
        return;
      }

      try {
        const res = await fetch(`/api/users?uid=${firebaseUser.uid}`);
        if (res.ok) {
          const profile = await res.json();
          setAiEnabled(profile.isAIEnabled !== false);
          const diet = profile.dietaryType || profile.mealPreference || "Veg";
          setDietaryPreference(diet);
          let targetQuery = diet === "Vegan" ? "Vegan" : diet === "Non-Veg" || diet === "Keto" || diet === "Low-Carb" ? "Seafood" : "Vegetarian";
          
          // Consider health conditions
          if (profile.healthConditions && profile.healthConditions.length > 0) {
            if (profile.healthConditions.includes("hypertension")) {
              targetQuery = "healthy " + targetQuery; // "healthy" will trigger better search matches for hypertension
            } else if (profile.healthConditions.includes("diabetic")) {
              targetQuery = "diabetic " + targetQuery;
            }
          }
          
          setQuery(targetQuery);
          fetchRecipes(targetQuery, diet);
          fetchRandomRecipe(diet);
        } else {
          setAiEnabled(true);
          setDietaryPreference("Veg");
          fetchRecipes("Vegetarian", "Veg");
          fetchRandomRecipe("Veg");
        }
      } catch {
        setAiEnabled(true);
        setDietaryPreference("Veg");
        fetchRecipes("Vegetarian", "Veg");
        fetchRandomRecipe("Veg");
      }
    };

    const unsub = onAuthStateChanged(auth, refreshUserProfile);
    const onAiSettingUpdated = () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        refreshUserProfile(currentUser);
      }
    };

    window.addEventListener('ai-setting-updated', onAiSettingUpdated);
    return () => {
      unsub();
      window.removeEventListener('ai-setting-updated', onAiSettingUpdated);
    };
  }, [fetchRandomRecipe, fetchRecipes]);

  const handleSearch = (e) => {
    e.preventDefault();
    if (!query.trim()) return;
    setActiveCategory(null);
    fetchRecipes(query);
  };

  const handleCategoryClick = (cat) => {
    setActiveCategory(cat);
    let targetQuery = cat;
    if (cat === "all") targetQuery = dietaryPreference === "Vegan" ? "Vegan" : "Vegetarian";
    else if (cat === "Non-Vegetarian") targetQuery = "Seafood";
    setQuery(targetQuery);
    fetchRecipes(targetQuery, dietaryPreference);
  };

  const categories = ["all", "Non-Vegetarian", "Seafood", "Vegetarian", "Dessert", "Pasta", "Vegan"];

  return (
    <div style={{ paddingBottom: "100px" }}>
      
      {/* ─── HERO ─── */}
      <section style={{ maxWidth: "1320px", margin: "40px auto 60px", padding: "0 20px" }}>
        <div style={{
          position: "relative", height: "540px", borderRadius: "var(--radius-xl)", overflow: "hidden",
          display: "flex", alignItems: "center",
          backgroundImage: `linear-gradient(to right, rgba(10, 20, 12, 0.9) 30%, rgba(10, 20, 12, 0.2)), url('https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=1600')`,
          backgroundSize: "cover", backgroundPosition: "center", boxShadow: "var(--shadow-lg)"
        }} className="animate-render">
          <div style={{ padding: "0 80px", maxWidth: "750px", zIndex: 10 }}>
            <h1 style={{ fontSize: "4.2rem", fontWeight: "800", color: "#ffffff", lineHeight: "1.05", letterSpacing: "-0.04em", marginBottom: "20px" }}>
              Track Macros <br />Effortlessly <span style={{ color: "var(--primary-color)" }}>⇋</span>
            </h1>
            <p style={{ fontSize: "1.25rem", color: "rgba(255,255,255,0.85)", marginBottom: "36px", fontWeight: "400", lineHeight: "1.5" }}>
              Get instant caloric tracking breakdowns pulled directly from real ingredients.
            </p>
            <button 
              onClick={() => handleCategoryClick("Vegetarian")}
              style={{ background: "#ffffff", color: "#143316", border: "none", padding: "16px 36px", borderRadius: "40px", fontWeight: "800", fontSize: "1rem", cursor: "pointer" }}
            >
              Start Planning
            </button>
          </div>
          <div style={{ position: "absolute", bottom: "32px", left: "50%", transform: "translateX(-50%)", display: "flex", gap: "10px" }}>
            <span style={{ width: "24px", height: "6px", background: "#ffffff", borderRadius: "4px" }} />
            <span style={{ width: "12px", height: "6px", background: "rgba(255,255,255,0.3)", borderRadius: "4px" }} />
            <span style={{ width: "12px", height: "6px", background: "rgba(255,255,255,0.3)", borderRadius: "4px" }} />
          </div>
        </div>
      </section>

      {/* ─── RANDOM RECIPE DISCOVERY ─── */}
      {randomRecipe && (
        <section style={{ maxWidth: "1320px", margin: "0 auto 60px", padding: "0 20px" }}>
          <div style={{
            display: "flex", gap: "40px", alignItems: "center", flexWrap: "wrap",
            background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
            border: "1px solid var(--border)", overflow: "hidden", boxShadow: "var(--shadow-lg)"
          }}>
            <img 
              src={randomRecipe.strMealThumb} alt={randomRecipe.strMeal}
              style={{ width: "320px", height: "280px", objectFit: "cover", flexShrink: 0 }}
            />
            <div style={{ padding: "30px 30px 30px 0", flex: 1, minWidth: "250px" }}>
              <span style={{ fontSize: "0.8rem", fontWeight: "800", color: "var(--primary-color)", textTransform: "uppercase", letterSpacing: "0.1em" }}>
                🎲 Discover Something New
              </span>
              <h2 style={{ fontSize: "2rem", fontWeight: "800", margin: "8px 0 12px", letterSpacing: "-0.02em" }}>
                {randomRecipe.strMeal}
              </h2>
              <p style={{ color: "var(--text-muted)", marginBottom: "20px", lineHeight: "1.6" }}>
                {randomRecipe.strArea} • {randomRecipe.strCategory}
              </p>
              <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
                <button 
                  onClick={() => router.push(`/recipe/${randomRecipe.idMeal}`)}
                  style={{ padding: "12px 28px", background: "var(--primary-color)", color: "white", border: "none", borderRadius: "30px", fontWeight: "700", cursor: "pointer" }}
                >
                  View Recipe
                </button>
                {aiEnabled && (
                  <button 
                    onClick={fetchRandomRecipe} disabled={loadingRandom}
                    style={{ padding: "12px 28px", background: "var(--bg-hover)", color: "var(--text-main)", border: "1px solid var(--border)", borderRadius: "30px", fontWeight: "700", cursor: "pointer" }}
                  >
                    {loadingRandom ? "Loading..." : "🔀 Surprise Me"}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ─── QUICK STATS ─── */}
      <section style={{ maxWidth: "1320px", margin: "0 auto 60px", padding: "0 20px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "20px" }}>
          {[
            { emoji: "🌍", label: "Cuisines Available", value: "25+" },
            { emoji: "📖", label: "Total Recipes", value: "300+" },
            { emoji: "🥗", label: "Dietary Types", value: "7" },
            { emoji: "⏱️", label: "Avg Cook Time", value: "30 mins" },
          ].map((stat) => (
            <div key={stat.label} style={{
              background: "var(--bg-card)", borderRadius: "var(--radius-xl)", padding: "28px",
              border: "1px solid var(--border)", textAlign: "center", boxShadow: "var(--shadow)"
            }}>
              <div style={{ fontSize: "2rem", marginBottom: "8px" }}>{stat.emoji}</div>
              <div style={{ fontSize: "1.8rem", fontWeight: "800", color: "var(--text-main)" }}>{stat.value}</div>
              <div style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: "600" }}>{stat.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── LIVE RECIPE AGGREGATOR ─── */}
      <section style={{ maxWidth: "1320px", margin: "0 auto", padding: "0 20px" }}>
        
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: "40px", gap: "24px", flexWrap: "wrap" }}>
          <div>
            <h2 style={{ fontSize: "2rem", fontWeight: "800", letterSpacing: "-0.03em", marginBottom: "8px" }}>Explore Meal Blueprints</h2>
            <p style={{ fontSize: "1rem", color: "var(--text-muted)" }}>Type anything — pizza, pasta, Indian, chocolate, salmon — and discover recipes.</p>
          </div>

          <form onSubmit={handleSearch} style={{ display: "flex", gap: "12px", background: "var(--bg-card)", padding: "8px", borderRadius: "50px", border: "1px solid var(--border)", boxShadow: "0 8px 24px rgba(0,0,0,0.02)", width: "100%", maxWidth: "480px" }}>
            <input 
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search any recipe, cuisine, or ingredient..."
              style={{ flex: 1, border: "none", background: "transparent", paddingLeft: "20px", fontSize: "1rem", fontWeight: "500", color: "var(--text-main)", outline: "none" }}
            />
            <button type="submit" style={{ background: "var(--primary-color)", color: "white", border: "none", padding: "12px 24px", borderRadius: "30px", fontWeight: "700", cursor: "pointer" }}>
              Search
            </button>
          </form>
        </div>

        {/* Categories */}
        <div style={{ display: "flex", gap: "12px", marginBottom: "40px", overflowX: "auto", paddingBottom: "8px" }} className="no-scrollbar">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => handleCategoryClick(cat)}
              style={{
                padding: "10px 24px", borderRadius: "40px", border: "1px solid var(--border)",
                background: activeCategory === cat ? "var(--primary-color)" : "var(--bg-card)",
                color: activeCategory === cat ? "#ffffff" : "var(--text-main)",
                fontWeight: "700", fontSize: "0.95rem", cursor: "pointer", whiteSpace: "nowrap", transition: "all 0.2s ease"
              }}
            >
              {cat.charAt(0).toUpperCase() + cat.slice(1)}
            </button>
          ))}
        </div>

        {/* Results */}
        {loading && (
          <div style={{ textAlign: "center", fontSize: "1.1rem", padding: "100px 0", color: "var(--text-muted)", fontWeight: "500" }}>
            Searching recipes...
          </div>
        )}
        
        {error && (
          <div style={{ background: "rgba(220,53,69,0.05)", color: "#dc3545", padding: "20px", borderRadius: "12px", border: "1px solid rgba(220,53,69,0.15)", margin: "20px 0" }}>
            ⚠️ {error}
          </div>
        )}

        {!loading && !error && (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "32px" }}>
            {recipes.length > 0 ? (
              recipes.map((recipe, idx) => (
                <div 
                  key={recipe.id || idx} 
                  style={{
                    background: "var(--bg-card)", borderRadius: "var(--radius-xl)",
                    border: "1px solid var(--border)", overflow: "hidden",
                    display: "flex", flexDirection: "column", cursor: "pointer",
                    boxShadow: "0 10px 30px -10px rgba(0,0,0,0.02)"
                  }}
                  onClick={() => router.push(`/recipe/${recipe.id}`)}
                >
                  <div style={{ position: "relative", height: "220px", width: "100%", overflow: "hidden" }}>
                    <img 
                      src={recipe.image || "https://images.unsplash.com/photo-1495521821757-a1efb6729352?auto=format&fit=crop&q=80&w=600"} 
                      alt={recipe.title}
                      style={{ width: "100%", height: "100%", objectFit: "cover" }}
                    />
                    {recipe.calories && recipe.calories < 400 && (
                      <span style={{ position: "absolute", bottom: "16px", left: "16px", background: "rgba(46, 107, 64, 0.9)", color: "white", fontSize: "0.75rem", fontWeight: "800", padding: "6px 12px", borderRadius: "30px", backdropFilter: "blur(8px)" }}>
                        🥗 LOW CALORIE
                      </span>
                    )}
                  </div>
                  <div style={{ padding: "24px", display: "flex", flexDirection: "column", flex: 1 }}>
                    <span style={{ fontSize: "0.7rem", fontWeight: "800", textTransform: "uppercase", color: "var(--accent)", letterSpacing: "0.05em", marginBottom: "8px" }}>
                      {recipe.cuisineType || "Global"} • {recipe.mealType || "Meal"}
                    </span>
                    <h3 style={{ fontSize: "1.2rem", fontWeight: "700", marginBottom: "16px", minHeight: "44px", display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden" }}>
                      {recipe.title}
                    </h3>
                    <div style={{ display: "flex", justifyContent: "space-between", borderTop: "1px solid var(--border)", paddingTop: "16px", marginTop: "auto" }}>
                      <span style={{ fontSize: "0.9rem", color: "var(--text-muted)", fontWeight: "500" }}>
                        ⏱️ {recipe.readyInMinutes && recipe.readyInMinutes !== 0 ? `${recipe.readyInMinutes} mins` : "-- mins"}
                      </span>
                      {recipe.calories !== null && recipe.calories !== undefined && (
                        <span style={{ fontSize: "0.9rem", color: "var(--text-main)", fontWeight: "700" }}>
                          🔥 {recipe.calories} Cal
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: "1 / -1", textAlign: "center", padding: "60px 0", color: "var(--text-muted)" }}>
                No recipes found. Try a different search term!
              </div>
            )}
          </div>
        )}
      </section>

    </div>
  );
}