import React, { useState, useEffect, useRef } from 'react';
import { Bot, X, Send } from 'lucide-react';

type Message = { role: 'user' | 'assistant'; content: string };

export default function Chatbot() {
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  const role = 'candidate';
  const userId = 'resume_tools_user';

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  useEffect(() => {
    const historyKey = `neuro_history_${userId}_${role}`;
    const saved = localStorage.getItem(historyKey);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse chat history");
      }
    } else {
      setMessages([
        { 
          role: 'assistant', 
          content: "Hi! I'm Neuro, your AI assistant. I'm here to help you optimize your resume, prepare for interviews, and improve your ATS scores!" 
        }
      ]);
    }
  }, [userId, role]);

  useEffect(() => {
    if (messages.length > 0) {
      const historyKey = `neuro_history_${userId}_${role}`;
      localStorage.setItem(historyKey, JSON.stringify(messages));
    }
  }, [messages, userId, role]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const systemPrompt = "You are Neuro, an AI assistant for ELEVATR. You help candidates with resume optimization, ATS scores, and interview prep. Keep answers brief and encouraging.";

      const apiKey = import.meta.env.VITE_GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("Missing VITE_GROQ_API_KEY");
      }

      // Sanitize: Groq rejects messages with empty/null content
      const cleanMessages = [
        { role: 'system' as const, content: systemPrompt },
        ...messages.filter(m => m.content && m.content.trim()),
        userMessage
      ];

      const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'llama-3.1-8b-instant',
          messages: cleanMessages
        })
      });

      if (!response.ok) {
        const errBody = await response.json().catch(() => ({}));
        console.error('Groq error:', response.status, errBody);
        throw new Error(`Groq ${response.status}: ${(errBody as any)?.error?.message || 'Unknown error'}`);
      }
      
      const data = await response.json();
      const botResponse = data.choices[0]?.message?.content || "Sorry, I'm having trouble thinking right now.";
      
      setMessages(prev => [...prev, { role: 'assistant', content: botResponse }]);
    } catch (error) {
      console.error(error);
      setMessages(prev => [...prev, { role: 'assistant', content: "Sorry, I encountered an error. Please try again later." }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-[9999] flex flex-col items-end pointer-events-none [&>*]:pointer-events-auto">
      {isOpen && (
        <div className="w-[350px] h-[500px] bg-white/85 dark:bg-zinc-900/85 backdrop-blur-md border border-white/50 dark:border-white/10 rounded-3xl shadow-2xl mb-4 flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 duration-300">
          <div className="p-4 bg-gradient-to-br from-blue-600/10 to-cyan-400/5 border-b border-white/60 dark:border-white/10 flex justify-between items-center">
            <div className="flex items-center gap-2">
              <Bot size={20} className="text-blue-600 dark:text-blue-400" />
              <h3 className="m-0 text-[1.1rem] font-bold text-zinc-900 dark:text-zinc-100 flex items-center gap-2">
                Neuro 
                <span className="text-[0.7rem] px-2 py-0.5 bg-blue-600 text-white rounded-full uppercase">Candidate</span>
              </h3>
            </div>
            <button 
              className="p-1 rounded-full text-zinc-500 hover:bg-black/5 dark:hover:bg-white/10 hover:text-zinc-800 dark:hover:text-zinc-200 transition-colors"
              onClick={() => setIsOpen(false)}
            >
              <X size={18} />
            </button>
          </div>
          
          <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-4">
            {messages.map((msg, i) => (
              <div 
                key={i} 
                className={`max-w-[85%] px-4 py-3 rounded-2xl text-[0.95rem] leading-snug animate-in fade-in zoom-in-95 duration-300 ${
                  msg.role === 'user' 
                    ? 'self-end bg-blue-600 text-white rounded-br-sm shadow-md shadow-blue-600/20' 
                    : 'self-start bg-white dark:bg-zinc-800 text-zinc-800 dark:text-zinc-200 border border-black/5 dark:border-white/5 rounded-bl-sm shadow-sm'
                }`}
              >
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div className="self-start bg-white dark:bg-zinc-800 border border-black/5 dark:border-white/5 rounded-2xl rounded-bl-sm px-4 py-3 flex gap-1 items-center">
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-zinc-400 rounded-full animate-bounce"></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="p-4 bg-white dark:bg-zinc-900 border-t border-black/5 dark:border-white/5 flex gap-2" onSubmit={handleSend}>
            <input 
              type="text" 
              placeholder="Ask Neuro..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              className="flex-1 px-4 py-3 border border-black/10 dark:border-white/10 rounded-full text-[0.95rem] bg-zinc-50 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 focus:outline-none focus:border-blue-600 dark:focus:border-blue-500 transition-colors"
            />
            <button 
              type="submit" 
              disabled={!input.trim() || isLoading}
              className="w-[48px] h-[48px] rounded-full bg-blue-600 text-white flex items-center justify-center hover:bg-blue-700 disabled:bg-zinc-300 dark:disabled:bg-zinc-700 transition-all hover:scale-105 active:scale-95 disabled:hover:scale-100"
            >
              <Send size={18} />
            </button>
          </form>
        </div>
      )}
      
      {!isOpen && (
        <button 
          className="w-[60px] h-[60px] rounded-full bg-gradient-to-br from-blue-600 to-cyan-400 border-none text-white flex items-center justify-center shadow-lg shadow-blue-600/40 hover:scale-110 transition-transform duration-300"
          onClick={() => setIsOpen(true)}
        >
          <Bot size={28} />
        </button>
      )}
    </div>
  );
}
