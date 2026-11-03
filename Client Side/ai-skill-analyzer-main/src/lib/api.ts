// Lightweight API client for ELEVATR backend
// Endpoints:
// - POST /analyze-resume (multipart: file, job_role, job_description?)
// - GET  /export-pdf

export type AnalysisResult = {
  match_percentage: number;
  matched_skills: string[];
  missing_skills: string[];
  recommendations: string[];
  estimated_time_saved_minutes: number;
};

export type AnalyzeResumeResponse = {
  result: AnalysisResult;
};

// Set VITE_BACKEND_URL for deployed environments. The local default only applies in development.
const DEFAULT_BASE_URL: string =
  import.meta.env.VITE_BACKEND_URL || (import.meta.env.DEV ? "http://127.0.0.1:8000" : "");

export const getBackendBaseUrl = () => DEFAULT_BASE_URL.replace(/\/$/, "");

export async function analyzeResume(params: {
  file: File;
  jobRole: string;
  jobDescription?: string;
}): Promise<AnalyzeResumeResponse> {
  const form = new FormData();
  form.append("file", params.file);
  form.append("job_role", params.jobRole);
  if (params.jobDescription && params.jobDescription.trim()) {
    form.append("job_description", params.jobDescription.trim());
  }

  const base = getBackendBaseUrl();
  const url = base ? `${base}/analyze-resume` : "/analyze-resume";
  
  try {
    const res = await fetch(url, {
      method: "POST",
      body: form,
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error("API Error:", res.status, text);
      throw new Error(`Analyze failed (${res.status}): ${text || res.statusText}`);
    }
    return res.json();
  } catch (error) {
    console.error("Network Error:", error);
    if (error instanceof TypeError && error.message.includes("Failed to fetch")) {
      throw new Error(`Cannot connect to backend at ${url}. Please check if the backend is running.`);
    }
    throw error;
  }
}

export async function exportPdf(result: AnalysisResult): Promise<Blob> {
  const base = getBackendBaseUrl();
  const url = base ? `${base}/export-pdf` : "/export-pdf";

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ result, title: "Resume Analysis" }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Export failed (${res.status}): ${text || res.statusText}`);
  }
  
  // Return the PDF as a blob
  return res.blob();
}

// BuildCV API functions
export async function listTemplates(): Promise<{ templates: string[] }> {
  const base = getBackendBaseUrl();
  const url = base ? `${base}/templates` : "/templates";
  
  const res = await fetch(url);
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Templates fetch failed (${res.status}): ${text || res.statusText}`);
  }
  
  return res.json();
}

export async function uploadResume(file: File): Promise<any> {
  const formData = new FormData();
  formData.append("file", file);
  
  const base = getBackendBaseUrl();
  const url = base ? `${base}/upload_resume` : "/upload_resume";
  
  const res = await fetch(url, {
    method: "POST",
    body: formData,
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Upload failed (${res.status}): ${text || res.statusText}`);
  }
  
  return res.json();
}

export async function generateResume(data: {
  template: string;
  data: any;
  format: "pdf" | "html";
}): Promise<Blob | string> {
  const base = getBackendBaseUrl();
  const url = base ? `${base}/generate_resume` : "/generate_resume";
  
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Generation failed (${res.status}): ${text || res.statusText}`);
  }
  
  return data.format === "pdf" ? res.blob() : res.text();
}

export async function sendChatMessage(messages: Array<{ role: string; content: string }>): Promise<string> {
  const res = await fetch(`${getBackendBaseUrl()}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error(data?.error || "The assistant is unavailable right now.");
  }
  return data.reply;
}
