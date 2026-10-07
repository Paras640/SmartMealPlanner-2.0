"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { Bot, Send, Trash2, Edit2, Check, X, Camera, StopCircle, RefreshCw, ChevronDown, Cpu } from "lucide-react";
import { toast } from "sonner";
import "@/styles/Chatbot.css"; 

const CHAT_MODELS = [
    { id: "openai/gpt-oss-120b", name: "GPT-OSS 120B", description: "Powerful and detailed" },
    { id: "openai/gpt-oss-20b", name: "GPT-OSS 20B", description: "Fast and balanced" },
    { id: "qwen/qwen3.8-27b", name: "Qwen 3.8 27B", description: "Lightweight" },
];

export default function ChatPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editContent, setEditContent] = useState("");
    const [selectedModel, setSelectedModel] = useState("openai/gpt-oss-120b");
    const [isModelPickerOpen, setIsModelPickerOpen] = useState(false);
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);
    const abortControllerRef = useRef(null);
    const modelPickerRef = useRef(null);
    const modelPickerTriggerRef = useRef(null);

    useEffect(() => {
        if (!isModelPickerOpen) return;

        const handlePointerDown = (event) => {
            if (!modelPickerRef.current?.contains(event.target)) {
                setIsModelPickerOpen(false);
            }
        };
        const handleKeyDown = (event) => {
            if (event.key === "Escape") {
                setIsModelPickerOpen(false);
                modelPickerTriggerRef.current?.focus();
            }
        };

        document.addEventListener("pointerdown", handlePointerDown);
        document.addEventListener("keydown", handleKeyDown);
        return () => {
            document.removeEventListener("pointerdown", handlePointerDown);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, [isModelPickerOpen]);

    useEffect(() => {
        const unsub = onAuthStateChanged(auth, (firebaseUser) => {
            if (!firebaseUser) {
                router.push('/login');
                return;
            }
            setUser(firebaseUser);
            loadHistory(firebaseUser);
        });
        return () => unsub();
    }, [router]);

    const loadHistory = async (firebaseUser) => {
        try {
            const uid = firebaseUser.email || firebaseUser.uid;
            const res = await fetch(`/api/chat?userId=${encodeURIComponent(uid)}`);
            const data = await res.json();
            if (Array.isArray(data)) {
                setMessages(data);
            }
        } catch (err) {
            console.error("Failed to load chat history:", err);
            toast.error("Could not load history");
        }
    };

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages]);

    const handleSend = async () => {
        if (!input.trim() || isSending) return;

        const userMessage = input.trim();
        const tempId = Date.now().toString();
        
        setMessages(prev => [
            ...prev, 
            { _id: tempId, role: "user", text: userMessage },
            { _id: "typing", role: "bot", text: "...", isTyping: true }
        ]);
        setInput("");
        setIsSending(true);

        abortControllerRef.current = new AbortController();

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                signal: abortControllerRef.current.signal,
                body: JSON.stringify({
                    message: userMessage,
                    userId: user.email || user.uid,
                    firebaseUID: user.uid,
                    modelId: selectedModel
                })
            });
            
            const data = await response.json();
            await loadHistory(user);

            if (!response.ok) {
                toast.error(data.error || "High demand on AI servers right now.");
            }
        } catch (error) {
            if (error.name === 'AbortError') {
                toast.info("Response generation stopped.");
                await loadHistory(user); // Reload without the typing indicator
            } else {
                console.error("Chat Error:", error);
                toast.error("Connection error to backend");
                setMessages(prev => prev.filter(m => m._id !== "typing"));
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
        if (!confirm("Are you sure you want to clear the entire conversation history? This cannot be undone.")) return;
        try {
            const response = await fetch(`/api/chat?messageId=all&userId=${encodeURIComponent(user.email || user.uid)}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setMessages([]);
                toast.success("Conversation cleared.");
            } else {
                toast.error("Failed to clear conversation.");
            }
        } catch (err) {
            toast.error("Error clearing conversation.");
        }
    };

    const convertToBase64 = (file) => {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.readAsDataURL(file);
            reader.onload = () => resolve(reader.result);
            reader.onerror = error => reject(error);
        });
    };

    const handleImageUpload = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setMessages(prev => [...prev, { _id: Date.now().toString(), role: "user", text: "📷 Uploaded an image for analysis" }]);
        setMessages(prev => [...prev, { _id: "typing", role: "bot", text: "Analyzing image...", isTyping: true }]);
        setIsSending(true);

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
                
                // Immediately ask the chatbot to use these ingredients to suggest a recipe
                const followUpPrompt = `I uploaded an image of my ingredients and you identified: ${ingredientList}. Please suggest a recipe I can make with these!`;
                
                setInput(followUpPrompt);
                toast.success("Image analyzed! Sending to NutriBot...");
                
                // We fake-type the prompt and let the user send it, or send it automatically:
                setTimeout(() => {
                    document.getElementById('chat-send-btn')?.click();
                }, 500);

            } else {
                toast.error("Image analysis failed");
            }
            setMessages(prev => prev.filter(m => m._id !== "typing"));
        } catch (err) {
            console.error("Vision Error:", err);
            toast.error("Vision AI connection failed");
            setMessages(prev => prev.filter(m => m._id !== "typing"));
        } finally {
            setIsSending(false);
            e.target.value = "";
        }
    };

    const handleDelete = async (messageId) => {
        if (!confirm("Delete this message?")) return;
        
        try {
            const response = await fetch(`/api/chat?messageId=${messageId}&userId=${user.email || user.uid}`, {
                method: 'DELETE'
            });
            if (response.ok) {
                setMessages(prev => prev.filter(m => m._id !== messageId));
                toast.success("Message deleted");
            } else {
                toast.error("Failed to delete message");
            }
        } catch (err) {
            toast.error("Error deleting message");
        }
    };

    const startEditing = (msg) => {
        setEditingId(msg._id);
        setEditContent(msg.text);
    };

    const saveEdit = async (messageId) => {
        if (!editContent.trim()) return;
        try {
            const response = await fetch('/api/chat', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    messageId,
                    newText: editContent,
                    userId: user.email || user.uid
                })
            });
            if (response.ok) {
                setMessages(prev => prev.map(m => m._id === messageId ? { ...m, text: editContent } : m));
                setEditingId(null);
                toast.success("Message updated");
            } else {
                toast.error("Failed to update message");
            }
        } catch (err) {
            toast.error("Error updating message");
        }
    };

    if (!user) return <div style={{ padding: '40px', textAlign: 'center' }}>Loading...</div>;

    const userName = user.displayName || user.name || user.email?.split('@')[0] || "there";
    const activeModel = CHAT_MODELS.find((model) => model.id === selectedModel) || CHAT_MODELS[0];

    return (
        <div className="chat-page" style={{
            maxWidth: '950px', 
            margin: '0 auto', 
            padding: '20px', 
            height: 'calc(100vh - 80px)', 
            display: 'flex', 
            flexDirection: 'column',
            fontFamily: 'var(--font-sans)',
        }}>
            {/* GLASSMORPHISM HEADER */}
            <div style={{ 
                padding: '16px 24px', 
                background: 'rgba(255, 255, 255, 0.1)', 
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '16px 16px 0 0', 
                border: '1px solid rgba(255,255,255,0.2)', 
                borderBottom: 'none',
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'space-between', 
                flexWrap: 'wrap', 
                gap: '10px',
                boxShadow: '0 4px 30px rgba(0, 0, 0, 0.1)',
                zIndex: 10
            }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                    <div style={{ background: 'var(--primary-color)', padding: '8px', borderRadius: '12px', color: 'white', display: 'flex', boxShadow: '0 4px 10px rgba(109,186,95,0.3)' }}>
                        <Bot size={24} />
                    </div>
                    <div>
                        <h1 style={{ fontSize: '1.3rem', margin: 0, fontWeight: '700' }}>NutriBot</h1>
                        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--text-muted)' }}>Always here to help you eat better</p>
                    </div>
                </div>
                <div className="chat-page-header-actions">
                    <div className="model-picker" ref={modelPickerRef}>
                        <button
                            ref={modelPickerTriggerRef}
                            type="button"
                            className="model-picker-trigger"
                            aria-haspopup="menu"
                            aria-expanded={isModelPickerOpen}
                            aria-label={`AI model: ${activeModel.name}`}
                            onClick={() => setIsModelPickerOpen((open) => !open)}
                        >
                            <span className="model-picker-icon"><Cpu size={17} /></span>
                            <span className="model-picker-current">
                                <span className="model-picker-label">AI MODEL</span>
                                <span className="model-picker-name">{activeModel.name}</span>
                            </span>
                            <ChevronDown className="model-picker-chevron" size={16} />
                        </button>
                        {isModelPickerOpen && (
                            <div className="model-picker-menu" role="menu" aria-label="Select an AI model">
                                {CHAT_MODELS.map((model) => (
                                    <button
                                        key={model.id}
                                        type="button"
                                        role="menuitemradio"
                                        aria-checked={selectedModel === model.id}
                                        className={`model-picker-option${selectedModel === model.id ? " is-selected" : ""}`}
                                        onClick={() => {
                                            setSelectedModel(model.id);
                                            setIsModelPickerOpen(false);
                                        }}
                                    >
                                        <span className="model-picker-option-copy">
                                            <span className="model-picker-option-name">{model.name}</span>
                                            <span className="model-picker-option-description">{model.description}</span>
                                        </span>
                                        {selectedModel === model.id && <Check size={17} aria-hidden="true" />}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                    
                    <button 
                        onClick={handleClearChat}
                        style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.2)', padding: '8px 12px', borderRadius: '10px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: '500', transition: 'all 0.2s' }}
                        title="Clear Conversation"
                    >
                        <Trash2 size={16} /> Clear
                    </button>
                </div>
            </div>
            
            {/* GLASSMORPHISM CHAT AREA */}
            <div style={{ 
                flex: 1, 
                overflowY: 'auto', 
                padding: '24px', 
                background: 'rgba(255,255,255,0.05)', 
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderLeft: '1px solid rgba(255,255,255,0.2)', 
                borderRight: '1px solid rgba(255,255,255,0.2)', 
                boxShadow: 'inset 0 0 20px rgba(0,0,0,0.02)'
            }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', marginTop: '60px', animation: 'popIn 0.5s cubic-bezier(0.175, 0.885, 0.32, 1.275)' }}>
                        <div style={{ background: 'var(--primary-color)', width: '80px', height: '80px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', color: 'white', boxShadow: '0 8px 24px rgba(109,186,95,0.4)' }}>
                            <Bot size={40} />
                        </div>
                        <h2 style={{ fontSize: '1.8rem', color: 'var(--text-main)', marginBottom: '10px' }}>Hi {userName}! 👋</h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '1.1rem', maxWidth: '400px', margin: '0 auto' }}>I'm NutriBot. I can generate recipes, create meal plans, and even give you a picture of what we're cooking!</p>
                        <div style={{ display: 'flex', justifyContent: 'center', gap: '10px', marginTop: '20px', flexWrap: 'wrap' }}>
                            <span style={{ background: 'rgba(109,186,95,0.1)', color: 'var(--primary-color)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem' }}>"Make a high protein breakfast"</span>
                            <span style={{ background: 'rgba(109,186,95,0.1)', color: 'var(--primary-color)', padding: '6px 12px', borderRadius: '20px', fontSize: '0.85rem' }}>"Recipe for chicken alfredo"</span>
                        </div>
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div key={msg._id || idx} style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        marginBottom: '20px'
                    }}>
                        <div className={`chat-page-message chat-bubble-group ${msg.role === 'user' ? 'chat-page-message-user' : 'chat-page-message-bot'}`} style={{
                            maxWidth: '78%', 
                            padding: '14px 18px', 
                            borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '20px 20px 20px 4px',
                            boxShadow: '0 4px 15px rgba(0,0,0,0.05)',
                            position: 'relative',
                            animation: 'popIn 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
                            transformOrigin: msg.role === 'user' ? 'bottom right' : 'bottom left',
                        }}>
                            
                            {editingId === msg._id ? (
                                <div>
                                    <textarea 
                                        value={editContent} 
                                        onChange={(e) => setEditContent(e.target.value)}
                                        style={{ width: '100%', minHeight: '60px', padding: '8px', borderRadius: '4px', border: '1px solid #ccc', color: '#000' }}
                                    />
                                    <div style={{ display: 'flex', gap: '10px', marginTop: '10px', justifyContent: 'flex-end' }}>
                                        <button onClick={() => setEditingId(null)} style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}><X size={14}/></button>
                                        <button onClick={() => saveEdit(msg._id)} style={{ background: '#10b981', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '4px', cursor: 'pointer' }}><Check size={14}/></button>
                                    </div>
                                </div>
                            ) : (
                                <>
                                    {msg.isTyping ? (
                                        <span style={{ letterSpacing: '2px', opacity: 0.8 }}>●●●</span>
                                    ) : (
                                        <>
                                            <span style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{msg.text}</span>
                                            {msg.imageUrl && (
                                                <div style={{ marginTop: '12px', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                                                    <img 
                                                        src={msg.imageUrl} 
                                                        alt={msg.dishName || "Generated recipe image"} 
                                                        style={{ width: '100%', maxWidth: '350px', borderRadius: '8px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }} 
                                                        onError={(e) => { e.target.style.display = 'none'; }}
                                                    />
                                                    {msg.dishName && <span style={{ fontSize: '0.85rem', marginTop: '6px', opacity: 0.7 }}>🍽️ {msg.dishName}</span>}
                                                </div>
                                            )}
                                        </>
                                    )}
                                    
                                    {/* Action buttons on hover for user messages */}
                                    {msg.role === 'user' && !msg.isTyping && (
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-end', opacity: 0.8 }}>
                                            <button onClick={() => startEditing(msg)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }} title="Edit"><Edit2 size={14} /></button>
                                            <button onClick={() => handleDelete(msg._id)} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }} title="Delete"><Trash2 size={14} /></button>
                                        </div>
                                    )}
                                    
                                    {/* Delete for bot messages */}
                                    {msg.role === 'bot' && !msg.isTyping && (
                                        <div style={{ display: 'flex', gap: '8px', marginTop: '8px', justifyContent: 'flex-start', opacity: 0.5 }}>
                                            <button onClick={() => handleDelete(msg._id)} style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer' }} title="Delete"><Trash2 size={14} /></button>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                ))}
                <div ref={messagesEndRef} />
            </div>

            {/* GLASSMORPHISM INPUT AREA */}
            <div style={{ 
                padding: '20px', 
                background: 'rgba(255, 255, 255, 0.1)', 
                backdropFilter: 'blur(12px)',
                WebkitBackdropFilter: 'blur(12px)',
                borderRadius: '0 0 16px 16px', 
                border: '1px solid rgba(255,255,255,0.2)', 
                borderTop: 'none',
                display: 'flex', 
                gap: '12px',
                boxShadow: '0 -4px 30px rgba(0, 0, 0, 0.05)',
                zIndex: 10
            }}>
                <input
                    type="file"
                    accept="image/*"
                    ref={fileInputRef}
                    style={{ display: 'none' }}
                    onChange={handleImageUpload}
                />
                <button 
                    onClick={() => fileInputRef.current?.click()}
                    title="Upload ingredients photo"
                    style={{ background: 'rgba(59, 130, 246, 0.1)', color: '#3b82f6', border: '1px solid rgba(59,130,246,0.3)', borderRadius: '12px', width: '50px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'all 0.2s' }}
                >
                    <Camera size={20} />
                </button>
                <input
                    type="text"
                    placeholder="Ask for recipes, meal plans, or upload ingredients..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    style={{ flex: 1, padding: '14px 20px', borderRadius: '12px', border: '1px solid rgba(0,0,0,0.1)', background: 'rgba(255,255,255,0.5)', color: 'var(--text-main)', fontSize: '1rem', outline: 'none', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}
                    disabled={isSending}
                />
                
                {isSending ? (
                    <button 
                        onClick={stopGeneration}
                        style={{ padding: '0 24px', background: '#ef4444', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(239,68,68,0.3)', transition: 'all 0.2s' }}
                    >
                        <StopCircle size={20} /> Stop
                    </button>
                ) : (
                    <button 
                        id="chat-send-btn"
                        onClick={handleSend} 
                        style={{ padding: '0 24px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold', boxShadow: '0 4px 10px rgba(109,186,95,0.3)', transition: 'all 0.2s' }}
                    >
                        <Send size={20} /> Send
                    </button>
                )}
            </div>
        </div>
    );
}
