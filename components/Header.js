"use client";

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import ThemeToggle from '@/components/DarkmodeToogle';
import { auth } from '@/lib/firebaseConfig';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import './Header.css';

const navLinks = [
    { href: '/', label: 'Home' },
    { href: '/products', label: 'Recipes' },
    { href: '/meal-planner', label: 'Meal Planner' },
    { href: '/community', label: 'Community' },
    { href: '/chat', label: 'NutriBot' },
    { href: '/about', label: 'About' },
];

const Header = () => {
    const [user, setUser] = useState(null);
    const [userMenuOpen, setUserMenuOpen] = useState(false);
    const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
    const [aiEnabled, setAiEnabled] = useState(true);
    const pathname = usePathname();
    const router = useRouter();

    useEffect(() => {
        const refreshAiPreference = async (firebaseUser) => {
            setUser(firebaseUser || null);
            if (!firebaseUser) {
                setAiEnabled(true);
                return;
            }

            try {
                const res = await fetch(`/api/users?uid=${firebaseUser.uid}`);
                if (res.ok) {
                    const profile = await res.json();
                    setAiEnabled(profile.isAIEnabled !== false);
                }
            } catch {
                setAiEnabled(true);
            }
        };

        const unsub = onAuthStateChanged(auth, refreshAiPreference);
        const onAiSettingUpdated = () => {
            const currentUser = auth.currentUser;
            if (currentUser) {
                refreshAiPreference(currentUser);
            }
        };

        window.addEventListener('ai-setting-updated', onAiSettingUpdated);
        return () => {
            unsub();
            window.removeEventListener('ai-setting-updated', onAiSettingUpdated);
        };
    }, []);

    const handleLogout = async () => {
        await signOut(auth);
        setUserMenuOpen(false);
        setMobileMenuOpen(false);
        router.push('/');
    };

    const isActive = (path) => pathname === path ? 'active' : '';

    return (
        <header className="site-header glass-header">
            <Link href="/" className="logo-text" style={{ textDecoration: 'none' }}>
                SmartMeal
            </Link>

            <nav className="nav-links">
                {navLinks.filter(l => l.label !== 'About' && (l.href !== '/meal-planner' || user)).map((link) => (
                    <Link key={link.href} href={link.href} className={`nav-link ${isActive(link.href)}`}>
                        {link.label}
                    </Link>
                ))}
                {user && <Link href="/family" className={`nav-link ${isActive('/family')}`}>Family Sync</Link>}
                <Link href="/about" className={`nav-link ${isActive('/about')}`}>About</Link>
            </nav>

            <button
                className="mobile-menu-toggle"
                type="button"
                onClick={() => setMobileMenuOpen((prev) => !prev)}
                aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-navigation"
            >
                {mobileMenuOpen ? "✕ Close" : "☰ Menu"}
            </button>

            {mobileMenuOpen && (
                <nav className="mobile-nav-panel" id="mobile-navigation" aria-label="Mobile navigation">
                    {navLinks.filter(l => l.label !== 'About' && (l.href !== '/meal-planner' || user)).map((link) => (
                        <Link key={link.href} href={link.href} className={`mobile-nav-link ${isActive(link.href)}`} onClick={() => setMobileMenuOpen(false)}>
                            {link.label}
                        </Link>
                    ))}
                    {user ? (
                        <>
                            <Link href="/family" className={`mobile-nav-link ${isActive('/family')}`} onClick={() => setMobileMenuOpen(false)}>Family Sync</Link>
                            <Link href="/about" className={`mobile-nav-link ${isActive('/about')}`} onClick={() => setMobileMenuOpen(false)}>About</Link>
                            <Link href="/settings" className="mobile-nav-link" onClick={() => setMobileMenuOpen(false)}>Settings</Link>
                            <button className="mobile-nav-link mobile-nav-logout" onClick={handleLogout}>Log Out</button>
                        </>
                    ) : (
                        <>
                            <Link href="/about" className={`mobile-nav-link ${isActive('/about')}`} onClick={() => setMobileMenuOpen(false)}>About</Link>
                        </>
                    )}
                </nav>
            )}

            <div className="header-actions">
                <ThemeToggle />

                {user ? (
                    <div style={{ position: 'relative' }}>
                        <div
                            className="user-badge"
                            title={user.displayName || user.email}
                            onClick={() => setUserMenuOpen(!userMenuOpen)}
                            style={{ cursor: 'pointer' }}
                        >
                            {user.photoURL ? (
                                <img src={user.photoURL} alt="avatar" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
                            ) : (
                                (user.displayName || user.email)?.[0]?.toUpperCase() || '👤'
                            )}
                        </div>

                        {userMenuOpen && (
                            <div className="lang-dropdown animate-fade-in" style={{ padding: '0', minWidth: '200px', right: '-10px' }}>
                                <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
                                    <strong style={{ display: 'block', fontSize: '0.95rem' }}>{user.displayName || 'User'}</strong>
                                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{user.email}</span>
                                </div>
                                <Link href="/dashboard" className="lang-option" onClick={() => setUserMenuOpen(false)} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>📊 Dashboard</Link>
                                <Link href="/settings" className="lang-option" onClick={() => setUserMenuOpen(false)} style={{ display: 'block', textDecoration: 'none', color: 'inherit' }}>⚙️ Settings</Link>
                                <div
                                    className="lang-option"
                                    onClick={handleLogout}
                                    style={{ color: '#ef4444', borderTop: '1px solid var(--border)', cursor: 'pointer' }}
                                >
                                    🚪 Log Out
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <Link href="/login" className="login-btn" style={{ textDecoration: 'none' }}>Log In</Link>
                )}
            </div>
        </header>
    );
};

export default Header;