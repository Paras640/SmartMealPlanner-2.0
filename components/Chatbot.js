"use client"
import React, { useState, useEffect, useRef } from "react";
import { Bot, Camera, Send, X, StopCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import "@/styles/Chatbot.css";
import { auth } from "@/lib/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

const Chatbot = ({ isDark, trialDaysLeft, isPremium }) => {
    const [user, setUser] = useState(null);
    const [aiEnabled, setAiEnabled] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const fileInputRef = useRef(null);
    const abortControllerRef = useRef(null);

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
                } else {
                    setAiEnabled(true);
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

    useEffect(() => {
        if (!aiEnabled) {
            setIsOpen(false);
            return;
        }

        if (!user || !isOpen) {
            return;
        }

        const uid = user.email || user.firebaseUID;
        fetch(`/api/chat?userId=${encodeURIComponent(uid)}`)
            .then(res => res.json())
            .then(data => {
                if (Array.isArray(data) && data.length > 0) {
                    const loaded = data.map(m => ({ text: m.text, isBot: m.role === 'bot' }));
                    setMessages(loaded);
                }
            })
            .catch(err => console.error("Error loading chat history:", err));
    }, [aiEnabled, user, isOpen]);

    const convertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    };

    const handleSend = async () => {
        if (!input.trim() || isSending) return;

        const userMessage = input.trim();
        setMessages(prev => [...prev, { text: userMessage, isBot: false }]);
        setInput("");
        setIsSending(true);

        // Show typing indicator
        setMessages(prev => [...prev, { text: "...", isBot: true, isTyping: true }]);

        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortControllerRef.current.signal,
                body: JSON.stringify({
                    message: userMessage,
                    userId: user?.email || user?.firebaseUID,
                    firebaseUID: user?.uid
                })
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error || "Chat request failed");

            // Remove typing indicator and add real response
            setMessages(prev => {
                const without = prev.filter(m => !m.isTyping);
                return [...without, {
                    text: data.text || "I could not generate a reply right now.",
                    isBot: true,
                    imageUrl: data.imageUrl || null,
                    dishName: data.dishName || null,
                }];
            });
        } catch (error) {
            if (error.name === 'AbortError') {
                toast.info("Response generation stopped.");
                setMessages(prev => prev.filter(m => !m.isTyping));
            } else {
                console.error("Chat Error:", error);
                setMessages(prev => {
                    const without = prev.filter(m => !m.isTyping);
                    return [...without, { text: "Connection error. Please try again.", isBot: true }];
                });
                toast.error("NutriBot could not reach the backend");
            }
        } finally {
            setIsSending(false);
            abortControllerRef.current = null;
        }
    };

    const stopGeneration = () => {
        if (abortControllerRef.current) {
            abortControllerRef.current.abort();
        }
    };

    const handleClearChat = async () => {
        if (!confirm("Clear this conversation?")) return;
        try {
            const uid = user?.email || user?.firebaseUID;
            if (!uid) return;
            const response = await fetch(`/api/chat?messageId=all&userId=${encodeURIComponent(uid)}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setMessages([]);
                toast.success("Conversation cleared.");
            }
        } catch (err) {
            toast.error("Error clearing conversation.");
        }
    };

    const handleFridgeVision = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setMessages(prev => [...prev, { text: "Uploading fridge photo...", isBot: false }]);
        setMessages(prev => [...prev, { text: "Analyzing with Vision AI...", isBot: true }]);

        try {
            const base64 = await convertToBase64(file);
            const response = await fetch('/api/ai-media/identify', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ imageBase64: base64 })
            });

            if (response.ok) {
                const data = await response.json();
                const ingredients = Array.isArray(data.ingredients) ? data.ingredients : [];
                const ingredientList = ingredients.length > 0 ? ingredients.join(", ") : "items";
                setMessages(prev => [...prev, {
                    text: `Analysis complete. I found: ${ingredientList}. ${data.suggestion || "Try building a simple balanced meal with these ingredients."}`,
                    isBot: true
                }]);
            } else {
                toast.error("Image analysis failed");
                setMessages(prev => [...prev, { text: "Failed to analyze image. Please try again.", isBot: true }]);
            }
        } catch (err) {
            console.error("Vision Error:", err);
            toast.error("Vision AI connection failed");
            setMessages(prev => [...prev, { text: "Error connecting to Vision AI.", isBot: true }]);
        } finally {
            e.target.value = "";
        }
    };

    if (!aiEnabled) return null;

    const userName = user?.displayName || user?.name || user?.email?.split('@')[0] || "there";

    return (
        <div className={`chatbot-container ${isDark ? "dark-mode" : ""}`}>
            <div
                className={`fab-ai ${isOpen ? "active" : ""}`}
                onClick={() => setIsOpen(!isOpen)}
                title={isOpen ? "Close AI" : "Ask NutriBot"}
                style={{
                    boxShadow: '0 8px 30px rgba(109,186,95,0.4)',
                    background: isOpen ? '#ef4444' : 'var(--primary-color)'
                }}
            >
                {isOpen ? <X size={24} /> : <Bot size={24} />}
            </div>

            {isOpen && (
                <div className="chatbot-window animate-pop-in" style={{
                    background: 'rgba(255,255,255,0.1)',
                    backdropFilter: 'blur(16px)',
                    WebkitBackdropFilter: 'blur(16px)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    boxShadow: '0 10px 40px rgba(0,0,0,0.15)',
                    borderRadius: '24px'
                }}>
                    <div className="chatbot-header" style={{ 
                        background: 'rgba(255,255,255,0.2)', 
                        borderBottom: '1px solid rgba(255,255,255,0.1)', 
                        color: 'var(--text-main)', 
                        display: 'flex', 
                        justifyContent: 'space-between', 
                        alignItems: 'center',
                        backdropFilter: 'blur(10px)'
                    }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <Bot size={20} color="var(--primary-color)" />
                            <span style={{ fontWeight: 'bold' }}>NutriBot</span>
                            {!isPremium && <span style={{ fontSize: '0.65em', background: 'var(--primary-color)', color: 'white', padding: '2px 8px', borderRadius: '12px' }}>{trialDaysLeft}d left</span>}
                        </div>
                        <div style={{ display: 'flex', gap: '10px' }}>
                            {user && <button onClick={handleClearChat} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer' }} title="Clear Chat"><Trash2 size={16} /></button>}
                            <button className="close-btn" style={{ color: 'var(--text-main)' }} onClick={() => setIsOpen(false)}><X size={18} /></button>
                        </div>
                    </div>
                    <div className="chatbot-messages" style={{ background: 'transparent' }}>
                        {messages.length === 0 && (
                            <div style={{ textAlign: 'center', marginTop: '30px', animation: 'popIn 0.5s' }}>
                                <Bot size={40} color="var(--primary-color)" style={{ margin: '0 auto', opacity: 0.8 }} />
                                <h3 style={{ marginTop: '10px', color: 'var(--text-main)' }}>Hi {userName}!</h3>
                                <p style={{ fontSize: '0.9rem', color: 'var(--text-muted)' }}>How can I help you eat better today?</p>
                            </div>
                        )}
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`message ${msg.isBot ? "bot-message" : "user-message"}`} style={{
                                background: msg.isBot ? 'rgba(255,255,255,0.6)' : 'linear-gradient(135deg, var(--primary-color), var(--primary-hover))',
                                backdropFilter: msg.isBot ? 'blur(10px)' : 'none',
                                border: msg.isBot ? '1px solid rgba(255,255,255,0.8)' : 'none',
                                color: msg.isBot ? 'var(--text-main)' : 'white',
                                borderRadius: msg.isBot ? '18px 18px 18px 4px' : '18px 18px 4px 18px',
                                boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                                animation: 'popIn 0.3s'
                            }}>
                                {msg.isTyping ? (
                                    <span style={{ letterSpacing: '2px', opacity: 0.6 }}>●●●</span>
                                ) : (
                                    <>
                                        <span style={{ whiteSpace: 'pre-wrap' }}>{msg.text}</span>
                                        {msg.imageUrl && (
                                            <div style={{ marginTop: '10px' }}>
                                                <img
                                                    src={msg.imageUrl}
                                                    alt={msg.dishName || 'Recipe'}
                                                    style={{ width: '100%', borderRadius: '12px', display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,0.1)' }}
                                                    onError={(e) => { e.target.style.display = 'none'; }}
                                                />
                                                {msg.dishName && (
                                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '6px', textAlign: 'center', fontWeight: '500' }}>🍽️ {msg.dishName}</p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="chatbot-input" style={{ background: 'rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '12px', display: 'flex', gap: '8px' }}>
                        {!user ? (
                            <div style={{ flex: 1, padding: '10px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', background: 'rgba(255,255,255,0.5)', borderRadius: '15px' }}>
                                Please <span style={{ color: 'var(--primary-color)', cursor: 'pointer', fontWeight: 'bold' }} onClick={() => window.dispatchEvent(new CustomEvent('navigate', { detail: 'login' }))}>Login</span> to chat with NutriBot.
                            </div>
                        ) : (
                            <>
                                <input
                                    type="file"
                                    accept="image/*"
                                    ref={fileInputRef}
                                    style={{ display: 'none' }}
                                    onChange={handleFridgeVision}
                                />
                                <button
                                    className="vision-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Upload a fridge photo"
                                    style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                                >
                                    <Camera size={18} />
                                </button>
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                    style={{ flex: 1, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '12px', padding: '10px', color: 'var(--text-main)', outline: 'none' }}
                                    disabled={isSending}
                                />
                                {isSending ? (
                                    <button onClick={stopGeneration} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', padding: '0 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <StopCircle size={16} /> Stop
                                    </button>
                                ) : (
                                    <button className="send-btn" onClick={handleSend} style={{ background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '12px', padding: '0 15px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>
                                        <Send size={16} /> Send
                                    </button>
                                )}
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chatbot;
