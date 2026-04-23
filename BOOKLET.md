# ELEVATR — Project Booklet

> **Version:** 1.0 · **Last Updated:** April 2026  
> **Author:** Aaryan Gole — VCET

---

## Index

1. [Overview](#1-overview)
2. [Tech Stack](#2-tech-stack)
3. [Project Structure](#3-project-structure)
4. [Module Architecture](#4-module-architecture)
   - 4.1 [Next.js Portal — HR & Candidate Hub](#41-nextjs-portal--hr--candidate-hub)
   - 4.2 [Client Side — Resume Tools (Vite/React)](#42-client-side--resume-tools-vitereact)
   - 4.3 [AI Video Interviewer (Flask)](#43-ai-video-interviewer-flask)
5. [Workflow Deep-Dives](#5-workflow-deep-dives)
   - 5.1 [Candidate Resume Analysis Flow](#51-candidate-resume-analysis-flow)
   - 5.2 [HR Pipeline & Bulk Screening Flow](#52-hr-pipeline--bulk-screening-flow)
   - 5.3 [Video Interview & Report Flow](#53-video-interview--report-flow)
   - 5.4 [CV Builder Flow](#54-cv-builder-flow)
6. [API Endpoints Reference](#6-api-endpoints-reference)
   - 6.1 [Next.js API Routes (port 3000)](#61-nextjs-api-routes-port-3000)
   - 6.2 [FastAPI Backend (port 8000)](#62-fastapi-backend-port-8000)
   - 6.3 [Flask Video Interviewer (port 5001)](#63-flask-video-interviewer-port-5001)
7. [Database Schema](#7-database-schema)
8. [Environment Variables](#8-environment-variables)
9. [Local Development](#9-local-development)

---

## 1. Overview

**ELEVATR** is a unified AI hiring platform with four integrated tools:

| Tool | Who Uses It | Port |
|---|---|---|
| Resume Analyzer | Candidates | 8080 (Vite) + 8000 (FastAPI) |
| CV Builder | Candidates | 8080 (Vite) + 8000 (FastAPI) |
| AI Video Interviewer | Candidates (invite only) | 5001 (Flask) |
| HR Pipeline Dashboard | HR managers | 3000 (Next.js) |

The platform connects all four: an HR team creates a pipeline → uploads resumes → shortlisted candidates get an interview link → the Flask interviewer posts back to the Next.js portal → HR reviews the AI-scored PDF report and makes a final decision.

---

## 2. Tech Stack

### Core Services

| Service | Framework | Language | Runtime |
|---|---|---|---|
| Main Portal | Next.js 15 (App Router) | TypeScript | Node.js |
| Resume Tools Frontend | Vite + React 18 | TypeScript | Node.js |
| Resume Tools Backend | FastAPI | Python 3.11+ | Uvicorn |
| AI Video Interviewer | Flask | Python 3.11+ | Dev server |

### AI & ML

| Library | Purpose |
|---|---|
| `google-generativeai` (Gemini) | Resume analysis, interview evaluation, question generation |
| `PyMuPDF` / `pdfplumber` | PDF text extraction |
| `spaCy` | NLP preprocessing for resume parsing |
| `sentence-transformers` | Semantic similarity for skill matching |

### Database & Storage

| Service | Purpose |
|---|---|
| Supabase (PostgreSQL) | Relational data: users, pipelines, applications, interviews |
| Supabase Storage | PDF resumes + generated interview report PDFs |
| Supabase Auth | Email/password auth with role metadata (HR vs candidate) |

### Frontend Libraries (Client Side — Vite)

| Library | Purpose |
|---|---|
| React Router DOM v6 | Hash-based SPA routing |
| TanStack Query | Server state & caching |
| Radix UI + shadcn/ui | Component primitives |
| Tailwind CSS v3 | Utility-first styling |
| Lucide React | Icons |
| Recharts | Score visualization charts |
| React Hook Form + Zod | Form validation |
| Axios | HTTP client for FastAPI calls |

### Frontend Libraries (Next.js Portal)

| Library | Purpose |
|---|---|
| Next.js App Router | File-based routing, SSR |
| Supabase JS Client | Direct DB queries from client |
| `@supabase/ssr` | Server-side auth cookie handling |
| Nodemailer | SMTP email (Gmail) for notifications |
| PDF buffer utilities | Interview report PDF generation |

---

## 3. Project Structure

```
ELEVATR/
│
├── app/                          # Next.js App Router (port 3000)
│   ├── globals.css               # Design system, CSS vars, animations
│   ├── layout.tsx                # Root layout with Navbar + AuthContext
│   ├── page.tsx                  # Landing page
│   ├── login/  signup/           # Auth pages
│   ├── forgot-password/
│   ├── reset-password/
│   ├── hr/                       # HR dashboard
│   │   ├── page.tsx              # Pipelines overview
│   │   └── pipeline/[id]/        # Pipeline detail & candidate mgmt
│   ├── dashboard/                # Candidate dashboard
│   ├── apply/                    # Public job application
│   ├── video-interview/[id]/     # Candidate interview entry
│   ├── interview/                # Active interview session
│   └── api/                      # Next.js API routes
│       ├── auth/
│       ├── pipelines/[id]/
│       │   ├── batch/            # Bulk resume ingest
│       │   ├── notify/           # Send emails
│       │   └── finalize/         # Select candidates
│       ├── interviews/[id]/
│       │   ├── public/           # Interview config (candidate)
│       │   └── result/           # Flask callback receiver
│       ├── resumes/[id]/
│       └── stats/
│
├── ai/                            # AI engine modules
│   ├── interviewer/
│   │   ├── engine.ts              # Question generation
│   │   └── evaluator.ts           # Post-interview scoring
│   ├── screening/
│   │   └── scorer.ts              # Resume vs JD matching
│   └── report/
│       └── pdf.ts                 # PDF report generation
│
├── shared/                        # Shared utilities (Next.js)
│   ├── auth.ts                    # Server-side role guard
│   ├── auth-context.tsx           # useAuth() hook
│   ├── supabase/
│   │   ├── client.ts              # Browser client (with RLS)
│   │   └── admin.ts               # Service-role client (bypasses RLS)
│   ├── email.ts                   # Nodemailer SMTP wrapper
│   ├── env.ts                     # Env var validation
│   ├── api-utils.ts               # Response helpers, rate limiter
│   ├── interview-security.ts      # Token generate/verify
│   └── components/
│       ├── Navbar.tsx             # Portal navigation
│       └── AuthGuard.tsx          # Role-based route protection
│
├── scripts/                       # One-off setup scripts
│   ├── init-storage.js            # Create Supabase storage buckets
│   └── debug-schema.js            # Log schema info
│
├── Client Side/
│   └── ai-skill-analyzer-main/    # Vite/React SPA (port 8080)
│       ├── index.html             # Entry (favicon: /icon.svg)
│       ├── vite.config.ts         # Port 8080, @/ alias
│       ├── src/
│       │   ├── App.tsx            # HashRouter + all routes
│       │   ├── pages/
│       │   │   ├── LandingPage.tsx
│       │   │   ├── UploadPage.tsx      # Resume upload + JD input
│       │   │   ├── ResultsPage.tsx     # Analysis results + charts
│       │   │   ├── BuildCVPage.tsx     # CV builder with live preview
│       │   │   ├── GetStartedPage.tsx  # Choice: Analyze vs Build
│       │   │   ├── FeaturesPage.tsx
│       │   │   ├── AboutPage.tsx
│       │   │   └── ContactPage.tsx
│       │   ├── components/
│       │   │   ├── Layout/Navbar.tsx   # With Get Started dropdown
│       │   │   └── ui/                  # shadcn/ui components
│       │   ├── hooks/
│       │   ├── lib/
│       │   ├── data/mockData.ts
│       │   └── types/
│       └── public/
│           ├── icon.svg           # Favicon
│           └── am.jpg acg.jpg dp.jpg  # Team photos
│
│   └── backend/                   # FastAPI (port 8000)
│       ├── main.py
│       └── requirements.txt
│
└── ai-video-interviewer/          # Flask (port 5001)
    ├── app.py                     # All routes + AI logic
    ├── templates/*.html           # Jinja2 interview UI
    └── static/                    # JS/CSS assets
```

---

## 4. Module Architecture

### 4.1 Next.js Portal — HR & Candidate Hub

```
┌──────────────────────────────────────────────────────┐
│                Next.js (port 3000)                   │
│                                                      │
│  Auth Layer (Supabase Auth + RLS)                    │
│    ├── candidate role → /dashboard, /apply           │
│    └── hr role        → /hr, /hr/pipeline/:id        │
│                                                      │
│  API Routes (/api/...)                               │
│    ├── /pipelines           CRUD pipelines           │
│    ├── /pipelines/:id/batch  Bulk resume ingest      │
│    ├── /pipelines/:id/notify Email candidates        │
│    ├── /pipelines/:id/finalize Select candidates     │
│    ├── /interviews          Create interview record  │
│    ├── /interviews/:id/result  Flask callback        │
│    ├── /resumes/:id         View / delete resume     │
│    └── /stats               Dashboard metrics       │
│                                                      │
│  AI Engine (ai/)                                     │
│    ├── engine.ts   → question generation (Gemini)    │
│    ├── evaluator.ts → interview scoring (Gemini)     │
│    └── pdf.ts      → PDF report creation             │
│                                                      │
│  Supabase Admin Client (service-role, bypasses RLS)  │
└──────────────────────────────────────────────────────┘
         ↕ HTTP POST callback
┌────────────────────────┐
│  Flask (port 5001)     │
│  /end-session callback │
└────────────────────────┘
```

---

### 4.2 Client Side — Resume Tools (Vite/React)

```
┌──────────────────────────────────────────────────────┐
│          Vite/React SPA (port 8080, HashRouter)      │
│                                                      │
│  /#/          LandingPage  (full platform overview)  │
│  /#/upload    UploadPage   (resume + JD input)       │
│  /#/results   ResultsPage  (AI scores + charts)      │
│  /#/buildcv   BuildCVPage  (live CV editor)          │
│  /#/features  FeaturesPage                           │
│  /#/about     AboutPage                              │
│  /#/contact   ContactPage                            │
│                                                      │
│  Navbar: Logo | Home · Features · About | [Get Started▾]
│    ├─ Get Started → Analyze Resume (/#/upload)       │
│    └─              Build New CV    (/#/buildcv)      │
│                                                      │
│  State: localStorage-backed (no login required)      │
└──────────────────────────────────────────────────────┘
         ↕ axios / fetch
┌────────────────────────┐
│  FastAPI (port 8000)   │
│  POST /analyze-resume  │
│  GET  /templates       │
│  POST /generate-cv     │
│  POST /export-pdf      │
└────────────────────────┘
```

---

### 4.3 AI Video Interviewer (Flask)

```
┌────────────────────────────────────────────────────────┐
│               Flask App (port 5001)                    │
│                                                        │
│  GET /video-interview/<id>?token=<jwt>                 │
│    Validates token, fetches config from Next.js,       │
│    renders interview.html UI                           │
│                                                        │
│  Browser UI (MediaRecorder → Web Speech API → text)   │
│    └── POST /submit-response {text, interview_id}      │
│          ├── Appends candidate answer to conversation  │
│          ├── Gemini generates next question            │
│          └── Returns {response, is_complete}           │
│                                                        │
│  POST /end-session                                     │
│    Sends full conversation to Next.js:                 │
│    POST /api/interviews/<id>/result                    │
└────────────────────────────────────────────────────────┘
         ↕ callback to Next.js
┌──────────────────────────────────────────────────────┐
│  Next.js /api/interviews/[id]/result                  │
│  1. evaluateInterview() via Gemini                    │
│  2. createInterviewReportPdf()                        │
│  3. Upload PDF → Supabase "reports" bucket            │
│  4. Update interviews + applications tables           │
│  5. Email candidate confirmation                      │
└──────────────────────────────────────────────────────┘
```

---

## 5. Workflow Deep-Dives

### 5.1 Candidate Resume Analysis Flow

```
Candidate uploads PDF + pastes Job Description
  │
  ▼  POST /analyze-resume  (FastAPI, port 8000)
  ├── pdfplumber extracts text from PDF
  ├── Gemini computes:
  │     overallScore, skillMatchScore, experienceScore
  │     missingSkills[], matchedSkills[], suggestions[]
  │     sectionScores {summary, experience, skills, education}
  └── Returns JSON
  │
  ▼
ResultsPage (/#/results)
  ├── Overall score gauge chart
  ├── Skill match breakdown bar chart
  ├── Missing skills + matched skills lists
  └── Tailored improvement suggestions
```

---

### 5.2 HR Pipeline & Bulk Screening Flow

```
HR creates Pipeline
  POST /api/pipelines {job_title, jd_text, threshold, tags}
  │
  ▼
HR uploads resumes (bulk PDF)
  POST /api/pipelines/:id/batch
  For each PDF:
  ├── Extract text
  ├── Gemini scores: match(resumeText, jd_text) → 0-100
  ├── score >= threshold → status: 'shortlisted'
  └── score <  threshold → status: 'screened'
  │
  ▼
HR notifies candidates
  POST /api/pipelines/:id/notify
  ├── 'screened' → rejection email
  └── 'shortlisted':
        ├── generateInterviewConfig(jd, resume, duration)
        ├── generateInterviewToken(application_id)
        ├── Store interview record in Supabase
        └── Email secure interview link (72hr expiry)
  │
  ▼
Post-interview finalization
  POST /api/pipelines/:id/finalize
  ├── mode='manual' → HR selects by checkbox
  └── mode='ai'     → auto-select score >= ai_cutoff
  └── Send offer/rejection emails to all
```

---

### 5.3 Video Interview & Report Flow

```
Candidate opens interview link
  /video-interview/:id?token=...   (Next.js page)
  GET /api/interviews/:id/public → {config, jd_text}
  Redirect to Flask: http://localhost:5001/video-interview/:id?token=...
  │
  ▼
Flask validates token + loads config
  Renders interview.html
  │
  ▼
Interview loop:
  MediaRecorder → STT → text answer
  POST /submit-response
    ├── Append {role:'candidate', text} to conversation[]
    ├── Gemini → next question
    └── Return {response, is_complete}
  (repeat N times)
  │
  ▼
POST /end-session → Flask sends callback to Next.js
  POST /api/interviews/:id/result
    {result_json: {conversation[]}, candidate_email, callback_token}
  │
  ▼
Next.js processes result:
  1. evaluateInterview(transcript, jd, resume)   → Gemini
       overallScore, summary, strengths, weaknesses,
       kpis {confidence, clarity, technical,
              communication, culture_fit}
  2. createInterviewReportPdf(enrichedData)      → PDF buffer
  3. Upload PDF → Supabase Storage "reports" bucket
  4. Update interviews.result_json + report_pdf_url
  5. Update applications.status='interviewed'
       latest_interview_score, latest_report_pdf_url
  6. Email candidate: "Interview submitted"
  │
  ▼
HR Dashboard /hr/pipeline/:id
  handleViewEvaluation() → loads result_json
  Renders: KPI scores, strengths, weaknesses, transcript
  "View PDF Report" → opens public Supabase URL
```

---

### 5.4 CV Builder Flow

```
Candidate opens /#/buildcv
  GET /templates (FastAPI) → template list
  │
  ▼
User fills sections (React state + localStorage):
  personal info, summary, experience,
  education, skills, projects
  │
  ▼
Live preview panel renders HTML template in real-time
  │
  ▼
Export PDF
  POST /export-pdf (FastAPI)
  ├── Render Jinja2/HTML template with data
  ├── WeasyPrint / pdfkit → PDF buffer
  └── Return as file download
```

---

## 6. API Endpoints Reference

### 6.1 Next.js API Routes (port 3000)

| Method | Route | Auth | Description |
|---|---|---|---|
| POST | `/api/auth/signup` | — | Register new user |
| POST | `/api/auth/signin` | — | Sign in |
| POST | `/api/auth/signout` | Any | Sign out |
| GET | `/api/pipelines` | HR | List pipelines |
| POST | `/api/pipelines` | HR | Create pipeline |
| GET | `/api/pipelines/:id` | HR | Pipeline detail + applications |
| PATCH | `/api/pipelines/:id` | HR | Update pipeline |
| DELETE | `/api/pipelines/:id` | HR | Delete pipeline |
| POST | `/api/pipelines/:id/batch` | HR | Bulk resume ingest |
| POST | `/api/pipelines/:id/notify` | HR | Send emails + interview links |
| POST | `/api/pipelines/:id/finalize` | HR | Finalize + send offer emails |
| POST | `/api/interviews` | HR | Create interview record + send email |
| GET | `/api/interviews/:id/public` | Token | Fetch interview config |
| POST | `/api/interviews/:id/result` | Callback* | Flask posts result here |
| GET | `/api/resumes/:id` | HR | Resume detail |
| DELETE | `/api/resumes/:id` | HR | Delete resume + applications |
| GET | `/api/stats` | HR | Dashboard metrics |

> `*` Verified via `callback_token` in body, not an auth header.

---

### 6.2 FastAPI Backend (port 8000)

| Method | Route | Description |
|---|---|---|
| POST | `/analyze-resume` | PDF + JD → AI score JSON |
| GET | `/templates` | List CV templates |
| POST | `/generate-cv` | Generate CV from template + data |
| POST | `/export-pdf` | Export CV as PDF download |
| GET | `/health` | Health check |

**`POST /analyze-resume` response:**

```json
{
  "overallScore": 78,
  "skillMatchScore": 82,
  "missingSkills": ["Kubernetes", "Terraform"],
  "matchedSkills": ["Python", "FastAPI", "PostgreSQL"],
  "suggestions": ["Add quantified achievements"],
  "sectionScores": {
    "summary": 70, "experience": 75,
    "skills": 85, "education": 80
  }
}
```

---

### 6.3 Flask Video Interviewer (port 5001)

| Method | Route | Description |
|---|---|---|
| GET | `/video-interview/<id>` | Load interview (requires `?token=`) |
| POST | `/submit-response` | Candidate answer → next AI question |
| POST | `/end-session` | End interview, trigger Next.js callback |
| GET | `/health` | Health check |

**`POST /submit-response` response:**

```json
{
  "response": "Tell me about a challenging project...",
  "is_complete": false,
  "question_number": 3,
  "total_questions": 8
}
```

---

## 7. Database Schema

```
pipelines
├── id, hr_id, job_title, jd_text
├── threshold (int 0-100)
├── tags (text[]), is_active, created_at

resumes
├── id, candidate_id (nullable)
├── file_name, file_type, file_size
├── content (extracted text)
├── storage_path (Supabase Storage)
└── created_at

applications
├── id, pipeline_id, candidate_id (nullable)
├── resume_id, email, email_source
├── status: applied|shortlisted|screened|
│          invited|interviewed|selected|rejected
├── score (0-100)
├── latest_interview_id
├── latest_interview_score
├── latest_report_pdf_url
└── created_at / updated_at

interviews
├── id, application_id
├── config (jsonb: questions, context, duration)
├── interview_token (HMAC)
├── interview_link
├── result_json (conversation + AI evaluation)
├── report_pdf_url
└── created_at
```

### Supabase Storage Buckets

| Bucket | Path | Contents |
|---|---|---|
| `resumes` | `resumes/<user_id>/<uuid>.pdf` | Uploaded CVs |
| `reports` | `interview-reports/<interview_id>.pdf` | AI interview reports |

---

## 8. Environment Variables

Root `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_APP_URL=http://localhost:3000
GMAIL_USER=your@gmail.com
GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx
NEXT_PUBLIC_VIDEO_INTERVIEW_URL=http://localhost:5001
NEXT_PUBLIC_CLIENT_SIDE_BACKEND_URL=http://localhost:8000
INTERVIEW_TOKEN_SECRET=random-secret
GEMINI_API_KEY=AIza...
```

Client Side `.env.local` (`Client Side/ai-skill-analyzer-main/`):

```bash
VITE_BACKEND_URL=http://localhost:8000
```

---

## 9. Local Development

### Run all 4 services (Windows)

```bat
start-all.bat
```

### Manual (separate terminals)

```bash
# 1. Next.js portal — port 3000
npm run dev

# 2. Vite/React client — port 8080
cd "Client Side/ai-skill-analyzer-main"
npm run dev

# 3. FastAPI backend — port 8000
cd "Client Side/backend"
python main.py

# 4. Flask video interviewer — port 5001
cd ai-video-interviewer
python app.py
```

### One-time setup

```bash
npm install
cd "Client Side/ai-skill-analyzer-main" && npm install
cd "Client Side/backend" && pip install -r requirements.txt
cd ai-video-interviewer && pip install -r requirements.txt
node scripts/init-storage.js
```
