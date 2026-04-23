import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Brain,
  Target,
  FileText,
  TrendingUp,
  Clock,
  Download,
  CheckCircle,
  Sparkles,
  Rocket,
  Video,
  BarChart3,
  Users,
  Shield,
  Zap,
  ArrowRight,
} from 'lucide-react';

const FeaturesPage = () => {
  const modules = [
    {
      icon: Target,
      title: 'AI Resume Analyzer',
      badge: 'Candidate',
      badgeColor: 'bg-blue-500/10 text-blue-700',
      description:
        'Upload your resume and paste a job description — our AI instantly scores the match, detects missing skills, and gives you exact improvements to make.',
      features: [
        'ATS compatibility scoring',
        'NLP-powered skill extraction',
        'Missing keyword detection',
        'Personalized improvement tips',
        'Instant results in < 60 seconds',
      ],
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
      path: '/upload',
      cta: 'Try Resume Analyzer',
    },
    {
      icon: FileText,
      title: 'CV Builder',
      badge: 'Candidate',
      badgeColor: 'bg-purple-500/10 text-purple-700',
      description:
        'Build a professional, ATS-ready resume from scratch using editable templates and a live preview editor. Export to PDF in one click.',
      features: [
        'Professional templates',
        'Live preview editor',
        'PDF export',
        'ATS-friendly formatting',
        'Section-by-section guidance',
      ],
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-600',
      path: '/buildcv',
      cta: 'Open CV Builder',
    },
    {
      icon: Video,
      title: 'AI Video Interviewer',
      badge: 'Both',
      badgeColor: 'bg-emerald-500/10 text-emerald-700',
      description:
        'Candidates receive a secure interview link and complete an AI-led video interview with personalized, role-specific questions. Reports are auto-generated.',
      features: [
        'JD-aware personalized questions',
        'Browser-based speech recognition',
        'Anti-repeat question logic',
        'AI-scored PDF report',
        'Callback to HR dashboard',
      ],
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600',
      path: 'http://localhost:3000/',
      cta: 'Part of HR Flow',
    },
    {
      icon: BarChart3,
      title: 'HR Pipeline',
      badge: 'HR',
      badgeColor: 'bg-orange-500/10 text-orange-700',
      description:
        'HR teams create JD-driven hiring pipelines, bulk screen resumes by AI score, send interview links, and finalize decisions — all from one dashboard.',
      features: [
        'JD + threshold-based screening',
        'Bulk resume PDF ingestion',
        'Automated interview invites',
        'AI interview score finalization',
        'Status mail per hiring stage',
      ],
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-600',
      path: 'http://localhost:3000/',
      cta: 'Open HR Dashboard',
    },
  ];

  const additionalFeatures = [
    {
      icon: Clock,
      title: 'Real-time Processing',
      description: 'Resume analysis results in under 60 seconds with optimized AI inference.',
    },
    {
      icon: Download,
      title: 'PDF Report Export',
      description: 'Interview evaluation reports and CV exports saved as structured PDFs.',
    },
    {
      icon: Shield,
      title: 'Secure by Design',
      description: 'Interview links are token-secured, single-use, and expire after 72 hours.',
    },
    {
      icon: Users,
      title: 'Supabase Auth',
      description: 'Role-based auth (HR vs candidate) with Row-Level Security on all data.',
    },
    {
      icon: Brain,
      title: 'Gemini AI Core',
      description: 'Powered by Google Generative AI for screening, evaluation, and question generation.',
    },
    {
      icon: TrendingUp,
      title: 'End-to-End Pipeline',
      description: 'One unified system from first CV upload to final hiring decision and email.',
    },
  ];

  return (
    <div className="min-h-screen pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <div className="text-center mb-20">
          <Badge variant="secondary" className="mb-6 gap-1.5">
            <Sparkles className="h-3.5 w-3.5" />
            Platform Features
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
            Everything you need to{' '}
            <span className="hero-text">hire smarter</span>
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            ELEVATR is a unified AI hiring platform — four interconnected modules that power
            the entire journey from resume to final offer, for both candidates and HR teams.
          </p>
        </div>

        {/* 4 Modules */}
        <div className="mb-24">
          <h2 className="text-2xl font-bold mb-2 text-center">Four Core Modules</h2>
          <p className="text-muted-foreground text-center mb-12">
            Each tool is built to work standalone and as part of the connected hiring pipeline.
          </p>
          <div className="grid md:grid-cols-2 gap-7">
            {modules.map((mod, index) => (
              <Card key={index} className="card-elevated border-0 group hover:-translate-y-1 transition-all duration-300">
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl ${mod.iconBg} flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform duration-300`}>
                      <mod.icon className={`h-6 w-6 ${mod.iconColor}`} />
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <CardTitle className="text-xl">{mod.title}</CardTitle>
                        <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${mod.badgeColor}`}>
                          {mod.badge}
                        </span>
                      </div>
                      <CardDescription className="leading-relaxed">{mod.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <ul className="space-y-2 mb-5">
                    {mod.features.map((f, i) => (
                      <li key={i} className="flex items-center text-sm text-muted-foreground gap-2">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        {f}
                      </li>
                    ))}
                  </ul>
                  <Link
                    to={mod.path}
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all group/cta"
                  >
                    {mod.cta}
                    <ArrowRight className="h-4 w-4 group-hover/cta:translate-x-0.5 transition-transform" />
                  </Link>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* Additional Features Grid */}
        <div className="mb-24">
          <h2 className="text-2xl font-bold text-center mb-2">Built-in Platform Capabilities</h2>
          <p className="text-muted-foreground text-center mb-12">
            Underlying infrastructure that powers a reliable, secure, end-to-end experience.
          </p>
          <div className="grid md:grid-cols-3 gap-6">
            {additionalFeatures.map((feat, i) => (
              <div key={i} className="card-elevated rounded-2xl p-7 flex gap-4 group hover:-translate-y-1 transition-all duration-300">
                <div className="w-11 h-11 bg-primary/10 rounded-xl flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                  <feat.icon className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground mb-1">{feat.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{feat.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Card className="card-elevated border-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-primary/5">
          <CardContent className="p-12 text-center">
            <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Rocket className="h-8 w-8 text-primary" />
            </div>
            <h3 className="text-3xl font-bold mb-4">Ready to get started?</h3>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Try the resume analyzer, build a new CV, or explore the full hiring platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/upload">
                <Button variant="gradient" size="lg" className="gap-2 w-full sm:w-auto">
                  <Zap className="h-5 w-5" />
                  Analyze My Resume
                </Button>
              </Link>
              <Link to="/buildcv">
                <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto">
                  <FileText className="h-5 w-5" />
                  Build a CV
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default FeaturesPage;