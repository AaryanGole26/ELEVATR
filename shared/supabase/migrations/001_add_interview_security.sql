-- Migration: Add security fields to interviews table
-- This allows for secure, time-limited, one-time-use interview links

ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS interview_token text UNIQUE;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS expires_at timestamptz;
ALTER TABLE public.interviews ADD COLUMN IF NOT EXISTS is_used boolean DEFAULT false;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_interviews_token ON public.interviews(interview_token);
CREATE INDEX IF NOT EXISTS idx_interviews_expiry ON public.interviews(expires_at);

-- Update existing policies to handle the new fields
DROP POLICY IF EXISTS interviews_owner_select ON public.interviews;
CREATE POLICY interviews_owner_select ON public.interviews
FOR SELECT USING (
  auth.uid() = (
    SELECT candidate_id FROM public.applications WHERE id = application_id
  )
);

-- Allow HR to view all interviews (will be enforced in code)
DROP POLICY IF EXISTS interviews_hr_select ON public.interviews;
CREATE POLICY interviews_hr_select ON public.interviews
FOR SELECT USING (
  auth.uid() IN (
    SELECT hr_id FROM public.pipelines 
    WHERE id = (
      SELECT pipeline_id FROM public.applications 
      WHERE id = application_id
    )
  )
);
