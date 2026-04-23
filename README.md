# ELEVATR — AI Hiring Platform

> Unified AI-powered platform for resume analysis, CV building, video interviews, and HR pipeline management.

**Team:** Ayush Mayekar · Aaryan Gole · Dnyanesh Panchal · Vaibhav Narute · Tejashree Karekar · Charmi Jani — VCET  
**Stack:** Next.js · Vite/React · FastAPI · Flask · Gemini AI · Supabase

---

## What is ELEVATR?

ELEVATR connects four tools into a single hiring pipeline:

| Module | Who Uses It | Port |
|---|---|---|
| **Resume Analyzer** | Candidates | 8080 + 8000 |
| **CV Builder** | Candidates | 8080 + 8000 |
| **AI Video Interviewer** | Candidates (invite) | 5001 |
| **HR Pipeline Dashboard** | HR managers | 3000 |

HR teams create JD-based pipelines → bulk-screen resumes using AI scores → shortlisted candidates get an auto-generated interview link → the Flask AI interviewer conducts the session → a PDF evaluation report lands in the HR dashboard.

---

## Quick Start

### Prerequisites

- Node.js 18+
- Python 3.11+
- A Supabase project

### Clone & Install

```bash
# Install Next.js deps
npm install

# Install Vite client deps
cd "Client Side/ai-skill-analyzer-main"
npm install

# Python deps — FastAPI
cd "Client Side/backend"
pip install -r requirements.txt

# Python deps — Flask
cd ../../ai-video-interviewer
pip install -r requirements.txt
```

### Configure Environment

Copy `.env.local.example` (or create `.env.local`) in the root with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
NEXT_PUBLIC_APP_URL=http://localhost:3000
GMAIL_USER=...
GMAIL_APP_PASSWORD=...
NEXT_PUBLIC_VIDEO_INTERVIEW_URL=http://localhost:5001
NEXT_PUBLIC_CLIENT_SIDE_BACKEND_URL=http://localhost:8000
INTERVIEW_TOKEN_SECRET=...
GEMINI_API_KEY=...
```

Then for the Vite client (`Client Side/ai-skill-analyzer-main/.env.local`):

```bash
VITE_BACKEND_URL=http://localhost:8000
```

### Init Supabase Storage

```bash
node scripts/init-storage.js
```

### Run All Services

```bat
# Windows — runs all 4 services concurrently
start-all.bat
```

Or start each manually:

```bash
npm run dev                          # Next.js  → http://localhost:3000
cd "Client Side/ai-skill-analyzer-main" && npm run dev  # Vite → http://localhost:8080
cd "Client Side/backend" && python main.py              # FastAPI → http://localhost:8000
cd ai-video-interviewer && python app.py                # Flask → http://localhost:5001
```

---

## Services

### `localhost:3000` — Next.js Portal

HR dashboard, candidate profiles, pipeline management, and all API routes. Authentication via Supabase.

### `localhost:8080` — Vite/React Client

Public-facing candidate tools. Resume Analyzer and CV Builder. No login required to analyze a resume.

### `localhost:8000` — FastAPI Backend

Python backend for the Vite app. Handles PDF extraction, AI scoring (Gemini), CV template rendering, and PDF export.

### `localhost:5001` — Flask AI Interviewer

Secure video interview sessions. Receives token-verified links, conducts AI-led interviews using Gemini, and posts results back to the Next.js portal.

---

## Documentation

See [`booklet.md`](./booklet.md) for:

- Full tech stack breakdown
- Annotated project tree
- ASCII architecture diagrams for each module
- Workflow deep-dives (resume analysis, HR pipeline, video interview, CV builder)
- Complete API endpoint reference
- Supabase database schema
- Environment variable reference

---

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
├── booklet.md                Full technical documentation
├── .gitignore
├── .env.local                (not committed — see above)
└── start-all.bat             Start all services
```

---

## Tech Stack

- **AI:** Google Gemini (generativeai), sentence-transformers, spaCy
- **Frontend:** React 18, Vite, Next.js 15, Tailwind CSS, shadcn/ui, Radix UI
- **Backend:** FastAPI (Python), Flask (Python)
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **Email:** Nodemailer (Gmail SMTP)
- **PDF:** pdfplumber, PyMuPDF, WeasyPrint / pdfkit

---

## License

MIT © 2026 Ayush Mayekar, Aaryan Gole, Dnyanesh Panchal, Vaibhav Narute, Tejashree Karekar, Charmi Jani
