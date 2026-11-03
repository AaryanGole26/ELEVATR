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
| Resume builder | Build and export CVs from templates and candidate data | Vite/React, FastAPI, LaTeX templates, reportlab |
| Job pipeline creation | Create JD-based pipelines, shortlist candidates, and feed interview scheduling | Next.js API routes, Supabase tables, Zod validation |
| Video interview | Run secure, proctored AI interviews from a one-time link, with speech input and output | Flask, Gemini, gTTS, SpeechRecognition, FFmpeg |
| Reports | Generate HR and candidate PDFs for resume analysis and interview results, served through access-checked links | pdf-lib, reportlab |

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
- Libraries: `PyMuPDF`, `PyPDF2`, `python-docx`, `docx2txt`, `spaCy`, `requests`.

### 4. Resume Builder
- Frontend: Vite/React candidate UI.
- Backend: FastAPI rendering and export.
- Templates: LaTeX files in `Client Side/templates/`. PDF export needs `pdflatex` (for example MiKTeX).
- Used to generate a polished resume/CV output from structured content.

### 5. Job Pipeline Creation
- Uses Next.js API routes for pipeline creation, opportunity publishing, application tracking, and analytics.
- Supabase stores pipelines, applications, resumes, interviews, and reports.
- Zod validation and shared API helpers keep route handling consistent.

### 6. Video Interview
- Flask app in `ai-video-interviewer/` runs the live interview.
- The main app hands each interview over server-to-server using `INTERVIEW_SERVICE_SECRET`, so the resume and callback details never reach the browser.
- Questions come from Gemini, with resume-aware templates as a fallback. Candidates can speak or type their answers.
- FFmpeg is only needed in browsers without built-in speech recognition.
- Candidates can use a written interview instead. HR sees which type was used.

### 7. Reports Generated
- Interview and resume analysis reports are generated as PDFs.
- HR reports include evaluation summaries, KPI breakdowns, strengths, weaknesses, and transcript data.
- Reports are stored privately. HR can open reports for their own pipelines, and candidates can open only their own candidate report.

## LLMs and AI Services

All AI providers are called from server code, so keys never reach the browser.

| Provider | Used for | Setting |
|---|---|---|
| Google Gemini | Interview questions, interview evaluation, resume recommendations | `GEMINI_MODEL` (default `gemini-2.5-flash`) |
| Groq | The Neuro assistant | `GROQ_MODEL` (default `openai/gpt-oss-20b`) |
| gTTS and browser speech recognition, or SpeechRecognition with FFmpeg | Interview speech | None |

If the AI is unavailable, the platform keeps working: interviews use template questions, and evaluations are saved without a score so HR can retry them.

## Required Environment Variables

Copy `.env.example` to `.env.local` and fill it in. All three services read that file. Never commit real values, and never give a secret the `NEXT_PUBLIC_` or `VITE_` prefix, because those values are published to browsers.

## Quick Start

### Prerequisites
- Node.js 18+
- Python 3.11 or 3.12
- A Supabase project
- A Google Gemini API key
- Optional: FFmpeg (voice answers in browsers without speech recognition), `pdflatex` (resume PDF export), a Groq API key (Neuro assistant), a Gmail app password (sending email)

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
python -m spacy download en_core_web_md
```

### Set up the database
Point `SUPABASE_DB_URL` at your Supabase Postgres database, then apply the schema and migrations. They are safe to re-run.
```bash
SUPABASE_DB_URL=postgresql://... npm run db:apply
```

### Start services
```bash
start-all.bat
```

This runs all four servers in one terminal with coloured `[APP]`, `[AI-V]`, `[BACKEND]` and `[ANALYZE]` labels, after checking that setup is complete and the ports are free. Press Ctrl+C to stop them all. Open http://localhost:3000 once they are ready.

`npm run start-all` does the same without the checks. To run the servers separately:
```bash
npm run dev
cd "Client Side/ai-skill-analyzer-main" && npm run dev
cd "Client Side/backend" && ..\..\venv\Scripts\python main.py
cd ai-video-interviewer && ..\venv\Scripts\python app.py
```

## Testing

The end-to-end suite runs a production build and all services against a throwaway local Supabase. It needs Docker, the Supabase CLI and `psql`. It refuses to run against a non-local database, and email is disabled so no real messages are sent.

```bash
npx playwright install chromium
venv\Scripts\pip install pytest
supabase start
npm run test:e2e        # add E2E_REAL_AI=true to use real Gemini with your key
npm run test:service    # interview service, runs offline
npm run typecheck
```

See [docs/AUDIT.md](docs/AUDIT.md) for the audit findings, test evidence and pre-launch actions.

## Ports

| Service | Port |
|---|---|
| Next.js portal and API | 3000 |
| Vite resume tools | 8080 |
| FastAPI resume API | 8000 |
| Flask video interviewer | 5001 |

## Repository Layout

- `app/` - Next.js UI and API routes
- `ai/` - Interview evaluation, resume screening, and PDF reports
- `Client Side/` - Candidate resume analysis and resume builder experience
- `ai-video-interviewer/` - Flask-based video interview app
- `shared/` - Cross-app utilities, auth, Supabase helpers, and shared types
- `scripts/` - Database setup, storage setup, and flow verification
- `tests/e2e/` - Browser tests for the whole platform
- `docs/` - Audit report

## Documentation

- [docs/AUDIT.md](docs/AUDIT.md): audit findings, test evidence, and actions required before launch.

## Security Reminder

- Never commit `.env` files or generated credentials.
- Keep Supabase service role keys, Gemini keys, Gmail passwords, and interview secrets local only.
- Never give a secret the `NEXT_PUBLIC_` or `VITE_` prefix.
- Generated reports, interview audio, and model artifacts should remain untracked.

## Project Structure (Summary)

```
ELEVATR/
├── app/                      Next.js App Router
├── ai/                       Evaluation, screening, reports
├── shared/                   Auth, Supabase clients, email utils
├── scripts/                  Database and storage setup
├── Client Side/
│   ├── ai-skill-analyzer-main/  Vite/React SPA
│   └── backend/                 FastAPI
├── ai-video-interviewer/     Flask interview app
├── tests/e2e/                 Browser tests
├── docs/                     Audit report
├── .env.example              Settings template
├── .gitignore
├── .env.local                (not committed — see above)
└── start-all.bat             Start all services in one terminal
```

---

## Tech Stack

- **AI:** Google Gemini, Groq, spaCy
- **Frontend:** React 18, Vite, Next.js 14, Tailwind CSS, shadcn/ui, Radix UI
- **Backend:** FastAPI (Python), Flask (Python)
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **Email:** Nodemailer (Gmail SMTP)
- **PDF:** pdf.js (reading), pdf-lib and reportlab (generating), PyMuPDF, LaTeX
- **Testing:** Playwright, pytest

---

## License

MIT © 2026 Ayush Mayekar, Aaryan Gole, Dnyanesh Panchal, Vaibhav Narute, Tejashree Karekar, Charmi Jani
