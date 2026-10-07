"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { toast } from "sonner";

export default function OnboardingPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const [preferences, setPreferences] = useState({
    dietaryType: "Veg",
    goal: "Healthy",
    allergies: [],
    healthConditions: []
  });

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (firebaseUser) => {
      if (!firebaseUser) {
        router.push("/login");
      } else {
        setUser(firebaseUser);
        setLoading(false);
      }
    });
    return () => unsub();
  }, [router]);

  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch("/api/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          firebaseUID: user.uid,
          email: user.email,
          name: user.displayName,
          preferences: preferences
        })
      });
      if (!res.ok) throw new Error("Failed to save preferences.");
      toast.success("Profile setup complete!");
      router.push("/dashboard");
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleArrayChange = (field, value) => {
    setPreferences(prev => {
      const arr = prev[field];
      if (arr.includes(value)) {
        return { ...prev, [field]: arr.filter(v => v !== value) };
      } else {
        return { ...prev, [field]: [...arr, value] };
      }
    });
  };

  if (loading) return <div style={{ display: "flex", justifyContent: "center", padding: "100px" }}>Loading...</div>;

  return (
    <div style={{ minHeight: "100vh", padding: "60px 20px", background: "var(--bg-main)" }}>
      <div style={{ maxWidth: "600px", margin: "0 auto", background: "var(--bg-card)", padding: "40px", borderRadius: "20px", boxShadow: "var(--shadow-lg)" }}>
        <h1 style={{ fontSize: "2rem", fontWeight: "800", marginBottom: "10px", color: "var(--text-main)" }}>Let&apos;s Personalize Your Experience</h1>
        <p style={{ color: "var(--text-muted)", marginBottom: "30px" }}>Tell us a bit about your eating habits so we can recommend the best recipes.</p>

        <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div>
            <label style={{ display: "block", fontWeight: "700", marginBottom: "8px" }}>Primary Diet</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {["Veg", "Non-Veg", "Vegan", "Keto", "Low-Carb"].map(diet => (
                <button
                  key={diet} type="button"
                  onClick={() => setPreferences({ ...preferences, dietaryType: diet })}
                  style={{
                    padding: "10px 20px", borderRadius: "30px", fontWeight: "600", cursor: "pointer",
                    background: preferences.dietaryType === diet ? "var(--primary-color)" : "var(--bg-hover)",
                    color: preferences.dietaryType === diet ? "white" : "var(--text-main)",
                    border: "none", transition: "0.2s"
                  }}
                >
                  {diet}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: "700", marginBottom: "8px" }}>Main Goal</label>
            <select
              value={preferences.goal}
              onChange={(e) => setPreferences({ ...preferences, goal: e.target.value })}
              style={{ width: "100%", padding: "12px", borderRadius: "10px", border: "1px solid var(--border)", background: "var(--bg-hover)", color: "var(--text-main)", outline: "none" }}
            >
              <option value="Healthy">Eat Healthier</option>
              <option value="Weight Loss">Weight Loss</option>
              <option value="Weight Gain">Weight Gain / Muscle</option>
              <option value="Maintenance">Maintenance</option>
            </select>
          </div>

          <div>
            <label style={{ display: "block", fontWeight: "700", marginBottom: "8px" }}>Health Conditions</label>
            <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
              {["diabetic", "hypertension", "lactose-intolerant", "celiac"].map(condition => (
                <button
                  key={condition} type="button"
                  onClick={() => handleArrayChange('healthConditions', condition)}
                  style={{
                    padding: "8px 16px", borderRadius: "20px", fontSize: "0.9rem", fontWeight: "600", cursor: "pointer",
                    background: preferences.healthConditions.includes(condition) ? "#4285F4" : "var(--bg-hover)",
                    color: preferences.healthConditions.includes(condition) ? "white" : "var(--text-main)",
                    border: "none"
                  }}
                >
                  {condition.charAt(0).toUpperCase() + condition.slice(1).replace("-", " ")}
                </button>
              ))}
            </div>
          </div>

          <button
            type="submit"
            disabled={saving}
            style={{
              padding: "16px", background: "var(--primary-color)", color: "white", border: "none",
              borderRadius: "12px", fontWeight: "800", fontSize: "1.1rem", cursor: "pointer", marginTop: "10px",
              opacity: saving ? 0.7 : 1
            }}
          >
            {saving ? "Saving..." : "Continue to Dashboard"}
          </button>
        </form>
      </div>
    </div>
  );
}
