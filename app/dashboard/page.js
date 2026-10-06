"use client";
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import OnboardingModal from '@/components/OnboardingModal';
import { toast } from 'sonner';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recipes, setRecipes] = useState([]);
    const [loadingRecipes, setLoadingRecipes] = useState(false);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                router.push('/login');
                return;
            }
            setUser(firebaseUser);
            
            try {
                const res = await fetch(`/api/users?uid=${firebaseUser.uid}`);
                if (res.ok) {
                    const data = await res.json();
                    if (!data.onboarded) {
                        router.push('/onboarding');
                        return;
                    }
                    setProfile(data);
                    fetchPersonalizedRecipes(data.dietaryType);
                } else {
                    router.push('/onboarding');
                }
            } catch (err) {
                console.error("Failed to fetch profile", err);
                router.push('/onboarding');
            } finally {
                setLoading(false);
            }
        });
        return () => unsub();
    }, [router]);

    const fetchPersonalizedRecipes = async (dietaryType) => {
        setLoadingRecipes(true);
        try {
            let query = 'Seafood'; 
            if (dietaryType === 'Veg' || dietaryType === 'Vegan') query = 'Vegetarian';
            if (dietaryType === 'Keto') query = 'Beef';
            if (dietaryType === 'Non-Veg') query = 'Chicken';
            
            const res = await fetch(`https://www.themealdb.com/api/json/v1/1/filter.php?c=${query}`);
            const data = await res.json();
            
            if (data.meals) {
                const shuffled = data.meals.sort(() => 0.5 - Math.random());
                setRecipes(shuffled.slice(0, 6));
            }
        } catch (err) {
            toast.error("Failed to load suggestions");
        } finally {
            setLoadingRecipes(false);
        }
    };

    const [inviteCode, setInviteCode] = useState('');
    const [inviteEmail, setInviteEmail] = useState('');

    const handleJoinFamily = async (e) => {
        e.preventDefault();
        if (!inviteCode.trim()) return;
        try {
            const res = await fetch('/api/family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'join', inviteValue: inviteCode.trim(), firebaseUID: user.uid, email: user.email, name: profile.name || user.displayName })
            });
            const data = await res.json();
            if (data.success) {
                toast.success('Joined group successfully!');
                setInviteCode('');
            } else {
                toast.error(data.error || 'Failed to join group.');
            }
        } catch (err) {
            toast.error('Failed to join family.');
        }
    };

    const handleInviteMember = (e) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        // In a real app, this would send an email. For the exhibition, we show a success toast.
        toast.success(`Invitation sent to ${inviteEmail}!`);
        setInviteEmail('');
    };

    if (loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading Dashboard...
        </div>
    );

    if (!profile) return null;

    return (
        <div style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh' }}>
            <header style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>Welcome back, {profile.name?.split(' ')[0]}! 👋</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                    Here are your personalized suggestions for your <strong>{profile.goal || "Healthy"}</strong> goal.
                </p>
            </header>

            <section>
                <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                    Recommended For You ({profile.dietaryType === 'All' ? 'Everything' : profile.dietaryType})
                </h2>
                
                {loadingRecipes ? (
                    <div style={{ color: 'var(--text-muted)' }}>Curating your menu...</div>
                ) : (
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
                        {recipes.map(meal => (
                            <div 
                                key={meal.idMeal} 
                                onClick={() => router.push(`/recipe/${meal.idMeal}`)}
                                style={{ 
                                    background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', 
                                    overflow: 'hidden', cursor: 'pointer', border: '1px solid var(--border)',
                                    transition: 'transform 0.2s, box-shadow 0.2s',
                                    boxShadow: 'var(--shadow)'
                                }}
                                onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = 'var(--shadow-hover)'; }}
                                onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = 'var(--shadow)'; }}
                            >
                                <img src={meal.strMealThumb} alt={meal.strMeal} style={{ width: '100%', height: '200px', objectFit: 'cover' }} />
                                <div style={{ padding: '20px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1.2rem', color: 'var(--text-main)', lineHeight: '1.4' }}>{meal.strMeal}</h3>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            <section style={{ marginTop: '40px' }}>
                <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                    Family Sync
                </h2>
                <div style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div style={{ flex: '1', minWidth: '300px', padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' }}>
                        <h3 style={{ marginBottom: '15px' }}>Add a Family Member</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '15px', fontSize: '0.9rem' }}>Invite a family member to your group.</p>
                        <form onSubmit={handleInviteMember} style={{ display: 'flex', gap: '10px' }}>
                            <input 
                                type="email" 
                                placeholder="Email address" 
                                required 
                                value={inviteEmail}
                                onChange={(e) => setInviteEmail(e.target.value)}
                                style={{ flex: '1', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
                            />
                            <button type="submit" style={{ padding: '10px 20px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Invite</button>
                        </form>
                    </div>

                    <div style={{ flex: '1', minWidth: '300px', padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' }}>
                        <h3 style={{ marginBottom: '15px' }}>Join a Group</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '15px', fontSize: '0.9rem' }}>Enter a family code to join an existing group.</p>
                        <form onSubmit={handleJoinFamily} style={{ display: 'flex', gap: '10px' }}>
                            <input 
                                type="text" 
                                placeholder="Family Code" 
                                required 
                                value={inviteCode}
                                onChange={(e) => setInviteCode(e.target.value)}
                                style={{ flex: '1', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }} 
                            />
                            <button type="submit" style={{ padding: '10px 20px', background: 'var(--primary-color)', color: '#fff', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: '600' }}>Join</button>
                        </form>
                    </div>
                </div>
            </section>
        </div>
    );
}
