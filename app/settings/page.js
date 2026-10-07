"use client";
import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { auth } from '@/lib/firebaseConfig';
import { onAuthStateChanged, deleteUser } from 'firebase/auth';
import { toast } from 'sonner';
import { Trash2, CheckCircle, Circle, Save } from 'lucide-react';
import './settings.css';

export default function SettingsPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [profile, setProfile] = useState(null);
    const [groceryList, setGroceryList] = useState([]);
    const [favourites, setFavourites] = useState([]);
    const [familyInfo, setFamilyInfo] = useState(null);
    const [sharedGroceryList, setSharedGroceryList] = useState([]);
    const [inviteInput, setInviteInput] = useState("");
    const [loading, setLoading] = useState(true);

    const [savingProfile, setSavingProfile] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [removingFavouriteId, setRemovingFavouriteId] = useState(null);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                router.push('/login');
                return;
            }
            setUser(firebaseUser);
            
            try {
                // Fetch profile - create default if not found
                let profileData = null;
                try {
                    const profRes = await fetch(`/api/users?uid=${firebaseUser.uid}`);
                    if (profRes.ok) {
                        profileData = await profRes.json();
                        if (profileData.dietaryType === 'Keto') profileData.dietaryType = 'All';
                    }
                } catch {}
                // If user doesn't exist in DB yet, use a sensible default so the page renders
                setProfile(profileData || {
                    firebaseUID: firebaseUser.uid,
                    email: firebaseUser.email,
                    name: firebaseUser.displayName || "",
                    dietaryType: "All",
                    goal: "Healthy",
                    isAIEnabled: true,
                });

                // Fetch grocery list
                try {
                    const grocRes = await fetch(`/api/grocery?uid=${firebaseUser.uid}`);
                    if (grocRes.ok) {
                        const gData = await grocRes.json();
                        setGroceryList(gData.items || []);
                    }
                } catch {}

                // Fetch favourites
                try {
                    const favRes = await fetch(`/api/users/favourites?uid=${firebaseUser.uid}`);
                    if (favRes.ok) {
                        const fData = await favRes.json();
                        setFavourites(fData.favourites || []);
                    }
                } catch {}

                // Fetch family info
                try {
                    const famRes = await fetch(`/api/family?uid=${firebaseUser.uid}`);
                    if (famRes.ok) {
                        const fInfo = await famRes.json();
                        setFamilyInfo(fInfo);
                        if (fInfo?.sharedGroceryList) {
                            setSharedGroceryList(fInfo.sharedGroceryList);
                        }
                    }
                } catch {}
            } catch (err) {
                toast.error("Failed to load settings data.");
            } finally {
                setLoading(false);
            }
        });
        return () => unsub();
    }, [router]);

    const handleSaveProfile = async () => {
        setSavingProfile(true);
        try {
            const res = await fetch('/api/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firebaseUID: user.uid,
                    email: user.email,
                    name: profile.name || user.displayName,
                    preferences: {
                        isAIEnabled: profile.isAIEnabled,
                        goal: profile.goal,
                        dietaryType: profile.dietaryType
                    }
                })
            });
            if (!res.ok) throw new Error("Failed to save profile");
            window.dispatchEvent(new Event('ai-setting-updated'));
            toast.success("Settings saved successfully!");
        } catch (err) {
            toast.error("Failed to save settings.");
        } finally {
            setSavingProfile(false);
        }
    };

    const handleToggleGroceryItem = async (index) => {
        const updated = [...groceryList];
        updated[index].checked = !updated[index].checked;
        setGroceryList(updated);
        saveGroceryList(updated);
    };

    const handleDeleteGroceryItem = async (index) => {
        const updated = groceryList.filter((_, i) => i !== index);
        setGroceryList(updated);
        saveGroceryList(updated);
    };

    const handleClearGrocery = async () => {
        setGroceryList([]);
        saveGroceryList([]);
        toast.success("Grocery list cleared.");
    };

    const saveGroceryList = async (items) => {
        try {
            await fetch('/api/grocery', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ firebaseUID: user.uid, items })
            });
        } catch (err) {
            toast.error("Failed to sync grocery list.");
        }
    };

    const handleDeleteAccount = async () => {
        if (!confirm("Are you sure you want to delete your account? This action cannot be undone.")) return;
        setDeleting(true);
        try {
            // Delete from DB
            await fetch(`/api/users/delete?uid=${user.uid}`, { method: 'DELETE' });
            // Delete from Firebase
            await deleteUser(user);
            toast.success("Account deleted.");
            router.push('/');
        } catch (err) {
            console.error(err);
            toast.error("Failed to delete account. You may need to sign in again to perform this action.");
        } finally {
            setDeleting(false);
        }
    };

    const handleCreateFamily = async () => {
        try {
            const res = await fetch('/api/family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'create', firebaseUID: user.uid, email: user.email, name: profile.name || user.displayName })
            });
            const data = await res.json();
            if (data.success) {
                setFamilyInfo(data.family);
                toast.success("Family group created!");
            } else toast.error(data.error);
        } catch (err) {
            toast.error("Failed to create family.");
        }
    };

    const handleJoinFamily = async () => {
        if (!inviteInput.trim()) return;
        try {
            const res = await fetch('/api/family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'join', inviteValue: inviteInput.trim(), firebaseUID: user.uid, email: user.email, name: profile.name || user.displayName })
            });
            const data = await res.json();
            if (data.success) {
                setFamilyInfo(data.family);
                setInviteInput("");
                toast.success("Joined family successfully!");
            } else toast.error(data.error);
        } catch (err) {
            toast.error("Failed to join family.");
        }
    };

    const handleRemoveFamilyMember = async (targetUid) => {
        if (!confirm("Are you sure you want to remove this member?")) return;
        try {
            const res = await fetch(`/api/family?familyCode=${familyInfo.familyCode}&targetUid=${targetUid}&requesterUid=${user.uid}`, {
                method: 'DELETE'
            });
            const data = await res.json();
            if (data.success) {
                setFamilyInfo(data.family); // if null, it means family was deleted because no members left
                toast.success("Member removed.");
            } else toast.error(data.error);
        } catch (err) {
            toast.error("Failed to remove member.");
        }
    };

    const handleRemoveFavourite = async (recipe) => {
        if (!user?.uid) return;

        const recipeId = recipe.mealDbId || recipe.spoonacularId || recipe._id;
        if (!recipeId || removingFavouriteId) return;

        setRemovingFavouriteId(String(recipeId));
        try {
            const res = await fetch(`/api/users/favourites?uid=${encodeURIComponent(user.uid)}&recipeId=${encodeURIComponent(recipeId)}`, {
                method: 'DELETE',
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || 'Failed to remove favourite');
            setFavourites(prev => prev.filter((item) => {
                const itemId = item.mealDbId || item.spoonacularId || item._id;
                return itemId !== recipeId;
            }));
            toast.success('Removed from favourites.');
        } catch (err) {
            console.error('Could not remove favourite:', err);
            toast.error(err.message || 'Could not remove favourite.');
        } finally {
            setRemovingFavouriteId(null);
        }
    };

    const handleShareFamilyCode = async () => {
        if (!familyInfo?.familyCode) return;

        const shareText = `Join my SmartMeal family with code: ${familyInfo.familyCode}`;

        if (typeof navigator !== 'undefined' && navigator.share) {
            try {
                await navigator.share({
                    title: 'SmartMeal Family Invite',
                    text: shareText,
                    url: window.location.origin,
                });
                toast.success('Invite shared.');
            } catch {
                toast.error('Sharing was cancelled.');
            }
            return;
        }

        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
            try {
                await navigator.clipboard.writeText(shareText);
                toast.success('Family code copied to clipboard.');
            } catch {
                toast.error('Could not copy family code.');
            }
            return;
        }

        toast.error('Sharing is not available on this device.');
    };

    if (loading || !profile) return (
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
            Loading Settings...
        </div>
    );

    const sectionStyle = {
        background: 'var(--bg-card)', padding: '30px', borderRadius: 'var(--radius-xl)',
        border: '1px solid var(--border)', boxShadow: 'var(--shadow)', marginBottom: '30px'
    };

    return (
        <div className="settings-page" style={{ padding: '40px 20px', maxWidth: '800px', margin: '0 auto', minHeight: '100vh' }}>
            <h1 style={{ fontSize: '2.5rem', marginBottom: '40px', fontWeight: '800' }}>Account Settings</h1>

            {/* Profile Settings */}
            <section className="settings-card" style={sectionStyle}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Profile & Preferences</h2>
                <div style={{ display: 'grid', gap: '20px' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Dietary Preference</label>
                        <select 
                            value={profile.dietaryType || 'All'}
                            onChange={e => setProfile({...profile, dietaryType: e.target.value})}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                        >
                            <option value="All">Anything</option>
                            <option value="Veg">Vegetarian</option>
                            <option value="Vegan">Vegan</option>
                        </select>
                    </div>
                    <div>
                        <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Primary Goal</label>
                        <select 
                            value={profile.goal || 'Healthy'}
                            onChange={e => setProfile({...profile, goal: e.target.value})}
                            style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                        >
                            <option value="Healthy">Eat Healthier</option>
                            <option value="Weight Loss">Weight Loss</option>
                            <option value="Muscle Gain">Muscle Gain</option>
                            <option value="Save Time">Save Time Cooking</option>
                        </select>
                    </div>
                    <button 
                        onClick={handleSaveProfile} 
                        disabled={savingProfile}
                        style={{ padding: '12px 24px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', alignSelf: 'flex-start', opacity: savingProfile ? 0.7 : 1 }}
                    >
                        <Save size={18} /> {savingProfile ? 'Saving...' : 'Save Profile'}
                    </button>
                </div>
            </section>

            {/* Grocery List */}
            <section className="settings-card" style={sectionStyle}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border)', paddingBottom: '10px', marginBottom: '20px' }}>
                    <h2 style={{ fontSize: '1.5rem', margin: 0 }}>Grocery List</h2>
                    {groceryList.length > 0 && (
                        <button onClick={handleClearGrocery} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold', fontSize: '0.9rem' }}>
                            Clear All
                        </button>
                    )}
                </div>
                {groceryList.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>Your grocery list is empty. Add ingredients from any recipe!</p>
                ) : (
                    <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                        {groceryList.map((item, idx) => (
                            <li key={idx} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer' }} onClick={() => handleToggleGroceryItem(idx)}>
                                    {item.checked ? <CheckCircle size={20} color="var(--primary-color)" /> : <Circle size={20} color="var(--text-muted)" />}
                                    <span style={{ textDecoration: item.checked ? 'line-through' : 'none', color: item.checked ? 'var(--text-muted)' : 'var(--text-main)', fontSize: '1rem' }}>
                                        {item.name}
                                    </span>
                                </div>
                                <button onClick={() => handleDeleteGroceryItem(idx)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
                                    <Trash2 size={18} />
                                </button>
                            </li>
                        ))}
                    </ul>
                )}
            </section>

            {/* Favourites Section */}
            <section className="settings-card" style={sectionStyle}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Favourite Recipes</h2>
                {favourites.length === 0 ? (
                    <p style={{ color: 'var(--text-muted)' }}>You haven&apos;t liked any recipes yet.</p>
                ) : (
                    <div className="settings-favourites-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' }}>
                        {favourites.map(recipe => (
                            <div 
                                key={recipe._id} 
                                onClick={() => router.push(`/recipe/${recipe.mealDbId || recipe.spoonacularId}`)}
                                style={{ 
                                    background: 'var(--bg-main)', borderRadius: 'var(--radius-lg)', 
                                    border: '1px solid var(--border)', overflow: 'hidden', cursor: 'pointer',
                                    transition: 'transform 0.2s', position: 'relative'
                                }}
                                onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
                            >
                                <button
                                    className="settings-remove-favourite"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        handleRemoveFavourite(recipe);
                                    }}
                                    disabled={removingFavouriteId !== null}
                                    aria-label={`Remove ${recipe.title || 'recipe'} from favourites`}
                                    title="Remove from favourites"
                                >
                                    <Trash2 size={15} />
                                    {removingFavouriteId === String(recipe.mealDbId || recipe.spoonacularId || recipe._id) ? 'Removing...' : 'Remove'}
                                </button>
                                <div style={{ height: '120px', background: 'var(--bg-hover)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ fontSize: '2rem' }}>🍲</span>
                                </div>
                                <div style={{ padding: '12px' }}>
                                    <h3 style={{ margin: 0, fontSize: '1rem', color: 'var(--text-main)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {recipe.title || "Unknown Recipe"}
                                    </h3>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </section>

            {/* Family Sync Section */}
            <section className="settings-card" style={sectionStyle}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '20px', borderBottom: '1px solid var(--border)', paddingBottom: '10px' }}>Family Sync</h2>
                
                {!familyInfo ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <p style={{ color: 'var(--text-muted)' }}>Share your grocery list and favorite meals with family members.</p>
                        <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                            <button onClick={handleCreateFamily} style={{ padding: '10px 20px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                                Create Family Group
                            </button>
                            <span style={{ color: 'var(--text-muted)' }}>or</span>
                            <div style={{ display: 'flex', gap: '8px' }}>
                                <input 
                                    type="text" 
                                    placeholder="Enter code or email" 
                                    value={inviteInput}
                                    onChange={e => setInviteInput(e.target.value)}
                                    style={{ padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)', width: '180px' }}
                                />
                                <button onClick={handleJoinFamily} style={{ padding: '10px 20px', background: 'var(--bg-card)', color: 'var(--text-main)', border: '1px solid var(--border)', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}>
                                    Join
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '20px', padding: '16px', background: 'var(--bg-hover)', borderRadius: '12px' }}>
                            <div>
                                <span style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>Family Code (Share this to invite others)</span>
                                <h3 style={{ fontSize: '1.8rem', letterSpacing: '0.1em', margin: '4px 0 0' }}>{familyInfo.familyCode}</h3>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button onClick={handleShareFamilyCode} style={{ background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '999px', cursor: 'pointer', padding: '8px 12px', fontWeight: '700' }} title="Share family code">
                                    Share Code
                                </button>
                                <button onClick={() => handleRemoveFamilyMember(user.uid)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 'bold' }}>
                                    Leave Family
                                </button>
                            </div>
                        </div>
                        
                        <h3 style={{ fontSize: '1.2rem', marginBottom: '12px' }}>Members</h3>
                        <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                            {familyInfo.members.map(m => (
                                <li key={m.firebaseUID} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'var(--bg)', borderRadius: '8px', border: '1px solid var(--border)' }}>
                                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                                        <span style={{ fontWeight: 'bold' }}>{m.name || "Member"} {m.firebaseUID === user.uid && "(You)"}</span>
                                        <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{m.email}</span>
                                    </div>
                                    {(user.uid === familyInfo.createdBy && m.firebaseUID !== user.uid) && (
                                        <button onClick={() => handleRemoveFamilyMember(m.firebaseUID)} style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>
                    </div>
                )}
            </section>

            {/* Danger Zone */}
            <section className="settings-card settings-danger-zone" style={{ ...sectionStyle, border: '1px solid #fee2e2', background: '#fef2f2' }}>
                <h2 style={{ fontSize: '1.5rem', marginBottom: '10px', color: '#b91c1c' }}>Danger Zone</h2>
                <p style={{ color: '#7f1d1d', marginBottom: '20px' }}>Once you delete your account, there is no going back. Please be certain.</p>
                <button 
                    onClick={handleDeleteAccount} 
                    disabled={deleting}
                    style={{ padding: '12px 24px', background: '#dc2626', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: deleting ? 0.7 : 1 }}
                >
                    {deleting ? 'Deleting...' : 'Delete Account'}
                </button>
            </section>
        </div>
    );
}
