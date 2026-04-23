# ELEVATR — AI Hiring Platform

> Unified AI-powered platform for resume analysis, resume building, JD-driven pipeline creation, secure video interviews, and generated HR/candidate reports.

**Team:** Ayush Mayekar · Aaryan Gole · Dnyanesh Panchal · Vaibhav Narute · Tejashree Karekar · Charmi Jani — VCET  
**Core stack:** Next.js · Vite/React · FastAPI · Flask · TypeScript · Python · Supabase · Google Gemini

## What ELEVATR Does

ELEVATR connects candidate tools, HR workflows, interview automation, and PDF reporting into one system.

| Module | Purpose | Main Stack |
|---|---|---|
| Candidate portal | View opportunities, apply to roles, track status, and open interview links | Next.js App Router, React, Supabase, TypeScript |
| HR dashboard | Create and manage job pipelines, review candidates, send interview invitations, and view analytics | Next.js App Router, Supabase, TypeScript, server API routes |
| Resume analysis | Parse resumes, compare against JDs, score matches, surface skill gaps, and generate feedback | Vite/React, FastAPI, Gemini, PyMuPDF, PyPDF2, spaCy, scikit-learn |
| Resume builder | Build/export CVs from templates and candidate data | Vite/React, Python backend, Jinja2, reportlab, fpdf2, LaTeX templates |
| Job pipeline creation | Create JD-based pipelines, shortlist candidates, and feed interview scheduling | Next.js API routes, Supabase tables, Zod validation |
| Video interview | Run secure invite-based AI interviews with speech input/output | Flask, Gradio client, gTTS, speech_recognition, FFmpeg, Gemini |
| Reports | Generate HR and candidate-safe PDFs for resume analysis, interview results, and summaries | pdf-lib, reportlab, fpdf2, Jinja2 |

## Tech Stack By Module

### 1. Candidate Portal
- Built with Next.js 14, React 18, and TypeScript.
- Uses Supabase auth/session handling for login, signup, and protected routes.
- Candidate dashboard reads opportunities and application status from API routes.

### 2. HR Dashboard
- Built in Next.js with server-side API routes under `app/api/*`.
- Uses Supabase for pipelines, applications, interviews, and analytics.
- Handles batch screening, invite generation, reporting links, and status updates.

### 3. Resume Analysis
- Frontend: Vite + React application in `Client Side/ai-skill-analyzer-main`.
- Backend: FastAPI service in `Client Side/backend`.
- AI: Google Gemini, with supporting NLP/document tooling for scoring and extraction.
- Libraries: `PyMuPDF`, `PyPDF2`, `python-docx`, `scikit-learn`, `spaCy`, `nltk`, `requests`.

### 4. Resume Builder
- Frontend: Vite/React candidate UI.
- Backend: Python rendering/export pipeline.
- Templates: LaTeX files in `templates/` and Python PDF generation helpers.
- Used to generate a polished resume/CV output from structured content.

### 5. Job Pipeline Creation
- Uses Next.js API routes for pipeline creation, opportunity publishing, application tracking, and analytics.
- Supabase stores pipelines, applications, resumes, interviews, and reports.
- Zod validation and shared API helpers keep route handling consistent.

### 6. Video Interview
- Flask app in `ai-video-interviewer/` handles the interview experience.
- Uses speech-to-text, text-to-speech, and a token-secured interview session flow.
- FFmpeg is required for audio processing.

### 7. Reports Generated
- Interview and resume analysis reports are generated as PDFs.
- HR reports include evaluation summaries, KPI breakdowns, strengths, weaknesses, and transcript data.
- Candidate-safe reports are also supported where appropriate.

## LLMs and AI Services

The project uses Google Gemini in two main places:

- `gemini-2.0-flash` in the Vite/FastAPI resume-analysis backend.
- `gemini-1.5-flash` in the interview evaluator for structured interview assessment.

Other AI-related packages and services used in the repo:

- `@google/generative-ai`
- `google-genai`
- `speech_recognition`
- `gTTS`
- `gradio_client`
- `pdf-lib`
- `reportlab`
- `fpdf2`

## Required Environment Variables

Keep real values in local `.env` files only. Do not commit secrets.

### Root `.env.local`
```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_VIDEO_INTERVIEW_URL=http://localhost:5001
NEXT_PUBLIC_CLIENT_SIDE_BACKEND_URL=http://localhost:8000
NEXT_PUBLIC_CLIENT_SIDE_FRONTEND_URL=http://localhost:8080
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
INTERVIEW_TOKEN_SECRET=...
GOOGLE_API_KEY=...
GEMINI_API_KEY=...
```

### Client Side `.env`
```bash
GEMINI_API_KEY=...
VITE_BACKEND_URL=http://localhost:8000
```

### Notes on keys
- `NEXT_PUBLIC_*` values are required by the Next.js client/server routes.
- `SUPABASE_SERVICE_ROLE_KEY` is used only on the server side.
- `GOOGLE_API_KEY` / `GEMINI_API_KEY` power AI scoring and interview evaluation.
- Never store real API keys in the README or commit them to git.

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11+
- FFmpeg for the video interview service
- A Supabase project
- Google Gemini API key

### Install
```bash
git clone https://github.com/AaryanGole26/ELEVATR.git
cd ELEVATR
npm run install-all
```

### Python setup
```bash
python -m venv venv
.\venv\Scripts\activate
pip install -r "Client Side/backend/requirements.txt"
pip install -r "ai-video-interviewer/requirements.txt"
```

### Start services
```bash
start-all.bat
```

Or run them separately:
```bash
npm run dev
cd "Client Side/ai-skill-analyzer-main" && npm run dev
cd "Client Side/backend" && python main.py
cd ai-video-interviewer && python app.py
```

## Ports

| Service | Port |
|---|---|
| Next.js portal | 3000 |
| Vite candidate app | 8080 |
| FastAPI backend | 8000 |
| Flask video interviewer | 5001 |

## Repository Layout

- `app/` - Next.js UI and API routes
- `ai/` - Shared AI helpers for interviewing, screening, and PDF reports
- `Client Side/` - Candidate resume analysis and resume builder experience
- `ai-video-interviewer/` - Flask-based video interview app
- `shared/` - Cross-app utilities, auth, Supabase helpers, and shared types
- `scripts/` - Utility scripts for storage setup and flow verification

## Documentation

Additional context is available in:

- `BOOKLET.md`
- `README_DOCUMENTATION_INDEX.md`
- `START_HERE.md`
- `QUICK_START.md`
- `DEBUG_INTERVIEW_FLOW.md`

## Security Reminder

- Never commit `.env` files or generated credentials.
- Keep Supabase service role keys, Gemini keys, Gmail passwords, and interview secrets local only.
- Generated reports and model artifacts should remain untracked.

## Project Structure (Summary)

```
ELEVATR/
├── app/                      Next.js App Router
├── ai/                       Shared AI engine (Gemini)
├── shared/                   Auth, Supabase clients, email utils
├── scripts/                  One-off setup scripts
├── Client Side/
│   ├── ai-skill-analyzer-main/  Vite/React SPA
│   └── backend/                 FastAPI
├── ai-video-interviewer/     Flask interview app
├── BOOKLET.md                Full technical documentation
├── .gitignore
├── .env.local                (not committed — see above)
└── start-all.bat             Start all services
```

---

## Tech Stack

- **AI:** Google Gemini (generativeai), sentence-transformers, spaCy
- **Frontend:** React 18, Vite, Next.js 14, Tailwind CSS, shadcn/ui, Radix UI
- **Backend:** FastAPI (Python), Flask (Python)
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **Email:** Nodemailer (Gmail SMTP)
- **PDF:** pdfplumber, PyMuPDF, WeasyPrint / pdfkit

---

## License

MIT © 2026 Ayush Mayekar, Aaryan Gole, Dnyanesh Panchal, Vaibhav Narute, Tejashree Karekar, Charmi Jani
