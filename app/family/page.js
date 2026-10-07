"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'sonner';
import { Download, MessageCircle, Pencil, Save, Share2, Trash2, X } from 'lucide-react';
import { auth } from '@/lib/firebaseConfig';
import { downloadMealPlanPdf } from '@/lib/mealPlanPdf';
import '@/components/Family.css';

async function fetchFamilyInfo(uid) {
    const res = await fetch(`/api/family?uid=${encodeURIComponent(uid)}`);
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Failed to load family information.');
    return data;
}

export default function FamilyPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [profileName, setProfileName] = useState('');
    const [familyInfo, setFamilyInfo] = useState(null);
    const [inviteInput, setInviteInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [downloadingPlan, setDownloadingPlan] = useState(false);
    const [draftPlan, setDraftPlan] = useState(null);
    const [commentInput, setCommentInput] = useState('');

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (!firebaseUser) {
                router.push('/login');
                return;
            }

            setUser(firebaseUser);
            try {
                const [profileRes, familyData] = await Promise.all([
                    fetch(`/api/users?uid=${encodeURIComponent(firebaseUser.uid)}`),
                    fetchFamilyInfo(firebaseUser.uid),
                ]);
                setFamilyInfo(familyData);
                if (profileRes.ok) {
                    const profile = await profileRes.json();
                    setProfileName(profile.name || '');
                }
            } catch (error) {
                console.error('Failed to load family page data:', error);
                toast.error(error.message || 'Failed to load family information.');
            } finally {
                setLoading(false);
            }
        });

        return () => unsubscribe();
    }, [router]);

    const handleCreateFamily = async () => {
        if (!user) return;
        setSaving(true);
        try {
            const res = await fetch('/api/family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'create',
                    firebaseUID: user.uid,
                    email: user.email,
                    name: profileName || user.displayName,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to create family.');
            setFamilyInfo(await fetchFamilyInfo(user.uid));
            toast.success('Family group created!');
        } catch (error) {
            toast.error(error.message || 'Failed to create family.');
        } finally {
            setSaving(false);
        }
    };

    const handleJoinFamily = async (event) => {
        event.preventDefault();
        if (!user || !inviteInput.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/family', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    action: 'join',
                    inviteValue: inviteInput.trim(),
                    firebaseUID: user.uid,
                    email: user.email,
                    name: profileName || user.displayName,
                }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to join family.');
            setFamilyInfo(await fetchFamilyInfo(user.uid));
            setInviteInput('');
            toast.success('Joined family successfully!');
        } catch (error) {
            toast.error(error.message || 'Failed to join family.');
        } finally {
            setSaving(false);
        }
    };

    const handleRemoveFamilyMember = async (targetUid) => {
        if (!user || !familyInfo?.familyCode || !window.confirm('Are you sure you want to remove this member?')) return;
        setSaving(true);
        try {
            const params = new URLSearchParams({
                familyCode: familyInfo.familyCode,
                targetUid,
                requesterUid: user.uid,
            });
            const res = await fetch(`/api/family?${params}`, { method: 'DELETE' });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Failed to update family members.');
            setFamilyInfo(await fetchFamilyInfo(user.uid));
            toast.success(targetUid === user.uid ? 'You left the family.' : 'Member removed.');
        } catch (error) {
            toast.error(error.message || 'Failed to update family members.');
        } finally {
            setSaving(false);
        }
    };

    const handleShareFamilyCode = async () => {
        if (!familyInfo?.familyCode) return;
        const shareText = `Join my SmartMeal family with code: ${familyInfo.familyCode}`;

        if (navigator.share) {
            try {
                await navigator.share({
                    title: 'SmartMeal Family Invite',
                    text: shareText,
                    url: window.location.origin,
                });
                toast.success('Invite shared.');
            } catch (error) {
                if (error.name !== 'AbortError') toast.error('Could not share family invite.');
            }
            return;
        }

        if (navigator.clipboard?.writeText) {
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

    const updateDraftMeal = (dayIndex, mealIndex, update) => {
        setDraftPlan((current) => {
            const next = structuredClone(current);
            next.days[dayIndex].meals[mealIndex] = update(next.days[dayIndex].meals[mealIndex]);
            return next;
        });
    };

    const handleSaveMealPlan = async () => {
        if (!user || !draftPlan) return;
        setSaving(true);
        try {
            const res = await fetch('/api/family/meal-plan', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: user.uid, plan: draftPlan }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Could not save the family meal plan.');
            setFamilyInfo((current) => ({ ...current, sharedMealPlan: data.sharedMealPlan }));
            setDraftPlan(null);
            toast.success('Family meal plan updated.');
        } catch (error) {
            toast.error(error.message || 'Could not save the family meal plan.');
        } finally {
            setSaving(false);
        }
    };

    const handleAddPlanComment = async (event) => {
        event.preventDefault();
        if (!user || !commentInput.trim()) return;
        setSaving(true);
        try {
            const res = await fetch('/api/family/meal-plan', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ uid: user.uid, text: commentInput.trim() }),
            });
            const data = await res.json();
            if (!res.ok || !data.success) throw new Error(data.error || 'Could not add your comment.');
            setFamilyInfo((current) => ({ ...current, mealPlanComments: data.comments }));
            setCommentInput('');
            toast.success('Comment added.');
        } catch (error) {
            toast.error(error.message || 'Could not add your comment.');
        } finally {
            setSaving(false);
        }
    };

    const handleDownloadPlan = async () => {
        const plan = familyInfo?.sharedMealPlan;
        if (!plan) return;
        setDownloadingPlan(true);
        try {
            const date = new Date(plan.generatedAt || Date.now());
            const dateLabel = Number.isNaN(date.getTime()) ? new Date().toISOString().slice(0, 10) : date.toISOString().slice(0, 10);
            await downloadMealPlanPdf(plan, `family-meal-plan-${dateLabel}.pdf`);
            toast.success('Family meal plan PDF downloaded.');
        } catch (error) {
            console.error('Family meal plan PDF export failed:', error);
            toast.error('Could not download the family meal plan PDF.');
        } finally {
            setDownloadingPlan(false);
        }
    };

    const handleSharePlan = async () => {
        const plan = familyInfo?.sharedMealPlan;
        if (!plan) return;
        const shareData = {
            title: 'Family 7-day meal plan',
            text: `Our family has a shared 7-day meal plan with ${plan.days.length} days of meals.`,
            url: `${window.location.origin}/family`,
        };
        try {
            if (navigator.share) {
                await navigator.share(shareData);
            } else if (navigator.clipboard?.writeText) {
                await navigator.clipboard.writeText(`${shareData.text} View it at ${shareData.url}`);
            } else {
                toast.error('Sharing is not available on this device.');
                return;
            }
            toast.success('Family meal plan shared.');
        } catch (error) {
            if (error.name !== 'AbortError') toast.error('Could not share the family meal plan.');
        }
    };

    if (loading) {
        return (
            <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
                Loading Family Sync...
            </div>
        );
    }

    return (
        <main className="family-sync-page">
            <div className="family-container">
                <h1>Family Sync</h1>
                <p>Share your grocery list and favorite meals with family members.</p>

                {!familyInfo ? (
                    <div className="family-setup">
                        <section className="family-option-card">
                            <h3>Create a family group</h3>
                            <p>Start a shared family space and invite others with your family code.</p>
                            <button className="family-btn primary" onClick={handleCreateFamily} disabled={saving}>
                                {saving ? 'Please wait...' : 'Create Family Group'}
                            </button>
                        </section>

                        <span className="family-divider">or</span>

                        <form className="family-option-card" onSubmit={handleJoinFamily}>
                            <h3>Join a family group</h3>
                            <p>Enter a family code or a member&apos;s email address to join.</p>
                            <input
                                className="family-input"
                                type="text"
                                placeholder="Family code or email"
                                value={inviteInput}
                                onChange={(event) => setInviteInput(event.target.value)}
                                required
                            />
                            <button className="family-btn secondary" type="submit" disabled={saving}>
                                {saving ? 'Please wait...' : 'Join Family'}
                            </button>
                        </form>
                    </div>
                ) : (
                    <section className="family-dashboard">
                        <div className="family-info-bar">
                            <div>
                                <span>Family Code</span>
                                <span className="family-code-badge">{familyInfo.familyCode}</span>
                                <p>Share this code with people you want to invite.</p>
                            </div>
                            <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                                <button className="family-btn primary" onClick={handleShareFamilyCode} disabled={saving}>
                                    Share Code
                                </button>
                                <button className="family-btn secondary" onClick={() => handleRemoveFamilyMember(user.uid)} disabled={saving}>
                                    Leave Family
                                </button>
                            </div>
                        </div>

                        <h2>Family Members</h2>
                        <ul style={{ listStyle: 'none', padding: 0, display: 'grid', gap: '10px' }}>
                            {(familyInfo.members || []).map((member) => (
                                <li
                                    key={member.firebaseUID}
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        alignItems: 'center',
                                        gap: '12px',
                                        padding: '14px',
                                        background: 'var(--bg-hover)',
                                        borderRadius: '10px',
                                    }}
                                >
                                    <div>
                                        <strong>{member.name || 'Member'}{member.firebaseUID === user.uid ? ' (You)' : ''}</strong>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{member.email}</div>
                                    </div>
                                    {familyInfo.createdBy === user.uid && member.firebaseUID !== user.uid && (
                                        <button
                                            type="button"
                                            onClick={() => handleRemoveFamilyMember(member.firebaseUID)}
                                            disabled={saving}
                                            aria-label={`Remove ${member.name || member.email} from family`}
                                            style={{ color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}
                                        >
                                            <Trash2 size={18} />
                                        </button>
                                    )}
                                </li>
                            ))}
                        </ul>

                        <section className="family-meal-plan">
                            <div className="family-plan-heading">
                                <div>
                                    <span className="family-plan-eyebrow">SHARED WITH YOUR FAMILY</span>
                                    <h2>7-day meal plan</h2>
                                    {familyInfo.sharedMealPlan?.updatedByName && (
                                        <p>Last updated by {familyInfo.sharedMealPlan.updatedByName}</p>
                                    )}
                                </div>
                                {familyInfo.sharedMealPlan && (
                                    <div className="family-plan-actions">
                                        {draftPlan ? (
                                            <>
                                                <button className="family-btn primary" onClick={handleSaveMealPlan} disabled={saving}>
                                                    <Save size={16} /> {saving ? 'Saving...' : 'Save edits'}
                                                </button>
                                                <button className="family-btn secondary" onClick={() => setDraftPlan(null)} disabled={saving}>
                                                    <X size={16} /> Cancel
                                                </button>
                                            </>
                                        ) : (
                                            <>
                                                <button className="family-btn secondary" onClick={() => setDraftPlan(structuredClone(familyInfo.sharedMealPlan))}>
                                                    <Pencil size={16} /> Edit plan
                                                </button>
                                                <button className="family-btn secondary" onClick={handleDownloadPlan} disabled={downloadingPlan}>
                                                    <Download size={16} /> {downloadingPlan ? 'Creating PDF...' : 'Download PDF'}
                                                </button>
                                                <button className="family-btn primary" onClick={handleSharePlan}>
                                                    <Share2 size={16} /> Share
                                                </button>
                                            </>
                                        )}
                                    </div>
                                )}
                            </div>

                            {familyInfo.sharedMealPlan ? (
                                <>
                                    <p className="family-plan-collaboration-note">Everyone in the family can edit this plan and leave comments.</p>
                                    <div className="family-plan-days">
                                        {(draftPlan || familyInfo.sharedMealPlan).days.map((day, dayIndex) => (
                                            <article className="family-plan-day" key={`${day.day}-${dayIndex}`}>
                                                <h3>{day.day}</h3>
                                                <div className="family-plan-meals">
                                                    {day.meals.map((meal, mealIndex) => (
                                                        <div className="family-plan-meal" key={`${meal.type}-${mealIndex}`}>
                                                            <span className="family-plan-meal-type">{meal.type}</span>
                                                            {draftPlan ? (
                                                                <div className="family-plan-editor">
                                                                    <label>
                                                                        Meal name
                                                                        <input
                                                                            value={meal.name}
                                                                            onChange={(event) => updateDraftMeal(dayIndex, mealIndex, (current) => ({ ...current, name: event.target.value }))}
                                                                        />
                                                                    </label>
                                                                    <label>
                                                                        Description
                                                                        <textarea
                                                                            value={meal.description}
                                                                            rows={2}
                                                                            onChange={(event) => updateDraftMeal(dayIndex, mealIndex, (current) => ({ ...current, description: event.target.value }))}
                                                                        />
                                                                    </label>
                                                                    <fieldset>
                                                                        <legend>Ingredients</legend>
                                                                        {meal.ingredients.map((ingredient, ingredientIndex) => (
                                                                            <div className="family-ingredient-editor" key={ingredientIndex}>
                                                                                <input
                                                                                    aria-label="Ingredient name"
                                                                                    value={ingredient.name}
                                                                                    onChange={(event) => updateDraftMeal(dayIndex, mealIndex, (current) => ({
                                                                                        ...current,
                                                                                        ingredients: current.ingredients.map((item, index) => index === ingredientIndex ? { ...item, name: event.target.value } : item),
                                                                                    }))}
                                                                                />
                                                                                <input
                                                                                    aria-label="Ingredient quantity"
                                                                                    value={ingredient.quantity}
                                                                                    onChange={(event) => updateDraftMeal(dayIndex, mealIndex, (current) => ({
                                                                                        ...current,
                                                                                        ingredients: current.ingredients.map((item, index) => index === ingredientIndex ? { ...item, quantity: event.target.value } : item),
                                                                                    }))}
                                                                                />
                                                                            </div>
                                                                        ))}
                                                                    </fieldset>
                                                                    <label>
                                                                        Cooking steps (one per line)
                                                                        <textarea
                                                                            value={meal.steps.join('\n')}
                                                                            rows={3}
                                                                            onChange={(event) => updateDraftMeal(dayIndex, mealIndex, (current) => ({ ...current, steps: event.target.value.split('\n') }))}
                                                                        />
                                                                    </label>
                                                                </div>
                                                            ) : (
                                                                <>
                                                                    <h4>{meal.name}</h4>
                                                                    <p>{meal.description}</p>
                                                                    <div className="family-plan-nutrition">
                                                                        <span>{Math.round(meal.calories)} kcal</span>
                                                                        <span>{Math.round(meal.protein)}g protein</span>
                                                                        <span>{Math.round(meal.estimatedCost)} {familyInfo.sharedMealPlan.currency || 'USD'}</span>
                                                                    </div>
                                                                    <details>
                                                                        <summary>Ingredients &amp; cooking steps</summary>
                                                                        <ul>{meal.ingredients.map((ingredient, index) => <li key={`${ingredient.name}-${index}`}>{ingredient.quantity} {ingredient.name}</li>)}</ul>
                                                                        <ol>{meal.steps.map((step, index) => <li key={index}>{step}</li>)}</ol>
                                                                    </details>
                                                                </>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </article>
                                        ))}
                                    </div>
                                    {!draftPlan && (
                                        <div className="family-plan-groceries">
                                            <h3>Shared grocery list</h3>
                                            <ul>{familyInfo.sharedMealPlan.groceryList.map((item, index) => <li key={`${item.name}-${index}`}>{item.quantity} {item.name}</li>)}</ul>
                                        </div>
                                    )}
                                    <section className="family-plan-comments">
                                        <h3><MessageCircle size={18} /> Family comments</h3>
                                        <form onSubmit={handleAddPlanComment}>
                                            <textarea
                                                value={commentInput}
                                                maxLength={500}
                                                rows={3}
                                                placeholder="Suggest a meal or leave a note for the family..."
                                                onChange={(event) => setCommentInput(event.target.value)}
                                                required
                                            />
                                            <div className="family-comment-submit">
                                                <small>{commentInput.length}/500</small>
                                                <button className="family-btn primary" type="submit" disabled={saving || !commentInput.trim()}>
                                                    {saving ? 'Posting...' : 'Add comment'}
                                                </button>
                                            </div>
                                        </form>
                                        <ul>
                                            {(familyInfo.mealPlanComments || []).map((comment, index) => (
                                                <li key={`${comment.uid}-${comment.createdAt}-${index}`}>
                                                    <strong>{comment.name}</strong>
                                                    <p>{comment.text}</p>
                                                    <time>{new Date(comment.createdAt).toLocaleString()}</time>
                                                </li>
                                            ))}
                                        </ul>
                                    </section>
                                </>
                            ) : (
                                <div className="family-plan-empty">
                                    <p>No shared plan yet. Create a 7-day meal plan, then choose <strong>Share with family</strong> to make it available here.</p>
                                    <button className="family-btn primary" onClick={() => router.push('/meal-planner')}>Create a meal plan</button>
                                </div>
                            )}
                        </section>
                    </section>
                )}
            </div>
        </main>
    );
}
