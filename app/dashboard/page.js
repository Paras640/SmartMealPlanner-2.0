"use client";
import React, { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebaseConfig';
import { onAuthStateChanged } from 'firebase/auth';
import OnboardingModal from '@/components/OnboardingModal';
import { toast } from 'sonner';
import './dashboard.css';

export default function DashboardPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(true);
    const [recipes, setRecipes] = useState([]);
    const [loadingRecipes, setLoadingRecipes] = useState(false);
    const [familyInfo, setFamilyInfo] = useState(null);
    const [invites, setInvites] = useState([]);

    const fetchPersonalizedRecipes = useCallback(async (profileData) => {
        setLoadingRecipes(true);
        try {
            const diet = profileData.dietaryType || profileData.mealPreference || 'All';
            let query = diet === 'Vegan' ? 'Vegan' : diet === 'Non-Veg' || diet === 'Keto' || diet === 'Low-Carb' ? 'Seafood' : 'Vegetarian';

            if (profileData.healthConditions && profileData.healthConditions.length > 0) {
                if (profileData.healthConditions.includes('hypertension')) {
                    query = 'healthy ' + query;
                } else if (profileData.healthConditions.includes('diabetic')) {
                    query = 'diabetic ' + query;
                }
            }

            const res = await fetch(`/api/recipes?query=${encodeURIComponent(query)}&diet=${encodeURIComponent(diet)}`);
            const data = await res.json();

            if (data.recipes) {
                const shuffled = data.recipes.sort(() => 0.5 - Math.random());
                setRecipes(shuffled.slice(0, 6).map(r => ({
                    idMeal: r.id,
                    strMeal: r.title,
                    strMealThumb: r.image
                })));
            }
        } catch (err) {
            toast.error("Failed to load suggestions");
        } finally {
            setLoadingRecipes(false);
        }
    }, []);

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
                    fetchPersonalizedRecipes(data);
                } else {
                    router.push('/onboarding');
                }
                
                try {
                    const famRes = await fetch(`/api/family?uid=${firebaseUser.uid}`);
                    if (famRes.ok) setFamilyInfo(await famRes.json());
                    
                    const invRes = await fetch(`/api/invites?email=${firebaseUser.email}`);
                    if (invRes.ok) {
                        const invData = await invRes.json();
                        setInvites(invData.invites || []);
                    }
                } catch (err) {
                    console.error("Failed to fetch family or invites", err);
                }
            } catch (err) {
                console.error("Failed to fetch profile", err);
                router.push('/onboarding');
            } finally {
                setLoading(false);
            }
        });
        return () => unsub();
    }, [fetchPersonalizedRecipes, router]);

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

    const handleInviteMember = async (e) => {
        e.preventDefault();
        if (!inviteEmail.trim()) return;
        if (!familyInfo?.familyCode) {
            toast.error("You must create or join a family first in Settings before inviting others.");
            return;
        }
        
        try {
            const res = await fetch('/api/invites', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    familyCode: familyInfo.familyCode,
                    senderUid: user.uid,
                    senderName: profile.name || user.displayName,
                    targetEmail: inviteEmail.trim()
                })
            });
            const data = await res.json();
            if (data.success) {
                toast.success(`Invitation sent to ${inviteEmail}!`);
                setInviteEmail('');
            } else {
                toast.error(data.error || 'Failed to send invite.');
            }
        } catch (err) {
            toast.error('Failed to send invite.');
        }
    };

    const handleRespondToInvite = async (inviteId, familyCode, accept) => {
        try {
            await fetch('/api/invites', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ inviteId, status: accept ? 'accepted' : 'rejected' })
            });

            setInvites(prev => prev.filter(inv => inv._id !== inviteId));

            if (accept) {
                const res = await fetch('/api/family', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'join', inviteValue: familyCode, firebaseUID: user.uid, email: user.email, name: profile.name || user.displayName })
                });
                const data = await res.json();
                if (data.success) {
                    toast.success('Joined family group successfully!');
                    setFamilyInfo(data.family);
                } else {
                    toast.error(data.error || 'Failed to join group.');
                }
            } else {
                toast.success('Invitation rejected.');
            }
        } catch (err) {
            toast.error('Failed to process invitation.');
        }
    };

    if (loading) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading Dashboard...
        </div>
    );

    if (!profile) return null;

    return (
        <div className="dashboard-page" style={{ padding: '40px 20px', maxWidth: '1200px', margin: '0 auto', minHeight: '100vh' }}>
            <header style={{ marginBottom: '40px' }}>
                <h1 style={{ fontSize: '2.5rem', marginBottom: '10px' }}>Dashboard</h1>
                <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem' }}>
                    Welcome back, {profile.name?.split(' ')[0]}! Here are your personalized suggestions for your <strong>{profile.goal || "Healthy"}</strong> goal.
                </p>
            </header>

            <section>
                <h2 style={{ fontSize: '1.8rem', marginBottom: '20px', borderBottom: '2px solid var(--border)', paddingBottom: '10px' }}>
                    Recommended For You ({profile.dietaryType === 'All' ? 'Everything' : profile.dietaryType})
                </h2>
                
                {loadingRecipes ? (
                    <div style={{ color: 'var(--text-muted)' }}>Curating your menu...</div>
                ) : (
                    <div className="dashboard-recipe-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '24px' }}>
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

                {familyInfo && familyInfo.members && familyInfo.members.length > 0 && (
                    <div style={{ marginBottom: '30px' }}>
                        <h3 style={{ marginBottom: '15px', fontSize: '1.4rem' }}>Family Activity & Preferences</h3>
                        <div className="dashboard-family-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
                            {familyInfo.members.map(member => (
                                <div className="dashboard-member-card" key={member.firebaseUID} style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                                    <h4 style={{ margin: '0 0 15px 0', fontSize: '1.2rem', color: 'var(--primary-color)' }}>
                                        {member.name || member.email} {member.firebaseUID === user.uid && "(You)"}
                                    </h4>
                                    
                                    {member.preferences && (
                                        <div style={{ marginBottom: '15px', fontSize: '0.95rem', background: 'var(--bg-main)', padding: '10px', borderRadius: '8px' }}>
                                            <div style={{ marginBottom: '5px' }}><strong>Dietary:</strong> {member.preferences.dietaryType || 'Any'}</div>
                                            <div style={{ marginBottom: '5px' }}><strong>Goal:</strong> {member.preferences.goal || 'General'}</div>
                                            {member.preferences.allergies?.length > 0 && (
                                                <div style={{ color: '#ef4444' }}><strong>Avoids:</strong> {member.preferences.allergies.join(', ')}</div>
                                            )}
                                        </div>
                                    )}

                                    <div>
                                        <strong style={{ display: 'block', marginBottom: '10px', fontSize: '0.95rem' }}>Liked Recipes:</strong>
                                        {member.likedRecipes && member.likedRecipes.length > 0 ? (
                                            <div style={{ display: 'flex', gap: '10px', overflowX: 'auto', paddingBottom: '5px', scrollbarWidth: 'thin' }}>
                                                {member.likedRecipes.map(recipe => (
                                                    <div 
                                                        key={recipe._id} 
                                                        onClick={() => router.push(recipe.mealDbId ? `/recipe/${recipe.mealDbId}` : `/recipe/custom/${recipe._id}`)}
                                                        style={{ minWidth: '80px', cursor: 'pointer', textAlign: 'center' }}
                                                        title={recipe.title}
                                                    >
                                                        <img 
                                                            src={recipe.imageURL || 'https://via.placeholder.com/150'} 
                                                            alt={recipe.title} 
                                                            style={{ width: '80px', height: '80px', objectFit: 'cover', borderRadius: '8px', marginBottom: '5px', boxShadow: 'var(--shadow)' }} 
                                                        />
                                                        <div style={{ fontSize: '0.75rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '80px', color: 'var(--text-main)' }}>
                                                            {recipe.title}
                                                        </div>
                                                    </div>
                                                ))}
                                            </div>
                                        ) : (
                                            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', margin: 0 }}>No favorites yet.</p>
                                        )}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {invites.length > 0 && (
                    <div style={{ marginBottom: '20px', padding: '15px', background: 'var(--bg-card)', borderRadius: '12px', border: '2px solid var(--primary-color)' }}>
                        <h3 style={{ marginBottom: '10px', color: 'var(--primary-color)' }}>Pending Invitations</h3>
                        {invites.map(inv => (
                            <div key={inv._id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'var(--bg-main)', padding: '12px', borderRadius: '8px', marginBottom: '8px', border: '1px solid var(--border)' }}>
                                <span><strong>{inv.senderName}</strong> invited you to their family group.</span>
                                <div style={{ display: 'flex', gap: '10px' }}>
                                    <button onClick={() => handleRespondToInvite(inv._id, inv.familyCode, true)} style={{ background: 'var(--primary-color)', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Accept</button>
                                    <button onClick={() => handleRespondToInvite(inv._id, inv.familyCode, false)} style={{ background: '#ef4444', color: 'white', padding: '8px 16px', border: 'none', borderRadius: '6px', cursor: 'pointer', fontWeight: 'bold' }}>Reject</button>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                <div className="dashboard-family-actions" style={{ display: 'flex', gap: '20px', flexWrap: 'wrap' }}>
                    <div className="dashboard-family-action-card" style={{ flex: '1', minWidth: '300px', padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' }}>
                        <h3 style={{ marginBottom: '15px' }}>Add a Family Member</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '15px', fontSize: '0.9rem' }}>Invite a family member to your group.</p>
                        <form className="dashboard-family-action-form" onSubmit={handleInviteMember} style={{ display: 'flex', gap: '10px' }}>
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

                    <div className="dashboard-family-action-card" style={{ flex: '1', minWidth: '300px', padding: '20px', background: 'var(--bg-card)', borderRadius: 'var(--radius-xl)', border: '1px solid var(--border)' }}>
                        <h3 style={{ marginBottom: '15px' }}>Join a Group</h3>
                        <p style={{ color: 'var(--text-muted)', marginBottom: '15px', fontSize: '0.9rem' }}>Enter a family code to join an existing group.</p>
                        <form className="dashboard-family-action-form" onSubmit={handleJoinFamily} style={{ display: 'flex', gap: '10px' }}>
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
