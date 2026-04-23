'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/shared/auth-context';
import { Bot, X, Send } from 'lucide-react';
import './Chatbot.css';

type Message = { role: 'user' | 'assistant'; content: string };

export default function Chatbot() {
  const { user, role, loading } = useAuth();
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [contextData, setContextData] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Show once auth has resolved and user is logged in (null role is treated as candidate, matching AuthGuard logic)
  const resolvedRole = role ?? (user ? 'candidate' : null);
  const isVisible = !loading && !!user;

  // Debug: helps confirm auth state
  useEffect(() => {
    console.log('[Neuro] Auth state:', { loading, user: user?.email, role, resolvedRole });
  }, [loading, user, role, resolvedRole]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Handle Role changes / Context fetching
  useEffect(() => {
    if (!isVisible) return;

    // Load history scoped to user ID and role
    const historyKey = `neuro_history_${user.id}_${resolvedRole}`;
    const saved = localStorage.getItem(historyKey);
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse chat history");
      }
    } else {
      // First time greeting
      setMessages([
        { 
          role: 'assistant', 
          content: `Hi! I'm Neuro, your AI assistant. How can I help you with your ${resolvedRole === 'hr' ? 'hiring pipeline' : 'resume and applications'} today?` 
        }
      ]);
    }

    if (resolvedRole === 'candidate') {
      const fetchContext = async () => {
        try {
          const [appsRes, oppsRes] = await Promise.all([
            fetch('/api/applications'),
            fetch('/api/opportunities')
          ]);
          const appsData = appsRes.ok ? await appsRes.json() : null;
          const oppsData = oppsRes.ok ? await oppsRes.json() : null;
          setContextData({
            applications: appsData?.data?.applications || [],
            opportunities: oppsData?.data?.opportunities || [],
            name: user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'Candidate'
          });
        } catch (error) {
          console.error("Failed to fetch context", error);
        }
      };
      fetchContext();
    }
  }, [isVisible, user?.id, resolvedRole]);

  // Save history
  useEffect(() => {
    if (isVisible && messages.length > 0) {
      const historyKey = `neuro_history_${user!.id}_${resolvedRole}`;
      localStorage.setItem(historyKey, JSON.stringify(messages));
    }
  }, [messages, isVisible, user?.id, resolvedRole]);

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = { role: 'user', content: input };
    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      let systemPrompt = "You are Neuro, an AI assistant for ELEVATR.";
      
      if (resolvedRole === 'candidate') {
        const apps: any[] = contextData?.applications || [];
        const opps: any[] = contextData?.opportunities || [];
        const name = contextData?.name || 'the candidate';

        // Summarise applications
        const appSummary = apps.length === 0
          ? 'No applications submitted yet.'
          : apps.map(a => {
              const score = a.score != null ? `ATS Score: ${a.score}%` : 'ATS Score: not yet scored';
              const interviewScore = a.interview_score != null ? `, Interview Score: ${a.interview_score}%` : '';
              const interviewStatus = a.interview_completed ? ', Interview: Completed' : (a.interview_link ? ', Interview: Invited (pending)' : '');
              return `  - "${a.pipeline?.title || 'Unknown Pipeline'}": Status=${a.status}, ${score}${interviewScore}${interviewStatus}`;
            }).join('\n');

        // Summarise open opportunities not yet applied to
        const unapplied = opps.filter(o => !o.applied);
        const oppSummary = unapplied.length === 0
          ? 'No new open positions available right now.'
          : unapplied.slice(0, 5).map(o => `  - "${o.title}"${o.tags?.length ? ` [${o.tags.join(', ')}]` : ''}`).join('\n');

        systemPrompt += `
You are assisting ${name}, a candidate on the ELEVATR AI hiring platform.

You know this system inside-out:
- Candidates upload resumes and apply to JD-based pipelines from HR.
- Each resume is AI-screened and given an ATS Score (0-100). Above the HR-set threshold = shortlisted.
- Shortlisted candidates get an interview invite link for the AI Video Interviewer (runs at port 5001).
- After the interview, an AI evaluation report (PDF) is generated.
- Candidate journey: pending → screened → interview → selected/rejected.
- On ELEVATR at localhost:3000:
  - Dashboard is at /dashboard — shows all applications, scores, and interview status.
  - Apply to jobs at /apply — paste or upload a resume against an open pipeline.
  - Build a resume at /resume-builder.
  - Access Resume Tools (ATS Analyzer & CV Builder) at localhost:8080.

CANDIDATE'S CURRENT DATA:
Applications:
${appSummary}

Open Positions Not Yet Applied To:
${oppSummary}

Give concise, encouraging, ELEVATR-specific advice. Reference the candidate's actual scores and status when relevant. If they ask how to improve, reference their specific ATS score and suggest concrete steps.`;
      } else if (role === 'hr') {
        systemPrompt += `
You are the HR assistant for ELEVATR — a JD-driven AI hiring platform. You know exactly how this system works:

PIPELINE CREATION (the core workflow):
- HR clicks "+ New Pipeline" on the HR Dashboard (localhost:3000/hr).
- They fill in: Job Title (min 3 chars), Job Description / JD Text (min 20 chars), Tags (comma-separated, e.g. "python, aws, backend"), and a Min Score Threshold (0–100, default 70).
- The threshold determines which candidates are auto-shortlisted based on their AI ATS score.
- After creation, the pipeline appears as a card showing: Candidates, Avg Score, Shortlisted counts.
- Clicking the pipeline card opens the pipeline detail view where HR can review individual candidates.

CANDIDATE FLOW INSIDE A PIPELINE:
- Candidates apply by uploading resumes, which are AI-screened against the JD.
- Each application gets an ATS score and AI feedback.
- Candidates scoring above the threshold are shortlisted.
- Shortlisted candidates receive an auto-generated interview invite link.
- The AI Video Interviewer (Flask app on port 5001) conducts the session.
- After the session, a PDF evaluation report is generated and stored in Supabase under the 'reports' bucket.
- The HR dashboard shows each candidate's status: pending → screened → interview → selected/rejected.

ALL ROUND RECORDS TABLE:
- Shows: Candidate email, Pipeline name, Status, AI Interview Score (%), Stagewise Flow (1.Status Mail, 2.Interview Mail, 3.Interview Completed, 4.Report, 5.Final Mail), Last Update, and an "AI Eval" button.
- HR can click "AI Eval" to open a modal with the full AI interview transcript, score, and a download link for the PDF report.

TIPS:
- To change a candidate's threshold, they must edit the pipeline and update the threshold field.
- Tags help filter and organise pipelines; they are informational only.
- If an interview score is missing (shown as "--"), the candidate hasn't completed the interview yet.
- If the report PDF link is missing, the 'reports' Supabase bucket may not be set to public.

Give direct, concise, ELEVATR-specific answers. Always reference exact UI elements (button names, field names) when guiding HR.`;
      }

      const apiKey = process.env.NEXT_PUBLIC_GROQ_API_KEY;
      if (!apiKey) {
        throw new Error("Missing NEXT_PUBLIC_GROQ_API_KEY");
      }

      // Sanitize: Groq rejects any message with empty/null content
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
        throw new Error(`Groq ${response.status}: ${errBody?.error?.message || 'Unknown error'}`);
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

  if (!isVisible) return null;

  return (
    <div className="neuro-chatbot-container">
      {isOpen && (
        <div className="neuro-chat-window">
          <div className="neuro-header">
            <div className="neuro-header-info">
              <h3><Bot size={20} color="#0f4cff" /> Neuro <span className="neuro-role-badge">{resolvedRole}</span></h3>
            </div>
            <button className="neuro-close-btn" onClick={() => setIsOpen(false)}>
              <X size={18} />
            </button>
          </div>
          
          <div className="neuro-messages">
            {messages.map((msg, i) => (
              <div key={i} className={`neuro-msg ${msg.role}`}>
                {msg.content}
              </div>
            ))}
            {isLoading && (
              <div className="neuro-msg assistant neuro-typing">
                <div className="neuro-dot"></div>
                <div className="neuro-dot"></div>
                <div className="neuro-dot"></div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          <form className="neuro-input-area" onSubmit={handleSend}>
            <input 
              type="text" 
              placeholder="Ask Neuro..." 
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={isLoading}
              style={{ color: '#1a1a1a', caretColor: '#1a1a1a' }}
            />
            <button type="submit" className="neuro-send-btn" disabled={!input.trim() || isLoading}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
      
      {!isOpen && (
        <button className="neuro-toggle-btn" onClick={() => setIsOpen(true)}>
          <Bot size={28} />
        </button>
      )}
    </div>
  );
}
