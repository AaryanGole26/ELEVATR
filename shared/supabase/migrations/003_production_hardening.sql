-- Migration 003: production hardening.
-- Safe to re-run. Brings a database built from schema.sql + 001 + 002 in line with
-- what the application code reads and writes, and closes several access-control gaps.

-- ── 1. Columns the code depends on but no earlier migration created ──────────────
ALTER TABLE public.pipelines
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

ALTER TABLE public.resumes
  ADD COLUMN IF NOT EXISTS storage_path text,
  ADD COLUMN IF NOT EXISTS file_name text,
  ADD COLUMN IF NOT EXISTS file_type text,
  ADD COLUMN IF NOT EXISTS file_size bigint,
  ADD COLUMN IF NOT EXISTS parsed_content text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

-- /api/upload/resume stores the file first and fills in the text when it is parsed.
ALTER TABLE public.resumes ALTER COLUMN content DROP NOT NULL;

ALTER TABLE public.analyses
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS last_notified_status text,
  ADD COLUMN IF NOT EXISTS last_notified_at timestamptz;

-- ── 2. Data integrity ────────────────────────────────────────────────────────────
-- NOT VALID: enforced for new writes without failing on any legacy rows.
ALTER TABLE public.applications DROP CONSTRAINT IF EXISTS applications_status_check;
ALTER TABLE public.applications ADD CONSTRAINT applications_status_check
  CHECK (status IN ('pending', 'screened', 'shortlisted', 'interview', 'interviewed', 'rejected', 'selected')) NOT VALID;

-- One application per candidate per pipeline. Skipped with a notice if legacy duplicates exist.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.applications
    WHERE candidate_id IS NOT NULL
    GROUP BY pipeline_id, candidate_id HAVING count(*) > 1
  ) THEN
    RAISE NOTICE 'Duplicate applications found: resolve them, then re-run to add uniq_application_per_candidate.';
  ELSE
    CREATE UNIQUE INDEX IF NOT EXISTS uniq_application_per_candidate
      ON public.applications (pipeline_id, candidate_id) WHERE candidate_id IS NOT NULL;
  END IF;
END $$;

-- ── 3. Indexes for the foreign keys used on every dashboard load ─────────────────
CREATE INDEX IF NOT EXISTS idx_pipelines_hr_id ON public.pipelines (hr_id);
CREATE INDEX IF NOT EXISTS idx_pipelines_active ON public.pipelines (is_active) WHERE is_active;
CREATE INDEX IF NOT EXISTS idx_applications_pipeline_id ON public.applications (pipeline_id);
CREATE INDEX IF NOT EXISTS idx_applications_candidate_id ON public.applications (candidate_id);
CREATE INDEX IF NOT EXISTS idx_applications_resume_id ON public.applications (resume_id);
CREATE INDEX IF NOT EXISTS idx_interviews_application_id ON public.interviews (application_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resumes_user_id ON public.resumes (user_id);
CREATE INDEX IF NOT EXISTS idx_analyses_resume_id ON public.analyses (resume_id);
CREATE INDEX IF NOT EXISTS idx_analyses_pipeline_id ON public.analyses (pipeline_id);

-- ── 4. Interview links: every open interview gets a token and an expiry ──────────
UPDATE public.interviews
SET interview_token = encode(gen_random_bytes(32), 'hex')
WHERE interview_token IS NULL AND COALESCE(is_used, false) = false;

UPDATE public.interviews
SET expires_at = now() + interval '72 hours'
WHERE expires_at IS NULL AND COALESCE(is_used, false) = false;

-- ── 5. public.users is created by the database, never by the browser ─────────────
-- The previous client-side insert had no RLS policy to allow it, so it failed silently
-- and any foreign key to public.users (for example pipelines.hr_id) then failed later.
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  requested_role text := NEW.raw_user_meta_data ->> 'role';
BEGIN
  IF NEW.email IS NULL THEN
    RETURN NEW;
  END IF;

  INSERT INTO public.users (id, email, role)
  VALUES (
    NEW.id,
    lower(NEW.email),
    CASE WHEN requested_role IN ('candidate', 'hr') THEN requested_role ELSE 'candidate' END
  )
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();

-- Backfill accounts created before the trigger existed.
INSERT INTO public.users (id, email, role)
SELECT
  au.id,
  lower(au.email),
  CASE WHEN au.raw_user_meta_data ->> 'role' IN ('candidate', 'hr')
       THEN au.raw_user_meta_data ->> 'role' ELSE 'candidate' END
FROM auth.users au
WHERE au.email IS NOT NULL
ON CONFLICT DO NOTHING;

-- ── 6. Row-level security: all writes go through validated server routes ─────────
-- users_self_update let any signed-in user change their own role.
DROP POLICY IF EXISTS users_self_update ON public.users;
-- These let a client insert an application with any score or status using the public key.
DROP POLICY IF EXISTS applications_owner_insert ON public.applications;
DROP POLICY IF EXISTS resumes_owner_or_guest_insert ON public.resumes;
-- This exposed the HR evaluation and transcript to the candidate being evaluated.
DROP POLICY IF EXISTS interviews_owner_select ON public.interviews;

-- ── 7. Storage: resumes and reports are private, served through signed URLs ──────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES
  ('resumes', 'resumes', false, 5242880, ARRAY[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]),
  ('reports', 'reports', false, 10485760, ARRAY['application/pdf'])
ON CONFLICT (id) DO UPDATE
SET public = false,
    file_size_limit = EXCLUDED.file_size_limit,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- ── 8. Trigger corrections ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.update_applications_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- `OLD.status != 'completed'` is NULL when the old status is NULL, so the timestamp was skipped.
CREATE OR REPLACE FUNCTION public.update_interviews_completed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.interview_status = 'completed' AND OLD.interview_status IS DISTINCT FROM 'completed' THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_pipelines_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS pipelines_update_timestamp ON public.pipelines;
CREATE TRIGGER pipelines_update_timestamp
BEFORE UPDATE ON public.pipelines
FOR EACH ROW EXECUTE FUNCTION public.update_pipelines_updated_at();
