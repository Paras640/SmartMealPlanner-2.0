"use client";

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { onAuthStateChanged } from 'firebase/auth';
import { toast } from 'sonner';
import { Trash2 } from 'lucide-react';
import { auth } from '@/lib/firebaseConfig';
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
                    </section>
                )}
            </div>
        </main>
    );
}
