// Types and interfaces for resume data structure

export interface PersonalInfo {
  name: string;
  email: string;
  phone: string;
  location: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface Education {
  id: string;
  degree: string;
  institution: string;
  location: string;
  startDate: string;
  endDate: string;
  gpa?: string;
  description?: string;
}

export interface WorkExperience {
  id: string;
  title: string;
  company: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  achievements?: string[];
}

export interface Project {
  id: string;
  name: string;
  description: string;
  technologies: string[];
  startDate: string;
  endDate: string;
  url?: string;
  github?: string;
}

export interface Skill {
  id: string;
  name: string;
  category: 'technical' | 'soft' | 'language' | 'other';
  proficiency: 'beginner' | 'intermediate' | 'advanced' | 'expert';
}

export interface Certification {
  id: string;
  name: string;
  issuer: string;
  date: string;
  expiryDate?: string;
  credentialId?: string;
  url?: string;
}

export interface ResumeData {
  personalInfo: PersonalInfo;
  summary: string;
  education: Education[];
  workExperience: WorkExperience[];
  projects: Project[];
  skills: Skill[];
  certifications: Certification[];
  template: string;
  aiEnhancement: boolean;
}

export interface ResumeTemplate {
  id: string;
  name: string;
  description: string;
  preview: string;
}

export interface ParsedResumeData {
  parsed: Partial<ResumeData>;
  rawText: string;
  confidence: number;
}

export interface GenerateResumeRequest {
  template: string;
  data: ResumeData;
  format: 'pdf' | 'html';
}

export interface GenerateResumeResponse {
  success: boolean;
  message?: string;
  data?: Blob | string;
  filename?: string;
}
