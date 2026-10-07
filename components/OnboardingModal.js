"use client";
import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import CountrySelect from '@/components/CountrySelect';

export default function OnboardingModal({ user, onComplete }) {
    const [step, setStep] = useState(1);
    const [preferences, setPreferences] = useState({
        dietaryType: 'All',
        country: '',
        goal: 'Healthy',
        measurements: {
            height: '',
            weight: '',
            age: '',
            gender: ''
        }
    });
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        setSaving(true);
        try {
            const res = await fetch('/api/users', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    firebaseUID: user.uid,
                    preferences
                })
            });
            if (!res.ok) throw new Error("Failed to save profile");
            toast.success("Profile updated!");
            onComplete();
        } catch (err) {
            toast.error("Error saving profile");
        } finally {
            setSaving(false);
        }
    };

    if (!user) return null;

    return (
        <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            background: 'rgba(0,0,0,0.6)', zIndex: 9999, display: 'flex',
            alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)'
        }}>
            <div className="animate-slide-up" style={{
                background: 'var(--bg-card)', padding: '40px', borderRadius: 'var(--radius-xl)',
                maxWidth: '500px', width: '90%', border: '1px solid var(--border)',
                boxShadow: 'var(--shadow-lg)', color: 'var(--text-main)'
            }}>
                <h2 style={{ fontSize: '1.8rem', marginBottom: '10px', textAlign: 'center' }}>Welcome to SmartMeal! 🎉</h2>
                <p style={{ color: 'var(--text-muted)', textAlign: 'center', marginBottom: '30px' }}>
                    Let&apos;s personalize your experience. Tell us a bit about yourself.
                </p>

                {step === 1 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                        <div>
                            <CountrySelect
                                id="home-country"
                                label="Your home country"
                                value={preferences.country}
                                onChange={(country) => setPreferences((current) => ({ ...current, country }))}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Dietary Preference</label>
                            <select 
                                value={preferences.dietaryType}
                                onChange={e => setPreferences({...preferences, dietaryType: e.target.value})}
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                            >
                                <option value="All">Anything</option>
                                <option value="Veg">Vegetarian</option>
                                <option value="Vegan">Vegan</option>
                                <option value="Keto">Keto</option>
                            </select>
                        </div>
                        <div>
                            <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold' }}>Primary Goal</label>
                            <select 
                                value={preferences.goal}
                                onChange={e => setPreferences({...preferences, goal: e.target.value})}
                                style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                            >
                                <option value="Healthy">Eat Healthier</option>
                                <option value="Weight Loss">Weight Loss</option>
                                <option value="Muscle Gain">Muscle Gain</option>
                                <option value="Save Time">Save Time Cooking</option>
                            </select>
                        </div>
                        <button 
                            onClick={() => setStep(2)}
                            disabled={!preferences.country}
                            style={{ padding: '12px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}
                        >
                            Next Step
                        </button>
                    </div>
                )}

                {step === 2 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '15px' }}>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Age</label>
                                <input 
                                    type="number" placeholder="Years"
                                    value={preferences.measurements.age}
                                    onChange={e => setPreferences({...preferences, measurements: {...preferences.measurements, age: e.target.value}})}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Gender</label>
                                <select 
                                    value={preferences.measurements.gender}
                                    onChange={e => setPreferences({...preferences, measurements: {...preferences.measurements, gender: e.target.value}})}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                                >
                                    <option value="">Select</option>
                                    <option value="Male">Male</option>
                                    <option value="Female">Female</option>
                                    <option value="Other">Other</option>
                                </select>
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Weight (kg)</label>
                                <input 
                                    type="number" placeholder="kg"
                                    value={preferences.measurements.weight}
                                    onChange={e => setPreferences({...preferences, measurements: {...preferences.measurements, weight: e.target.value}})}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', marginBottom: '8px', fontWeight: 'bold', fontSize: '0.9rem' }}>Height (cm)</label>
                                <input 
                                    type="number" placeholder="cm"
                                    value={preferences.measurements.height}
                                    onChange={e => setPreferences({...preferences, measurements: {...preferences.measurements, height: e.target.value}})}
                                    style={{ width: '100%', padding: '12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg)', color: 'var(--text-main)' }}
                                />
                            </div>
                        </div>
                        
                        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
                            <button 
                                onClick={() => setStep(1)}
                                style={{ flex: 1, padding: '12px', background: 'var(--bg-hover)', color: 'var(--text-main)', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer' }}
                            >
                                Back
                            </button>
                            <button 
                                onClick={handleSave}
                                disabled={saving || !preferences.country}
                                style={{ flex: 2, padding: '12px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', fontWeight: 'bold', cursor: 'pointer', opacity: saving ? 0.7 : 1 }}
                            >
                                {saving ? "Saving..." : "Complete Profile"}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
