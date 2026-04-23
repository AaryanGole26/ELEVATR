import React, { useState, useRef, useEffect } from 'react';
// Vite/ESM: use import.meta.env for environment vars in the browser.
// If no env var is set, default to local backend (common FastAPI port).
const API_ORIGIN: string =
  (import.meta.env.VITE_API_ORIGIN as string) ||
  (import.meta.env.REACT_APP_API_ORIGIN as string) ||
  'http://localhost:8000';

const getAuthHeaders = () => {
  try {
    const raw = window.localStorage.getItem('elevatr-auth-session');
    if (!raw) {
      return {};
    }
    const session = JSON.parse(raw) as { token?: string };
    return session.token
      ? { Authorization: `Bearer ${session.token}`, 'X-Auth-Token': session.token }
      : {};
  } catch {
    return {};
  }
};

import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Upload,
  FileText,
  Target,
  Zap,
  CheckCircle,
  ArrowRight,
  AlertCircle,
  Download,
  Link as LinkIcon,
  Search,
} from 'lucide-react';
import { jobDescriptionSample, randomMockAnalysisResult, getRandomMockAnalysisResult, getRandomJobSample } from '@/data/mockData';
import { useToast } from '@/hooks/use-toast';
import { type AnalysisResult as ApiAnalysisResult } from '@/lib/api';

const UploadPage = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const [jobRole, setJobRole] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [jobDescriptionUrl, setJobDescriptionUrl] = useState('');
  const [jobDescriptionFile, setJobDescriptionFile] = useState<File | null>(null);
  const [resumeFile, setResumeFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const jobDescFileRef = React.useRef<HTMLInputElement | null>(null);

  const [jobUrlLoading, setJobUrlLoading] = useState(false);
  const [jobUrlError, setJobUrlError] = useState<string | null>(null);
  const [jobUrlSuccess, setJobUrlSuccess] = useState(false);

  type AnalysisResult = ApiAnalysisResult;

  // ===== Fetch Job Details (explicit button click) =====
  const handleFetchJobDetails = async () => {
    if (!jobDescriptionUrl || !jobDescriptionUrl.trim()) {
      setJobUrlError('Please paste a job listing URL first.');
      return;
    }

    const url = jobDescriptionUrl.trim().toLowerCase();

    // Check blocked sites: LinkedIn & Glassdoor
    if (url.includes('linkedin.com')) {
      setJobUrlError(
        '📌 LinkedIn blocks automated extraction. Please copy-paste the job description directly from the LinkedIn job posting instead.'
      );
      return;
    }
    if (url.includes('glassdoor.')) {
      setJobUrlError(
        '📌 Glassdoor blocks automated extraction. Please copy-paste the job description directly into the Job Description box below instead.'
      );
      return;
    }

    setJobUrlLoading(true);
    setJobUrlError(null);
    setJobUrlSuccess(false);

    try {
      // Use the new /extract-job endpoint (JSON body)
      const resp = await fetch(`${API_ORIGIN}/extract-job`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: jobDescriptionUrl.trim() }),
      });

      const json = await resp.json().catch(() => null);

      if (!resp.ok || !json) {
        setJobUrlError('⚠️ Failed to fetch job posting. Please copy-paste the job description directly into the Job Description box below.');
        setJobUrlLoading(false);
        return;
      }

      if (json.source === 'error') {
        setJobUrlError(json.error || '⚠️ Could not extract job details from this link. Please copy-paste the job description directly into the Job Description box below.');
        setJobUrlLoading(false);
        return;
      }

      // Success — populate fields
      if (json.job_description) {
        setJobDescription(json.job_description);
      }
      if (json.job_title && !jobRole.trim()) {
        setJobRole(json.job_title);
      }

      setJobUrlSuccess(true);
      setJobUrlError(null);

      toast({
        title: 'Job details extracted!',
        description: `Extracted via ${json.source || 'auto'} method. You can edit the fields below.`,
      });
    } catch (err) {
      console.error('Job fetch error', err);
      setJobUrlError('⚠️ Network error while fetching job posting. Please copy-paste the job description directly into the Job Description box below.');
    } finally {
      setJobUrlLoading(false);
    }
  };

  // ===== File Upload Handlers =====
  const handleFileUpload = (file: File) => {
    if (file.type === 'application/pdf') {
      setResumeFile(file);
      toast({
        title: 'Resume uploaded successfully!',
        description: `${file.name} has been uploaded.`,
      });
    } else {
      toast({
        title: 'Invalid file type',
        description: 'Please upload a PDF file.',
        variant: 'destructive',
      });
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) handleFileUpload(files[0]);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) handleFileUpload(files[0]);
  };

  // ===== Sample Job Loader =====
  const handleUseSampleJob = () => {
    const sample = getRandomJobSample();
    setJobRole(sample.title);
    setJobDescription(sample.description);
    toast({
      title: 'Sample job loaded!',
      description: `Loaded sample for ${sample.title}`,
    });
  };

  // ===== Main Analyze Function =====
  const handleAnalyze = async () => {
    // require resume and job role; allow JD via paste, URL, or uploaded JD file
    if (!resumeFile || !jobRole.trim() || (!jobDescription.trim() && !jobDescriptionUrl.trim() && !jobDescriptionFile)) {
      toast({
        title: 'Missing information',
        description: 'Please upload a resume, enter a job role, and provide a job description (paste, URL, or upload).',
        variant: 'destructive',
      });
      return;
    }

    setIsAnalyzing(true);

    try {
      const form = new FormData();
      form.append('file', resumeFile);
      form.append('job_role', jobRole);

      if (jobDescription && jobDescription.trim()) {
        form.append('job_description_text', jobDescription.trim());
      } else if (jobDescriptionFile) {
        form.append('job_description_file', jobDescriptionFile);
      } else if (jobDescriptionUrl && jobDescriptionUrl.trim()) {
        form.append('job_description_url', jobDescriptionUrl.trim());
      }

      const resp = await fetch(`${API_ORIGIN}/analyze-resume`, {
        method: 'POST',
        headers: {
          ...getAuthHeaders(),
        },
        body: form,
      });

      const json = await resp.json().catch(() => null);

      let analysisResult: AnalysisResult;

      if (json && json.result) {
        analysisResult = json.result;
      } else {
        // fallback mock
        const randomMock = getRandomMockAnalysisResult();
        analysisResult = {
          match_percentage: randomMock.matchPercentage,
          estimated_time_saved_minutes: parseFloat(randomMock.timeSaved) * 60 || 10,
          matched_skills: randomMock.matchedSkills.map((s) => s.skill),
          missing_skills: randomMock.missingSkills.map((s) => s.skill),
          recommendations: randomMock.recommendations,
        };
      }

      setIsAnalyzing(false);

      toast({
        title: 'Analysis complete!',
        description: 'Your resume has been analyzed successfully.',
      });

      navigate('/results', { state: { result: analysisResult } });
    } catch (error) {
      console.error(error);
      setIsAnalyzing(false);
      toast({
        title: 'Error',
        description: 'Something went wrong while analyzing your resume.',
        variant: 'destructive',
      });
    }
  };

  // ===== JSX Layout =====
  return (
    <div className="min-h-screen pt-20 pb-16">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="text-center mb-12">
          <Badge variant="secondary" className="mb-4">
            <Target className="h-4 w-4 mr-2" />
            Step 1: Upload & Setup
          </Badge>
          <h1 className="text-4xl font-bold mb-4">Let's Optimize Your Resume</h1>
          <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
            Upload your resume and provide job details to get personalized AI insights that will
            help you land your dream role.
          </p>
        </div>

        <div className="grid lg:grid-cols-2 gap-8">
          {/* Left Column - Resume Upload */}
          <div className="space-y-6">
            <Card className="card-elevated border-0">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <FileText className="h-5 w-5 mr-2 text-primary" />
                  Upload Your Resume
                </CardTitle>
                <CardDescription>Upload your current resume in PDF format for AI analysis</CardDescription>
              </CardHeader>
              <CardContent>
                <div
                  className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors duration-200 ${
                    isDragging
                      ? 'border-primary bg-primary/5'
                      : resumeFile
                      ? 'border-success bg-success-light'
                      : 'border-border hover:border-primary/50'
                  }`}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                >
                  {resumeFile ? (
                    <div className="space-y-4">
                      <CheckCircle className="h-12 w-12 text-success mx-auto" />
                      <div>
                        <p className="font-medium text-success">{resumeFile.name}</p>
                        <p className="text-sm text-muted-foreground">
                          {(resumeFile.size / 1024 / 1024).toFixed(2)} MB
                        </p>
                      </div>
                      <Button variant="outline" size="sm" onClick={() => setResumeFile(null)}>
                        Remove File
                      </Button>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <Upload className="h-12 w-12 text-muted-foreground mx-auto" />
                      <p className="text-sm font-medium">
                        Drag and drop your resume here, or click to browse
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">PDF files only, max 10MB</p>
                      <input
                        type="file"
                        accept=".pdf"
                        onChange={handleFileInputChange}
                        className="hidden"
                        id="resume-upload"
                        aria-label="Upload resume PDF"
                      />
                      <Label htmlFor="resume-upload" className="cursor-pointer">
                        <Button variant="outline" asChild>
                          <span>Choose File</span>
                        </Button>
                      </Label>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Job Role Input */}
            <Card className="card-elevated border-0">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Target className="h-5 w-5 mr-2 text-primary" />
                  Target Job Role
                </CardTitle>
                <CardDescription>What position are you applying for?</CardDescription>
              </CardHeader>
              <CardContent>
                <Label htmlFor="job-role">Job Title</Label>
                <Input
                  id="job-role"
                  placeholder="e.g., Senior Frontend Developer, Product Manager"
                  value={jobRole}
                  onChange={(e) => setJobRole(e.target.value)}
                  className="mt-1"
                />
              </CardContent>
            </Card>
          </div>

          {/* Right Column - Job Description */}
          <div className="space-y-6">
            <Card className="card-elevated border-0">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <AlertCircle className="h-5 w-5 mr-2 text-primary" />
                  Job Description
                </CardTitle>
                <CardDescription>Paste the job description you're targeting</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex flex-col sm:flex-row gap-2">
                  <Button variant="outline" size="sm" onClick={handleUseSampleJob} className="flex-1">
                    <Download className="h-4 w-4 mr-2" />
                    Use Sample Job
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {/* Job Link Input (Optional) */}
                  <div>
                    <Label htmlFor="job-link" className="flex items-center gap-2">
                      <LinkIcon className="h-4 w-4" />
                      Paste Job Link (Optional)
                    </Label>
                    <div className="flex gap-2 mt-1">
                      <Input
                        id="job-link"
                        placeholder="e.g., https://www.indeed.com/viewjob?jk=..."
                        value={jobDescriptionUrl}
                        onChange={(e) => {
                          setJobDescriptionUrl(e.target.value);
                          setJobUrlError(null);
                          setJobUrlSuccess(false);
                        }}
                        disabled={jobUrlLoading}
                        className="flex-1"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleFetchJobDetails}
                        disabled={jobUrlLoading || !jobDescriptionUrl.trim()}
                        className="whitespace-nowrap"
                      >
                        {jobUrlLoading ? (
                          <>
                            <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-2" />
                            Fetching...
                          </>
                        ) : (
                          <>
                            <Search className="h-4 w-4 mr-1" />
                            Fetch Job Details
                          </>
                        )}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      💡 Works with Indeed, Naukri, and other job sites. For LinkedIn or Glassdoor, copy-paste the job description below instead.
                    </p>
                    {jobUrlLoading && (
                      <p className="text-sm text-muted-foreground mt-2 flex items-center">
                        <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-primary mr-2" />
                        Extracting job details (this may take a few seconds)...
                      </p>
                    )}
                    {jobUrlError && (
                      <p className="text-sm text-red-500 mt-2 flex items-start gap-2">
                        <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                        <span>{jobUrlError}</span>
                      </p>
                    )}
                    {jobUrlSuccess && !jobUrlError && !jobUrlLoading && (
                      <p className="text-sm text-green-600 mt-2 flex items-center">
                        <CheckCircle className="h-4 w-4 mr-2" />
                        Job details loaded successfully! You can edit the fields below.
                      </p>
                    )}
                  </div>

                  {/* Job Description Textarea */}
                  <div>
                    <Label htmlFor="job-description">Or paste job description text</Label>
                    <Textarea
                      id="job-description"
                      placeholder="Paste the complete job description here..."
                      value={jobDescription}
                      onChange={(e) => setJobDescription(e.target.value)}
                      rows={8}
                      className="mt-1 resize-none"
                    />
                    <p className="text-xs text-muted-foreground mt-2">
                      {jobDescription.length > 0 && `${jobDescription.length} characters entered`}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Analysis Button */}
        <div className="mt-12 text-center">
          <Card className="card-elevated border-0 max-w-md mx-auto">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex items-center justify-center">
                  <Zap className="h-8 w-8 text-primary mr-2" />
                  <span className="text-lg font-semibold">Ready to Analyze</span>
                </div>

                <p className="text-sm text-muted-foreground">
                  Our AI will analyze your resume against the job requirements and provide detailed
                  insights in seconds.
                </p>

                <Button
                  variant="gradient"
                  size="lg"
                  onClick={handleAnalyze}
                  disabled={isAnalyzing || !resumeFile || !jobRole.trim() || (!jobDescription.trim() && !jobDescriptionUrl.trim() && !jobDescriptionFile)}
                  className="w-full"
                >
                  {isAnalyzing ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2" />
                      Analyzing...
                    </>
                  ) : (
                    <>
                      <Zap className="h-5 w-5 mr-2" />
                      Analyze Resume
                      <ArrowRight className="h-5 w-5 ml-2" />
                    </>
                  )}
                </Button>

                {(!resumeFile || !jobRole.trim() || !jobDescription.trim()) && (
                  <p className="text-xs text-muted-foreground">
                    Please complete all fields above to proceed
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
};

export default UploadPage;
