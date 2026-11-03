'use client';

import { useEffect, useRef, useState } from 'react';
import { Bot, Send, X } from 'lucide-react';
import { useAuth } from '@/shared/auth-context';
import { fetchJson } from '@/shared/components/ui';
import './Chatbot.css';

type Message = { role: 'user' | 'assistant'; content: string };

const MAX_HISTORY_SENT = 20;

function readHistory(key: string): Message[] | null {
  try {
    const saved = window.localStorage.getItem(key);
    const parsed = saved ? JSON.parse(saved) : null;
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export default function Chatbot() {
  const { user, role, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const visible = !loading && !!user;
  const historyKey = user ? `neuro_history_${user.id}` : '';

  useEffect(() => {
    if (!historyKey) return;
    setMessages(
      readHistory(historyKey) ?? [
        {
          role: 'assistant',
          content: `Hi! I'm Neuro, your AI assistant. How can I help with your ${role === 'hr' ? 'hiring pipelines' : 'resume and applications'} today?`
        }
      ]
    );
  }, [historyKey, role]);

  useEffect(() => {
    if (!historyKey || messages.length === 0) return;
    try {
      window.localStorage.setItem(historyKey, JSON.stringify(messages.slice(-50)));
    } catch {
      // Storage can be full or blocked. History is a convenience, so carry on without it.
    }
  }, [messages, historyKey]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, sending, isOpen]);

  const send = async (event: React.FormEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || sending) return;

    const next: Message[] = [...messages, { role: 'user', content: text }];
    setMessages(next);
    setInput('');
    setSending(true);

    try {
      const data = await fetchJson<{ reply: string }>('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: next.slice(-MAX_HISTORY_SENT) })
      });
      setMessages((current) => [...current, { role: 'assistant', content: data.reply }]);
    } catch (err) {
      setMessages((current) => [
        ...current,
        { role: 'assistant', content: err instanceof Error ? err.message : 'Sorry, something went wrong. Please try again.' }
      ]);
    } finally {
      setSending(false);
    }
  };

  if (!visible) return null;

  if (!isOpen) {
    return (
      <div className="neuro">
        <button type="button" className="neuro-toggle" onClick={() => setIsOpen(true)} aria-label="Open Neuro assistant">
          <Bot size={26} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="neuro">
      <section className="neuro-window" aria-label="Neuro assistant">
        <header className="neuro-header">
          <h3><Bot size={18} aria-hidden="true" /> Neuro</h3>
          <button type="button" className="modal-close" onClick={() => setIsOpen(false)} aria-label="Close assistant">
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="neuro-messages" aria-live="polite">
          {messages.map((message, index) => (
            <div key={index} className={`neuro-msg neuro-msg-${message.role}`}>{message.content}</div>
          ))}
          {sending && (
            <div className="neuro-msg neuro-msg-assistant neuro-typing" aria-label="Neuro is typing">
              <span /><span /><span />
            </div>
          )}
          <div ref={endRef} />
        </div>

        <form className="neuro-input" onSubmit={send}>
          <input type="text" aria-label="Message Neuro" placeholder="Ask Neuro..." value={input} onChange={(e) => setInput(e.target.value)} maxLength={4000} disabled={sending} />
          <button type="submit" className="btn" aria-label="Send message" disabled={!input.trim() || sending}>
            <Send size={15} aria-hidden="true" />
          </button>
        </form>
      </section>
    </div>
  );
}
