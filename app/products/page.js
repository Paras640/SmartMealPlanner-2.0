"use client";

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebaseConfig';
import CountrySelect from '@/components/CountrySelect';
import '@/components/Product.css'; // Optional custom styles

function defaultQueryForDiet(diet) {
    const normalizedDiet = diet.toLowerCase();
    if (normalizedDiet === 'vegan') return 'Vegan';
    if (normalizedDiet === 'non-veg' || normalizedDiet === 'non-vegetarian') return 'Seafood';
    return 'Vegetarian';
}

export default function ProductsPage() {
    const router = useRouter();
    const [recipes, setRecipes] = useState([]);
    const [loading, setLoading] = useState(true);
    const [fetchSource, setFetchSource] = useState('');
    const [searchTerm, setSearchTerm] = useState('');
    const [dietaryPreference, setDietaryPreference] = useState('All');
    const [homeCountry, setHomeCountry] = useState('');
    const [cookingCountry, setCookingCountry] = useState('');
    const [preferenceLoaded, setPreferenceLoaded] = useState(false);
    const [preferenceError, setPreferenceError] = useState(false);

    const loadRecipes = useCallback(async (query, diet, country) => {
        try {
            setLoading(true);
            setRecipes([]);
            setFetchSource('');

            const countryParam = country ? `&country=${encodeURIComponent(country)}` : '';
            const res = await fetch(`/api/recipes?query=${encodeURIComponent(query)}&diet=${encodeURIComponent(diet)}${countryParam}`);
            if (!res.ok) {
                const errData = await res.text();
                throw new Error(errData || `HTTP ${res.status}`);
            }

            const data = await res.json();
            const items = data.recipes || [];
            setRecipes(items);
            setFetchSource('🌐 Live from TheMealDB');
        } catch (err) {
            console.error('Failed to fetch recipes:', err);
            setRecipes([]);
            setFetchSource('❌ Connection Error');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                setDietaryPreference('All');
                setPreferenceLoaded(true);
                return;
            }

            try {
                const response = await fetch(`/api/users?uid=${encodeURIComponent(firebaseUser.uid)}`);
                if (!response.ok) throw new Error('Could not load your saved dietary preference.');
                const profile = await response.json();
                setDietaryPreference(profile.dietaryType || profile.mealPreference || 'All');
                setHomeCountry(profile.country || '');
                setCookingCountry(profile.country || '');
            } catch (error) {
                console.error('Could not load recipe dietary preference:', error);
                setFetchSource('Could not load your dietary preference. Recipes were not shown.');
                setRecipes([]);
                setPreferenceError(true);
                setLoading(false);
            } finally {
                setPreferenceLoaded(true);
            }
        });
        return () => unsubscribe();
    }, []);

    useEffect(() => {
        if (!preferenceLoaded || preferenceError) return;
        const delayDebounceFn = setTimeout(() => {
            const query = searchTerm.trim() || (cookingCountry ? '' : defaultQueryForDiet(dietaryPreference));
            loadRecipes(query, dietaryPreference, cookingCountry);
        }, 350);

        return () => clearTimeout(delayDebounceFn);
    }, [searchTerm, dietaryPreference, cookingCountry, preferenceLoaded, preferenceError, loadRecipes]);

    const handleSearch = async (event) => {
        event.preventDefault();
        const query = searchTerm.trim() || (cookingCountry ? '' : defaultQueryForDiet(dietaryPreference));
        await loadRecipes(query, dietaryPreference, cookingCountry);
    };

    return (
        <div className="products-page animate-fade-in" style={{ minHeight: '100vh', padding: '40px 20px' }}>
            <div style={{ maxWidth: '1300px', margin: '0 auto' }}>
                <div style={{ textAlign: 'center', marginBottom: '40px' }}>
                    <h2 style={{ fontSize: '2.5rem', fontWeight: '800', marginBottom: '10px' }}>Explore Recipes</h2>
                    <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                        Browse {cookingCountry ? `recipes from ${cookingCountry}` : 'global recipes'} tailored to your {dietaryPreference === 'All' ? 'dietary preferences' : `${dietaryPreference} preference`}.
                    </p>
                    {homeCountry && cookingCountry !== homeCountry && (
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', marginTop: '6px' }}>Your home country remains {homeCountry}; this only changes recipes shown here.</p>
                    )}
                    {fetchSource && (
                        <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', background: 'var(--bg-hover)', padding: '6px 16px', borderRadius: '20px', display: 'inline-block', marginTop: '12px', fontWeight: '600' }}>
                            {fetchSource}
                        </span>
                    )}
                </div>

                <form onSubmit={handleSearch} style={{ display: 'flex', justifyContent: 'center', marginBottom: '40px', gap: '10px', flexWrap: 'wrap' }}>
                    <div style={{ width: '100%', maxWidth: '560px' }}>
                        <CountrySelect
                            id="cooking-country"
                            label="Browse recipes from"
                            value={cookingCountry}
                            onChange={setCookingCountry}
                            allowAny
                        />
                    </div>
                    <input
                        type="text"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        placeholder="Search any ingredient, dish, or category (e.g. dessert, pasta)..."
                        style={{ width: '100%', maxWidth: '560px', padding: '14px 20px', borderRadius: '50px', border: '1px solid var(--border)', outline: 'none', fontSize: '1rem', background: 'var(--bg-card)', color: 'var(--text-main)', boxShadow: 'var(--shadow)' }}
                    />
                    <button type="submit" style={{ padding: '14px 30px', minWidth: '140px', background: 'var(--primary-color)', color: 'white', borderRadius: '50px', fontWeight: '700', border: 'none', cursor: 'pointer', transition: 'background 0.2s' }}>
                        Search
                    </button>
                </form>

                <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div style={{ width: '100%', maxWidth: '1200px' }}>
                        {loading ? (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '30px' }}>
                                {[...Array(8)].map((_, i) => (
                                    <div key={i} style={{
                                        height: '320px', background: 'var(--bg-hover)',
                                        borderRadius: 'var(--radius-xl)', animation: 'pulse 1.5s infinite'
                                    }} />
                                ))}
                            </div>
                        ) : (
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '30px' }}>
                                {recipes.map((recipe) => (
                                    <div
                                        key={recipe.id}
                                        style={{
                                            background: 'var(--bg-card)',
                                            borderRadius: 'var(--radius-xl)',
                                            border: '1px solid var(--border)',
                                            overflow: 'hidden',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            cursor: 'pointer',
                                            boxShadow: 'var(--shadow)',
                                            transition: 'transform 0.2s, box-shadow 0.2s'
                                        }}
                                        onClick={() => router.push(`/recipe/${recipe.id}`)}
                                        onMouseEnter={(e) => {
                                            e.currentTarget.style.transform = 'translateY(-4px)';
                                            e.currentTarget.style.boxShadow = 'var(--shadow-hover)';
                                        }}
                                        onMouseLeave={(e) => {
                                            e.currentTarget.style.transform = 'translateY(0)';
                                            e.currentTarget.style.boxShadow = 'var(--shadow)';
                                        }}
                                    >
                                        <div style={{ position: 'relative', height: '200px', width: '100%', overflow: 'hidden' }}>
                                            <img
                                                src={recipe.image || "https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=400"}
                                                alt={recipe.title}
                                                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                                onError={(e) => { e.target.src = "https://images.unsplash.com/photo-1495521821757-a1efb6729352?w=400"; }}
                                            />
                                        </div>
                                        <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', flex: 1 }}>
                                            <span style={{ fontSize: '0.75rem', fontWeight: '800', textTransform: 'uppercase', color: 'var(--accent)', marginBottom: '8px' }}>
                                                {recipe.cuisineType || 'Global'}
                                            </span>
                                            <h4 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '16px', lineHeight: '1.4' }}>{recipe.title}</h4>
                                            
                                            <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: '16px', marginTop: 'auto' }}>
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-main)', fontWeight: '600' }}>
                                                    🔥 {Math.round(recipe.calories)} kcal
                                                </span>
                                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>
                                                    ⏱ {recipe.readyInMinutes} min
                                                </span>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                                {recipes.length === 0 && (
                                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '80px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '4rem', marginBottom: '20px' }}>🍽️</div>
                                        <h3 style={{ fontSize: '1.5rem', marginBottom: '10px' }}>{preferenceError ? 'Could not verify your dietary preference' : 'No recipes found!'}</h3>
                                        <p style={{ color: 'var(--text-muted)', marginBottom: '24px' }}>{preferenceError ? 'Recipes are hidden until your saved preference can be loaded.' : 'Try another search term. Recipes that do not match your saved dietary preference are filtered out.'}</p>
                                        {!preferenceError && <button style={{ padding: '12px 30px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '30px', fontWeight: '600', cursor: 'pointer', color: 'var(--text-main)' }} onClick={() => loadRecipes(defaultQueryForDiet(dietaryPreference), dietaryPreference)}>Show recommended recipes →</button>}
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}