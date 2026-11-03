# ELEVATR platform audit

Audit date: 2026-11-04. Covers the Next.js app (HR and candidate portal), the resume module (Vite and FastAPI) and the AI interview service (Flask).

## State before the audit

The platform could not run end to end:

- The production build failed on a syntax error in the HR pipeline page.
- Candidates could not apply: every role showed "Position Closed", and the apply page was blocked by row-level security.
- The interview service exited at startup because the third-party Hugging Face Space it depended on is down.
- AI evaluation and the chatbot called model versions that providers no longer offer.

## Security issues fixed

| Severity | Issue | Fix |
|---|---|---|
| Critical | `GET /api/interviews/[id]/public` never checked its token and returned the token, resume and candidate email to anyone with the id | Token required and compared in constant time. Returns display fields only |
| Critical | `POST /api/interviews/[id]/result` treated the token as optional and trusted scores and decisions from the caller, so anyone could forge a result | Credentials required. Scores come only from the evaluator. Submission is an atomic, one-time claim |
| Critical | FastAPI `/upload_resume_path` parsed any file path on the server for any caller | Endpoint and its UI removed |
| Critical | `/export-pdf` returned the last analysis from any user, through a single global variable | Report is built from the caller's own result. No shared state |
| High | Reports were in a public bucket at predictable URLs | Private bucket. Access-checked route issues 5-minute signed URLs |
| High | Candidates could read other users' resumes by passing any `storage_path` to `POST /api/applications` | The server receives, validates and stores the file itself |
| High | RLS let users change their own role, insert applications with any score, and read their own HR evaluation | Those policies removed. All writes go through validated routes |
| High | Groq API key shipped to every browser through `NEXT_PUBLIC_` and `VITE_` variables | Server-side chat routes. Key renamed |
| High | Local auth fallback, enabled in `.env.local`, stored plaintext passwords in localStorage and could create fake sessions | Removed |
| High | Job-link fetching could reach internal addresses such as cloud metadata (SSRF) | Public addresses only, re-checked on every redirect |
| High | LaTeX injection through unsanitized URLs and email, plus path traversal in template names | Input sanitized. `-no-shell-escape`, restricted file access, bare template names only |
| High | Interview service accepted hand-offs from anyone, with `*` CORS | Shared secret required for server-to-server hand-off. Resume and callback token never reach the browser |
| Medium | Temporary passwords emailed in plain text, generated with `Math.random` | One-time set-password link. Tokens use `crypto.randomBytes` |
| Medium | Interview links never expired despite promising 72 hours | Expiry set and enforced |
| Medium | Open redirect at login (`?next=//evil.com`) | Same-site paths only |
| Medium | Stack traces and database errors returned to callers | Generic 5xx responses, with details in server logs |
| Medium | Stored XSS in the interview chat, and HTML injection in emails | Text rendering. All email content escaped |
| Low | Debug endpoint, wildcard CORS on the resume API, missing security headers | Removed or set |

## Functional bugs fixed

**Data integrity**
- Next.js cached database reads inside server routes in production, so interview status could stay stale indefinitely. Database clients now opt out of the fetch cache, and per-user GET routes are marked dynamic.
- `schema.sql` lacked columns the code requires, so a fresh database could not run the app. Migration 003 adds them, plus a status constraint, a uniqueness rule, foreign-key indexes and an auth trigger.
- `public.users` rows could fail to exist for new accounts, which later broke pipeline creation. A database trigger now creates them, and existing accounts are backfilled.

**HR**
- "AI Eval" called endpoints that don't exist or returned no evaluation. It now uses one shared modal and the details route.
- Closing a position was disabled, and the pipelines API always reported it as open. It now works, and closed roles stop accepting applicants.
- Notify re-invited candidates who had finished and crashed on a second interview row. It now moves each candidate to the correct stage and skips anyone already told.
- "Reject" in AI mode rejected candidates above the cutoff instead of below it.
- `/api/stats` reported status emails as sent regardless of what happened. It now reflects actual delivery.
- Reprocess crashed on an undefined variable after already writing its changes.

**Screening and resumes**
- Every resume for a non-technical role scored 0. Skills also matched inside other words ("rest" in "restaurant").
- `pdf-parse` shipped a 2017 PDF engine that failed intermittently on valid modern PDFs. Replaced with `pdfjs-dist`.
- PDF report generation aborted on a single emoji or non-Latin character.
- The resume API crashed on startup when no Gemini key was set, and its import stubs could silently return fake results.

**Interview**
- Candidates could be mixed up: all interviews shared one upstream conversation and fixed temp filenames. Sessions and temp files are now isolated.
- If AI evaluation failed, a score calculated in the browser was stored as the result. Now no score is stored, the transcript is kept, and HR can retry.
- One alt-tab counted as three proctoring warnings and ended the interview. A low-resolution webcam could also end it. Fixed.
- The written interview was broken and always submitted a hardcoded score of 65.
- Evaluation now retries on provider rate limits and temporary errors.

**Auth**
- Password reset could reject valid links because a promise wasn't awaited.
- An auth race could restore a user who had just signed out.
- Signup defaulted new users to HR.

## UI

One design system (`app/globals.css`), with matching tokens in the resume tools and interview service: frosted-glass surfaces, a shared palette and type scale, and consistent buttons, forms, tables, modals and toasts. Pages that used Tailwind classes in an app without Tailwind rendered unstyled and were rebuilt. Glass falls back to solid surfaces when blur or transparency is unavailable or disabled, and motion respects reduced-motion settings.

## Test evidence

| Check | Result |
|---|---|
| Browser end-to-end suite on the production build, local Supabase, all four services | 18/18 passed |
| Same suite with real Gemini on synthetic data (run before the set-password test was added, so 17 tests) | 17/17 passed |
| Interview service tests | 11/11 passed |
| Typecheck and lint | Clean |
| Schema and migrations on a fresh database, applied twice | Clean |

Run them with `supabase start`, then `npm run test:e2e` and `npm run test:service`.

## Not verified

- **Real email delivery.** Email is disabled in tests so that no real messages can be sent. Template rendering and the no-email path are covered, but Gmail sending is not.
- **Spoken answers.** Tests use typed answers and a fake camera. Browser speech recognition and the FFmpeg path were not exercised with real speech.
- **The hosted Supabase project.** Its hostname no longer resolves, so migrations have only been run on a local database.
- **A real deployment** behind HTTPS, under load, or on several instances.
- **Browsers other than Chromium.**

## Action required before launch

1. **Create or restore a Supabase project**, update `.env.local`, and run `SUPABASE_DB_URL=... npm run db:apply`.
2. **Rotate these keys.** They were exposed or stored insecurely:
   - Groq key: shipped in browser bundles under the `NEXT_PUBLIC_` name.
   - Supabase service key: if it is the JWT hardcoded in the local `check_supabase.js`. That file is gitignored and was never committed, but it should be deleted.
3. **Decide who can become HR.** Anyone can currently self-register as a recruiter. Access is limited to their own pipelines, but they can read the resumes of anyone who applies to a pipeline they create, and all open roles are shown to candidates. Consider an invite or approval step.
4. **Check your Gemini quota.** A single 8-question interview hit a rate limit (HTTP 429) on the current key during testing. When that happens, questions fall back to templates and evaluation retries, then waits for HR to retry. Real traffic will need a higher limit.
5. **Review the legal position.** AI scoring of job candidates, and video proctoring, are regulated in many places. "Select by interview score" currently needs only HR's confirmation. Review notice, consent and human-oversight requirements for your jurisdictions.

## Known limitations

- Rate limits and interview sessions are held in memory per process. Scaling beyond one instance needs a shared store such as Redis, and a restart loses interviews in progress.
- Proctoring runs in the candidate's browser, so a determined candidate can bypass it. Treat it as a signal, not proof.
- Interview links sent before tokens existed stop working, because migration 003 gives those interviews a new token. HR must re-send them with "Also resend".
- The earlier untracked documents (`API_REFERENCE.md`, `ARCHITECTURE.md` and others) were left unchanged and now describe some removed behaviour.
