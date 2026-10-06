"use client";
import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { auth } from "@/lib/firebaseConfig";
import { onAuthStateChanged } from "firebase/auth";
import { Bot, Send, Trash2, Edit2, Check, X, Camera } from "lucide-react";
import { toast } from "sonner";
import "@/styles/Chatbot.css"; // We can reuse styles if needed, or inline

export default function ChatPage() {
    const router = useRouter();
    const [user, setUser] = useState(null);
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState("");
    const [isSending, setIsSending] = useState(false);
    const [editingId, setEditingId] = useState(null);
    const [editContent, setEditContent] = useState("");
    const [selectedModel, setSelectedModel] = useState("gemini-2.5-flash"); // Default stable model
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

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
        
        // Add optimistic user message and typing indicator
        setMessages(prev => [
            ...prev, 
            { _id: tempId, role: "user", text: userMessage },
            { _id: "typing", role: "bot", text: "...", isTyping: true }
        ]);
        setInput("");
        setIsSending(true);

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: userMessage,
                    userId: user.email || user.uid,
                    firebaseUID: user.uid,
                    modelId: selectedModel
                })
            });
            
            const data = await response.json();
            
            // Reload history to get the actual database IDs and images
            await loadHistory(user);
            
            if (!response.ok) {
                toast.error(data.error || "High demand on AI servers right now. Please try again.");
            }
        } catch (error) {
            console.error("Chat Error:", error);
            toast.error("Connection error to backend");
            setMessages(prev => prev.filter(m => m._id !== "typing"));
        } finally {
            setIsSending(false);
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

    return (
        <div style={{ maxWidth: '900px', margin: '0 auto', padding: '20px', height: 'calc(100vh - 80px)', display: 'flex', flexDirection: 'column' }}>
            <div style={{ padding: '20px', background: 'var(--bg-card)', borderRadius: '12px 12px 0 0', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <Bot size={28} color="var(--primary-color)" />
                    <h1 style={{ fontSize: '1.5rem', margin: 0 }}>NutriBot Assistant</h1>
                </div>
                <div>
                    <select 
                        value={selectedModel}
                        onChange={(e) => setSelectedModel(e.target.value)}
                        style={{ padding: '8px 12px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)', cursor: 'pointer', outline: 'none' }}
                        title="Select an AI Model"
                    >
                        <option value="gemini-2.5-flash">Gemini 2.5 Flash (Stable)</option>
                        <option value="gemini-3.5-flash">Gemini 3.5 Flash (Fast)</option>
                        <option value="gemini-3.5-flash-lite">Gemini 3.5 Flash Lite (Lightweight)</option>
                        <option value="gemini-3.8-flash">Gemini 3.8 Flash (Latest, may have queues)</option>
                    </select>
                </div>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', padding: '20px', background: 'var(--bg-main)', borderLeft: '1px solid var(--border)', borderRight: '1px solid var(--border)' }}>
                {messages.length === 0 && (
                    <div style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '40px' }}>
                        <p>No chat history yet. Say hi to NutriBot!</p>
                    </div>
                )}
                {messages.map((msg, idx) => (
                    <div key={msg._id || idx} style={{ 
                        display: 'flex', 
                        flexDirection: 'column',
                        alignItems: msg.role === 'user' ? 'flex-end' : 'flex-start',
                        marginBottom: '20px'
                    }}>
                        <div style={{ 
                            maxWidth: '75%', 
                            padding: '12px 16px', 
                            borderRadius: '12px',
                            background: msg.role === 'user' ? 'var(--primary-color)' : 'var(--bg-card)',
                            color: msg.role === 'user' ? '#fff' : 'var(--text-main)',
                            boxShadow: 'var(--shadow-sm)',
                            position: 'relative',
                            group: 'true'
                        }} className="chat-bubble-group">
                            
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
                                        <span style={{ whiteSpace: 'pre-wrap', lineHeight: '1.5' }}>{msg.text}</span>
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

            <div style={{ padding: '15px 20px', background: 'var(--bg-card)', borderRadius: '0 0 12px 12px', border: '1px solid var(--border)', borderTop: 'none', display: 'flex', gap: '10px' }}>
                <input
                    type="text"
                    placeholder="Ask for recipes, meal plans, or nutrition advice..."
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && handleSend()}
                    style={{ flex: 1, padding: '12px 16px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--bg-main)', color: 'var(--text-main)' }}
                    disabled={isSending}
                />
                <button 
                    onClick={handleSend} 
                    disabled={isSending}
                    style={{ padding: '0 20px', background: 'var(--primary-color)', color: 'white', border: 'none', borderRadius: '8px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 'bold' }}
                >
                    <Send size={18} /> {isSending ? "Thinking..." : "Send"}
                </button>
            </div>
        </div>
    );
}
