-- Migration: Add interview completion tracking fields
-- Required for the video interview data flow to work properly

-- Add missing fields to interviews table
ALTER TABLE public.interviews
ADD COLUMN IF NOT EXISTS interview_status text DEFAULT 'pending' CHECK (interview_status IN ('pending', 'in_progress', 'completed', 'failed')),
ADD COLUMN IF NOT EXISTS completed_at timestamptz,
ADD COLUMN IF NOT EXISTS is_used boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS interview_token text UNIQUE,
ADD COLUMN IF NOT EXISTS expires_at timestamptz;

-- Add missing fields to applications table  
ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS email text,
ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now(),
ADD COLUMN IF NOT EXISTS latest_interview_score int CHECK (latest_interview_score IS NULL OR (latest_interview_score BETWEEN 0 AND 100)),
ADD COLUMN IF NOT EXISTS latest_report_pdf_url text;

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_interviews_is_used ON public.interviews(is_used);
CREATE INDEX IF NOT EXISTS idx_interviews_status ON public.interviews(interview_status);
CREATE INDEX IF NOT EXISTS idx_interviews_token ON public.interviews(interview_token);
CREATE INDEX IF NOT EXISTS idx_interviews_expires_at ON public.interviews(expires_at);
CREATE INDEX IF NOT EXISTS idx_applications_updated_at ON public.applications(updated_at);
CREATE INDEX IF NOT EXISTS idx_applications_status ON public.applications(status);

-- Update existing applications to have email if candidate_id is set
UPDATE public.applications 
SET email = u.email
FROM public.users u
WHERE applications.candidate_id = u.id AND applications.email IS NULL;

-- Create trigger to auto-update applications.updated_at on any change
CREATE OR REPLACE FUNCTION update_applications_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS applications_update_timestamp ON public.applications;
CREATE TRIGGER applications_update_timestamp
BEFORE UPDATE ON public.applications
FOR EACH ROW
EXECUTE FUNCTION update_applications_updated_at();

-- Create trigger to auto-update interviews.completed_at when status changes to completed
CREATE OR REPLACE FUNCTION update_interviews_completed_at()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.interview_status = 'completed' AND OLD.interview_status != 'completed' THEN
    NEW.completed_at = now();
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS interviews_update_completed_at ON public.interviews;
CREATE TRIGGER interviews_update_completed_at
BEFORE UPDATE ON public.interviews
FOR EACH ROW
EXECUTE FUNCTION update_interviews_completed_at();

-- Add comment to explain the fields
COMMENT ON COLUMN public.interviews.interview_status IS 'Track interview lifecycle: pending, in_progress, completed, failed';
COMMENT ON COLUMN public.interviews.completed_at IS 'Timestamp when interview was completed';
COMMENT ON COLUMN public.interviews.is_used IS 'One-time use flag: true after interview is taken';
COMMENT ON COLUMN public.interviews.interview_token IS 'Unique token for this interview link (72hr expiry)';
COMMENT ON COLUMN public.interviews.expires_at IS 'When the interview link expires';
COMMENT ON COLUMN public.applications.email IS 'Candidate email (denormalized from users table for queries)';
COMMENT ON COLUMN public.applications.updated_at IS 'Track when application record was last modified';
COMMENT ON COLUMN public.applications.latest_interview_score IS 'Most recent AI interview score (0-100)';
COMMENT ON COLUMN public.applications.latest_report_pdf_url IS 'URL to most recent interview report PDF';
