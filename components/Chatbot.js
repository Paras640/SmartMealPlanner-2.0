"use client"
import React, { useState, useEffect, useRef } from "react";
import { Bot, Camera, Send, X } from "lucide-react";
import { toast } from "sonner";
import "@/styles/Chatbot.css";
import { auth } from "@/lib/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";

const Chatbot = ({ isDark, trialDaysLeft, isPremium }) => {
    const [user, setUser] = useState(null);
    const [aiEnabled, setAiEnabled] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { text: "Hi! I'm NutriBot. Your personal nutrition assistant. What can I help you cook or plan today?", isBot: true }
    ]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const fileInputRef = useRef(null);

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

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
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
            console.error("Chat Error:", error);
            setMessages(prev => {
                const without = prev.filter(m => !m.isTyping);
                return [...without, { text: "Connection error. Please try again.", isBot: true }];
            });
            toast.error("NutriBot could not reach the backend");
        } finally {
            setIsSending(false);
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

    return (
        <div className={`chatbot-container ${isDark ? "dark-mode" : ""}`}>
            <div
                className={`fab-ai ${isOpen ? "active" : ""}`}
                onClick={() => setIsOpen(!isOpen)}
                title={isOpen ? "Close AI" : "Ask NutriBot"}
            >
                {isOpen ? <X size={24} /> : <Bot size={24} />}
            </div>

            {isOpen && (
                <div className="chatbot-window animate-pop-in">
                    <div className="chatbot-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <div>
                            <span>NutriBot</span>
                            {!isPremium && <span style={{ fontSize: '0.7em', background: 'var(--accent)', color: 'white', padding: '2px 6px', borderRadius: '10px', marginLeft: '8px' }}>{trialDaysLeft} Days Trial</span>}
                        </div>
                        <button className="close-btn" onClick={() => setIsOpen(false)}><X size={16} /></button>
                    </div>
                    <div className="chatbot-messages">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`message ${msg.isBot ? "bot-message" : "user-message"}`}>
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
                                                    style={{ width: '100%', borderRadius: '10px', display: 'block', boxShadow: '0 2px 12px rgba(0,0,0,0.15)' }}
                                                />
                                                {msg.dishName && (
                                                    <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '4px', textAlign: 'center' }}>🍽️ {msg.dishName}</p>
                                                )}
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="chatbot-input" style={{ display: 'flex', gap: '8px', padding: '10px' }}>
                        {!user ? (
                            <div style={{ flex: 1, padding: '10px', fontSize: '0.85rem', color: 'var(--text-muted)', textAlign: 'center', background: 'var(--bg-secondary)', borderRadius: '15px' }}>
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
                                    style={{ background: '#3b82f6', color: 'white', border: 'none', borderRadius: '50%', width: '40px', height: '40px', cursor: 'pointer', fontSize: '1.2rem', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                                >
                                    <Camera size={18} />
                                </button>
                                <input
                                    type="text"
                                    placeholder="Type a message..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                    style={{ flex: 1 }}
                                    disabled={isSending}
                                />
                                <button className="send-btn" onClick={handleSend} disabled={isSending}>
                                    <Send size={16} /> {isSending ? "Sending" : "Send"}
                                </button>
                            </>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};

export default Chatbot;
