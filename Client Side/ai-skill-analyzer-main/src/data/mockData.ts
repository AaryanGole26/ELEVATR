// =======================
// 📄 Mock Data Definitions
// =======================

export interface SkillMatch {
  skill: string;
  proficiency: 'Beginner' | 'Intermediate' | 'Advanced' | 'Expert';
  isMatched: boolean;
  importance: 'High' | 'Medium' | 'Low';
}

export interface AnalysisResult {
  jobRole: string;
  company: string;
  matchPercentage: number;
  timeSaved: string;
  reportDate: string;
  matchedSkills: SkillMatch[];
  missingSkills: SkillMatch[];
  recommendations: string[];
  overallScore: {
    technical: number;
    experience: number;
    education: number;
    certifications: number;
  };
  atsScore?: {
    overall_ats_score: number;
    keyword_density_score: number;
    skills_match_score: number;
    structure_score: number;
    experience_score: number;
    education_score: number;
    ats_grade: string;
    ats_recommendations: string[];
  };
}

// =======================
// 🧩 Mock Analysis Results
// =======================

// 1️⃣ Frontend Developer
export const mockAnalysisResult: AnalysisResult = {
  jobRole: 'Senior Frontend Developer',
  company: 'TechCorp Inc.',
  matchPercentage: 87,
  timeSaved: '2.5 hours',
  reportDate: new Date().toLocaleDateString(),
  matchedSkills: [
    { skill: 'React.js', proficiency: 'Expert', isMatched: true, importance: 'High' },
    { skill: 'TypeScript', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'JavaScript ES6+', proficiency: 'Expert', isMatched: true, importance: 'High' },
    { skill: 'CSS3 & Tailwind', proficiency: 'Advanced', isMatched: true, importance: 'Medium' },
    { skill: 'Git Version Control', proficiency: 'Advanced', isMatched: true, importance: 'Medium' },
    { skill: 'Responsive Design', proficiency: 'Expert', isMatched: true, importance: 'High' },
    { skill: 'RESTful APIs', proficiency: 'Advanced', isMatched: true, importance: 'Medium' },
    { skill: 'Agile/Scrum', proficiency: 'Intermediate', isMatched: true, importance: 'Medium' },
  ],
  missingSkills: [
    { skill: 'Next.js', proficiency: 'Beginner', isMatched: false, importance: 'High' },
    { skill: 'GraphQL', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
    { skill: 'Docker', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
    { skill: 'Testing (Jest/Cypress)', proficiency: 'Intermediate', isMatched: false, importance: 'High' },
    { skill: 'AWS Services', proficiency: 'Beginner', isMatched: false, importance: 'Low' },
  ],
  recommendations: [
    'Learn Next.js framework - highly valued for this role and commonly used at TechCorp.',
    'Strengthen testing skills with Jest and Cypress - critical for senior positions.',
    'Gain basic Docker knowledge for containerization and deployment.',
    'Consider GraphQL tutorials to complement your REST API experience.',
    'Highlight your React expertise more prominently in your resume summary.',
  ],
  overallScore: { technical: 85, experience: 92, education: 78, certifications: 65 },
  atsScore: {
    overall_ats_score: 78.5,
    structure_score: 85,
    keyword_density_score: 80,
    skills_match_score: 82,
    experience_score: 88,
    education_score: 76,
    ats_grade: 'B+',
    ats_recommendations: [
      'Add a Summary section to improve readability.',
      'Include job-specific keywords more frequently.',
    ],
  },
};

// 2️⃣ Backend Developer
export const mockAnalysisResult_Backend: AnalysisResult = {
  jobRole: 'Backend Developer',
  company: 'CodeSphere Technologies',
  matchPercentage: 79,
  timeSaved: '2.1 hours',
  reportDate: new Date().toLocaleDateString(),
  matchedSkills: [
    { skill: 'Node.js', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'Express.js', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'MongoDB', proficiency: 'Intermediate', isMatched: true, importance: 'Medium' },
    { skill: 'REST APIs', proficiency: 'Expert', isMatched: true, importance: 'High' },
  ],
  missingSkills: [
    { skill: 'GraphQL', proficiency: 'Beginner', isMatched: false, importance: 'High' },
    { skill: 'Docker', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
    { skill: 'CI/CD Pipelines', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
  ],
  recommendations: [
    'Learn GraphQL for efficient query management.',
    'Use Docker for reproducible environments.',
    'Set up Jenkins or GitHub Actions for CI/CD automation.',
  ],
  overallScore: { technical: 80, experience: 78, education: 70, certifications: 60 },
  atsScore: {
    overall_ats_score: 74,
    keyword_density_score: 75,
    skills_match_score: 77,
    structure_score: 80,
    experience_score: 76,
    education_score: 70,
    ats_grade: 'B',
    ats_recommendations: ['Add performance metrics for backend improvements.'],
  },
};

// 3️⃣ Data Scientist
export const mockAnalysisResult_DataScience: AnalysisResult = {
  jobRole: 'Data Scientist',
  company: 'InnoData Analytics',
  matchPercentage: 90,
  timeSaved: '3 hours',
  reportDate: new Date().toLocaleDateString(),
  matchedSkills: [
    { skill: 'Python', proficiency: 'Expert', isMatched: true, importance: 'High' },
    { skill: 'R Programming', proficiency: 'Intermediate', isMatched: true, importance: 'Medium' },
    { skill: 'Machine Learning', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'SQL', proficiency: 'Advanced', isMatched: true, importance: 'High' },
  ],
  missingSkills: [
    { skill: 'Power BI', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
    { skill: 'BigQuery', proficiency: 'Beginner', isMatched: false, importance: 'Low' },
  ],
  recommendations: [
    'Learn Power BI or Tableau for advanced visualization.',
    'Add data storytelling and presentation experience.',
  ],
  overallScore: { technical: 92, experience: 88, education: 90, certifications: 75 },
  atsScore: {
    overall_ats_score: 84,
    keyword_density_score: 85,
    skills_match_score: 87,
    structure_score: 88,
    experience_score: 82,
    education_score: 80,
    ats_grade: 'A',
    ats_recommendations: ['Add measurable outcomes in projects.'],
  },
};

// 4️⃣ AI/ML Engineer
export const mockAnalysisResult_ML: AnalysisResult = {
  jobRole: 'Machine Learning Engineer',
  company: 'NeuraTech AI Labs',
  matchPercentage: 83,
  timeSaved: '3.5 hours',
  reportDate: new Date().toLocaleDateString(),
  matchedSkills: [
    { skill: 'TensorFlow', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'Scikit-learn', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'Python', proficiency: 'Expert', isMatched: true, importance: 'High' },
    { skill: 'Pandas', proficiency: 'Expert', isMatched: true, importance: 'Medium' },
  ],
  missingSkills: [
    { skill: 'PyTorch', proficiency: 'Beginner', isMatched: false, importance: 'High' },
    { skill: 'MLOps', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
    { skill: 'Cloud Deployment', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
  ],
  recommendations: [
    'Learn PyTorch for experimentation flexibility.',
    'Study MLOps pipelines for deployment and monitoring.',
    'Practice cloud deployment on AWS or GCP.',
  ],
  overallScore: { technical: 88, experience: 80, education: 84, certifications: 70 },
  atsScore: {
    overall_ats_score: 82,
    keyword_density_score: 84,
    skills_match_score: 83,
    structure_score: 85,
    experience_score: 79,
    education_score: 78,
    ats_grade: 'A-',
    ats_recommendations: ['Add deep learning architecture details.'],
  },
};

// 5️⃣ Cybersecurity Analyst
export const mockAnalysisResult_Cyber: AnalysisResult = {
  jobRole: 'Cybersecurity Analyst',
  company: 'SecureNet Global',
  matchPercentage: 77,
  timeSaved: '2 hours',
  reportDate: new Date().toLocaleDateString(),
  matchedSkills: [
    { skill: 'Network Security', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'Risk Assessment', proficiency: 'Intermediate', isMatched: true, importance: 'Medium' },
    { skill: 'SIEM (Splunk)', proficiency: 'Advanced', isMatched: true, importance: 'High' },
  ],
  missingSkills: [
    { skill: 'Penetration Testing', proficiency: 'Beginner', isMatched: false, importance: 'High' },
    { skill: 'Ethical Hacking', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
  ],
  recommendations: [
    'Obtain CEH or CompTIA Security+ certification.',
    'Add measurable results of previous security projects.',
  ],
  overallScore: { technical: 81, experience: 75, education: 70, certifications: 60 },
  atsScore: {
    overall_ats_score: 74.5,
    keyword_density_score: 76,
    skills_match_score: 75,
    structure_score: 78,
    experience_score: 73,
    education_score: 70,
    ats_grade: 'B',
    ats_recommendations: ['Include frameworks like ISO 27001 or NIST.'],
  },
};

// 6️⃣ Product Manager
export const mockAnalysisResult_PM: AnalysisResult = {
  jobRole: 'Product Manager',
  company: 'Innovexa Solutions',
  matchPercentage: 84,
  timeSaved: '2.8 hours',
  reportDate: new Date().toLocaleDateString(),
  matchedSkills: [
    { skill: 'Product Strategy', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'Agile Management', proficiency: 'Advanced', isMatched: true, importance: 'High' },
    { skill: 'Market Research', proficiency: 'Intermediate', isMatched: true, importance: 'Medium' },
  ],
  missingSkills: [
    { skill: 'SQL', proficiency: 'Beginner', isMatched: false, importance: 'Medium' },
    { skill: 'A/B Testing', proficiency: 'Beginner', isMatched: false, importance: 'High' },
  ],
  recommendations: [
    'Add measurable KPIs for previous products.',
    'Learn A/B testing and basic SQL queries.',
  ],
  overallScore: { technical: 72, experience: 88, education: 80, certifications: 68 },
  atsScore: {
    overall_ats_score: 80,
    keyword_density_score: 82,
    skills_match_score: 79,
    structure_score: 83,
    experience_score: 81,
    education_score: 75,
    ats_grade: 'A-',
    ats_recommendations: ['Highlight quantifiable outcomes like user growth.'],
  },
};

// =======================
// 🎲 Randomized Export
// =======================
const mockSamples: AnalysisResult[] = [
  mockAnalysisResult,
  mockAnalysisResult_Backend,
  mockAnalysisResult_DataScience,
  mockAnalysisResult_ML,
  mockAnalysisResult_Cyber,
  mockAnalysisResult_PM,
];

export const randomMockAnalysisResult =
  mockSamples[Math.floor(Math.random() * mockSamples.length)];

export function getRandomMockAnalysisResult() {
  const randomIndex = Math.floor(Math.random() * mockSamples.length);
  return mockSamples[randomIndex];
}

// =======================
// 📜 Job Description + Features
// =======================
export const jobDescriptionSample = `
Role: Senior Frontend Developer

Responsibilities:
• Build responsive web apps with React.js + Next.js
• Implement state using Redux/RTK or React Query; component styling with Tailwind CSS
• Write robust TypeScript; add unit/e2e tests with Jest/Cypress
• Integrate REST and GraphQL APIs; handle auth and error states
• Collaborate with designers and backend engineers in an Agile squad

Requirements:
• 4+ years React, 2+ years TypeScript, production Next.js experience
• Strong HTML5/CSS3, accessibility and performance optimization
• CI/CD familiarity (GitHub Actions) and Git workflows

Tech Stack Keywords: React, Next.js, TypeScript, Redux, React Query, Tailwind CSS, Jest, Cypress, REST, GraphQL, Git, CI/CD, Docker, AWS`;

export const jobSamples: { title: string; description: string }[] = [
  {
    title: 'Senior Frontend Developer',
    description: `Role: Senior Frontend Developer

Responsibilities:
• Build SPA/SSR apps using React.js + Next.js
• State with Redux/RTK or React Query; style with Tailwind CSS
• Type-safe code in TypeScript; tests with Jest/Cypress
• Integrate REST/GraphQL APIs; form validation with Zod/React Hook Form
• Optimize Lighthouse performance and accessibility

Requirements:
• 4+ years React, 2+ years TypeScript; shipping Next.js apps
• Solid Git, code review, Agile rituals

Tech Stack Keywords: React, Next.js, TypeScript, Redux, Tailwind CSS, Jest, Cypress, REST, GraphQL, Git, CI/CD, Docker, AWS`,
  },
  {
    title: 'Backend Developer',
    description: `Role: Backend Developer

Responsibilities:
• Design REST/GraphQL APIs with Node.js (Express/Fastify)
• Model data in PostgreSQL and MongoDB; write performant queries
• Implement auth, rate limiting, logging, tracing
• Containerize with Docker; CI/CD via GitHub Actions

Requirements:
• Node.js production experience, API security and testing (Jest/Supertest)
• Familiarity with Redis caching and message queues (RabbitMQ/Kafka)

Tech Stack Keywords: Node.js, Express, Fastify, PostgreSQL, MongoDB, Redis, GraphQL, REST, Docker, Kubernetes, GitHub Actions, JWT, OpenAPI`,
  },
  {
    title: 'Data Scientist',
    description: `Role: Data Scientist

Responsibilities:
• Build predictive models with Python (scikit‑learn, XGBoost)
• Feature engineering, data cleaning; SQL for extraction
• Experiment tracking and model evaluation
• Communicate insights with notebooks and dashboards

Requirements:
• Strong statistics, hypothesis testing, A/B testing
• Experience with pandas, NumPy, matplotlib/seaborn/Plotly

Tech Stack Keywords: Python, scikit‑learn, XGBoost, pandas, NumPy, SQL, Jupyter, MLflow, Airflow, Tableau/Power BI`,
  },
  {
    title: 'Machine Learning Engineer',
    description: `Role: Machine Learning Engineer

Responsibilities:
• Train and deploy DL models (PyTorch/TensorFlow)
• Build MLOps pipelines (data/versioning, CI/CD, monitoring)
• Optimize inference with ONNX/TensorRT; serve with FastAPI

Requirements:
• Experience with cloud deployment (AWS/GCP) and Docker/K8s
• Strong Python engineering and testing

Tech Stack Keywords: PyTorch, TensorFlow, FastAPI, ONNX, TensorRT, Docker, Kubernetes, AWS/GCP, MLflow, Airflow`,
  },
  {
    title: 'Cybersecurity Analyst',
    description: `Role: Cybersecurity Analyst

Responsibilities:
• Monitor and respond to security incidents
• Configure SIEM (Splunk) rules and dashboards
• Perform vulnerability scans and risk assessments

Requirements:
• Understanding of OWASP Top 10, network protocols, IAM
• Preferred certifications: Security+/CEH

Tech Stack Keywords: SIEM, Splunk, IDS/IPS, OWASP, NIST, ISO 27001, Vulnerability Scanning, Firewalls, IAM`,
  },
  {
    title: 'Product Manager',
    description: `Role: Product Manager

Responsibilities:
• Define strategy/roadmap, write PRDs/user stories
• Prioritize backlog; drive discovery with customers
• Partner with design/engineering to deliver MVPs

Requirements:
• Metrics mindset (activation, retention, revenue) and A/B testing
• SQL basics and analytics tools (Mixpanel/GA)

Tech Stack Keywords: Product Strategy, PRD, Agile, Scrum, A/B Testing, SQL, Analytics, Stakeholder Management`,
  },
];

export function getRandomJobSample() {
  const idx = Math.floor(Math.random() * jobSamples.length);
  return jobSamples[idx];
}

export const featuresData = [
  {
    title: 'AI-Powered Analysis',
    description: 'Advanced machine learning for precise resume optimization',
    icon: '🎯',
    benefits: ['95% accuracy rate', 'Industry-specific insights', 'ATS compatibility check'],
  },
  {
    title: 'Instant Results',
    description: 'Complete analysis in under 60 seconds',
    icon: '⚡',
    benefits: ['Real-time processing', 'Detailed breakdown', 'Export to PDF'],
  },
  {
    title: 'Skill Gap Analysis',
    description: 'Identify missing skills and get learning recommendations',
    icon: '📊',
    benefits: ['Gap identification', 'Learning paths', 'Progress tracking'],
  },
];

export const testimonials = [
  {
    name: 'Sarah Chen',
    role: 'Software Engineer at Google',
    content:
      'ELEVATR helped me identify key skills I was missing for my dream job. Got hired within 3 weeks!',
    avatar: '👩‍💻',
    rating: 5,
  },
  {
    name: 'Michael Rodriguez',
    role: 'Product Manager at Microsoft',
    content:
      'The AI analysis is incredibly accurate. It saved me hours of resume optimization work.',
    avatar: '👨‍💼',
    rating: 5,
  },
  {
    name: 'Emily Johnson',
    role: 'UX Designer at Airbnb',
    content:
      'The personalized recommendations were spot-on. My interview rate increased by 300%!',
    avatar: '👩‍🎨',
    rating: 5,
  },
];
