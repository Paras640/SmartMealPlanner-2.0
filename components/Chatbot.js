"use client"
import React, { useState, useEffect, useRef } from "react";
import { Bot, Camera, Send, X, StopCircle, Trash2 } from "lucide-react";
import { toast } from "sonner";
import "@/styles/Chatbot.css";
import { auth } from "@/lib/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { prepareChatImage } from "@/lib/prepareChatImage";

const Chatbot = ({ isDark, trialDaysLeft, isPremium }) => {
    const [user, setUser] = useState(null);
    const [aiEnabled, setAiEnabled] = useState(true);
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [attachedImage, setAttachedImage] = useState(null);
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
                    const enabled = profile.isAIEnabled !== false;
                    setAiEnabled(enabled);
                    if (!enabled) setIsOpen(false);
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
        if (!aiEnabled || !user || !isOpen) {
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

    const handleSend = async () => {
        if ((!input.trim() && !attachedImage) || isSending) return;

        const imageData = attachedImage;
        const userMessage = input.trim() || "Please describe this image and identify any food or ingredients relevant to nutrition.";
        setMessages(prev => [...prev, { text: userMessage, isBot: false, imageUrl: imageData }]);
        setInput("");
        setAttachedImage(null);
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
                    firebaseUID: user?.uid,
                    imageData
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
                toast.error(error.message || "NutriBot could not reach the backend");
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

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        try {
            setAttachedImage(await prepareChatImage(file));
            toast.success("Image attached. Add a question and send it to NutriBot.");
        } catch (err) {
            console.error("Image attachment error:", err);
            toast.error(err.message || "Could not attach this image.");
        } finally {
            e.target.value = "";
        }
    };

    const handlePasteImage = async (event) => {
        const item = Array.from(event.clipboardData?.items || []).find((entry) => entry.type.startsWith("image/"));
        const file = item?.getAsFile();
        if (!file) return;
        event.preventDefault();
        try {
            setAttachedImage(await prepareChatImage(file));
            toast.success("Pasted image attached. Add a question and send it to NutriBot.");
        } catch (err) {
            console.error("Pasted image attachment error:", err);
            toast.error(err.message || "Could not attach this image.");
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
                                background: msg.isBot
                                    ? 'var(--bg-hover)'
                                    : 'linear-gradient(135deg, var(--primary-color), var(--primary-hover))',
                                backdropFilter: msg.isBot ? 'blur(10px)' : 'none',
                                border: msg.isBot
                                    ? '1px solid var(--border)'
                                    : 'none',
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
                    <div className="chatbot-input" style={{ background: 'rgba(255,255,255,0.2)', borderTop: '1px solid rgba(255,255,255,0.1)', padding: '12px', display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                        {attachedImage && (
                            <div style={{ flexBasis: '100%', display: 'flex', alignItems: 'center', gap: '8px' }}>
                                <img src={attachedImage} alt="Image attached for analysis" style={{ width: '52px', height: '52px', objectFit: 'cover', borderRadius: '8px' }} />
                                <span style={{ color: 'var(--text-main)', flex: 1, fontSize: '0.8rem' }}>Image ready. Add a question or send it for analysis.</span>
                                <button type="button" onClick={() => setAttachedImage(null)} aria-label="Remove attached image" style={{ border: 0, background: 'transparent', color: 'var(--text-main)', cursor: 'pointer' }}><X size={16} /></button>
                            </div>
                        )}
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
                                    onChange={handleImageUpload}
                                />
                                <button
                                    className="vision-btn"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Upload an image"
                                    style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px', width: '40px', height: '40px', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center' }}
                                >
                                    <Camera size={18} />
                                </button>
                                <input
                                    type="text"
                                    placeholder="Type a question or paste an image..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                                    onPaste={handlePasteImage}
                                    style={{ flex: 1, background: 'rgba(255,255,255,0.5)', border: '1px solid rgba(255,255,255,0.5)', borderRadius: '12px', padding: '10px', color: 'var(--text-main)', outline: 'none' }}
                                    disabled={isSending}
                                />
                                {isSending ? (
                                    <button onClick={stopGeneration} style={{ background: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', padding: '0 15px', minWidth: '90px', whiteSpace: 'nowrap', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
                                        <StopCircle size={16} /> Stop
                                    </button>
                                ) : (
                                    <button className="send-btn" onClick={handleSend} style={{ background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '12px', padding: '0 15px', minWidth: '90px', whiteSpace: 'nowrap', cursor: 'pointer', display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px' }}>
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
