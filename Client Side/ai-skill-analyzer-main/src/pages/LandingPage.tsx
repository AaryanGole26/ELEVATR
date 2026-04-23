import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Zap,
  Target,
  TrendingUp,
  CheckCircle,
  ArrowRight,
  Brain,
  Award,
  FileText,
  Users,
  Video,
  Sparkles,
  BarChart3,
  Shield,
} from 'lucide-react';

const LandingPage = () => {
  const platformFeatures = [
    {
      icon: '🎯',
      title: 'AI Resume Analyzer',
      description: 'Match your resume against any job description. Get an instant score, skill gap analysis, and actionable feedback.',
      benefits: ['ATS compatibility check', 'Skill match scoring', 'Personalized improvements'],
      path: '/upload',
      cta: 'Analyze Resume',
      accent: 'from-blue-500/10 to-indigo-500/10',
      iconBg: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
    },
    {
      icon: '📄',
      title: 'CV Builder',
      description: 'Build a polished, ATS-ready resume from scratch using professional templates and a live preview editor.',
      benefits: ['Professional templates', 'Live editor preview', 'One-click PDF export'],
      path: '/buildcv',
      cta: 'Build CV',
      accent: 'from-purple-500/10 to-pink-500/10',
      iconBg: 'bg-purple-500/10',
      iconColor: 'text-purple-600',
    },
    {
      icon: '🤖',
      title: 'AI Video Interviewer',
      description: 'Receive a secure interview link, complete an AI-led video interview, and get evaluated with a detailed report.',
      benefits: ['Personalized questions', 'Speech recognition', 'Scored PDF report'],
      path:'http://localhost:3000/',
      cta: 'Learn More',
      accent: 'from-emerald-500/10 to-teal-500/10',
      iconBg: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600',
    },
    {
      icon: '📊',
      title: 'HR Pipeline',
      description: 'For HR teams — create JD-driven pipelines, screen applicants by score, and manage the entire hiring funnel.',
      benefits: ['JD-based screening', 'Bulk resume ingestion', 'Finalize & notify'],
      path: 'http://localhost:3000/',
      cta: 'For HR Teams',
      accent: 'from-orange-500/10 to-amber-500/10',
      iconBg: 'bg-orange-500/10',
      iconColor: 'text-orange-600',
    },
  ];

  const workflow = [
    {
      step: '01',
      title: 'Upload & Analyze',
      description: 'Upload your resume and paste a job description. Our AI scores your fit instantly.',
      icon: Target,
      who: 'Candidates',
    },
    {
      step: '02',
      title: 'Apply & Get Screened',
      description: 'Apply to open roles. HR uses AI scores to shortlist the best matches automatically.',
      icon: BarChart3,
      who: 'Both',
    },
    {
      step: '03',
      title: 'AI Video Interview',
      description: 'Shortlisted candidates complete a secure AI video interview with personalized questions.',
      icon: Video,
      who: 'Candidates',
    },
    {
      step: '04',
      title: 'Report & Decision',
      description: 'HR reviews AI-generated interview scores and PDF reports to make the final call.',
      icon: Award,
      who: 'HR',
    },
  ];

  const isExternal = (path: string) => path.startsWith('http');

  const audiencePanels = [
    {
      title: 'For Candidates',
      subtitle: 'Land more interviews, faster.',
      description: 'From resume optimization to AI-led interviews — ELEVATR gives you every tool to stand out and track your progress in one place.',
      points: ['Analyze resume vs. any JD', 'Build ATS-optimized CVs', 'Complete AI video interviews', 'Track application status'],
      cta: 'Analyze My Resume',
      path: '/upload',
      gradient: 'from-blue-600 to-indigo-600',
      icon: Users,
    },
    {
      title: 'For HR Teams',
      subtitle: 'From JD to decision, without the chaos.',
      description: 'Create structured pipelines, screen hundreds of candidates by AI score, send interview links, and finalize hires from one dashboard.',
      points: ['JD-driven screening pipelines', 'Bulk resume ingestion', 'Automated interview invites', 'AI-scored PDF reports'],
      cta: 'Explore HR Features',
      path: 'http://localhost:3000/',
      gradient: 'from-emerald-600 to-teal-600',
      icon: BarChart3,
    },
  ];

  return (
    <div className="min-h-screen">

      {/* ── Hero Section ─────────────────────────────── */}
      <section className="relative pt-24 pb-16 lg:pt-36 lg:pb-24 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-background" />
        {/* Decorative blobs */}
        <div className="absolute top-20 left-1/4 w-80 h-80 bg-blue-400/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute bottom-10 right-1/4 w-64 h-64 bg-indigo-400/10 rounded-full blur-3xl pointer-events-none" />

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full text-xs font-semibold bg-gradient-to-r from-blue-600/10 to-indigo-600/10 text-blue-700 ring-1 ring-blue-600/20 mb-6">
            <Sparkles className="h-3.5 w-3.5" />
            Unified AI Hiring Platform — for candidates & HR teams
          </div>

          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight mb-6 leading-tight">
            A sharper way to{' '}
            <span className="hero-text">hire, apply,</span>
            <br className="hidden sm:block" />
            and stay interview-ready.
          </h1>

          <p className="text-xl text-muted-foreground max-w-3xl mx-auto mb-10 leading-relaxed">
            ELEVATR gives candidates AI resume analysis, CV building, and video interviews — while
            helping HR teams screen faster and run structured hiring pipelines from one place.
          </p>

          <div className="flex flex-col sm:flex-row gap-4 justify-center flex-wrap mb-14">
            <Link to="/upload">
              <Button variant="gradient" size="lg" className="w-full sm:w-auto gap-2">
                <Target className="h-5 w-5" />
                Analyze My Resume
                <ArrowRight className="h-4 w-4" />
              </Button>
            </Link>
            <Link to="/buildcv">
              <Button variant="outline" size="lg" className="w-full sm:w-auto gap-2">
                <Sparkles className="h-5 w-5" />
                Build a CV
              </Button>
            </Link>
          </div>

          {/* Platform stat strip */}
          <div className="flex flex-wrap justify-center gap-8 pt-8 border-t border-border">
            {[
              { value: '4 modules', label: 'Resume · CV · Video Interview · HR Pipeline' },
              { value: 'AI-powered', label: 'Scoring, screening & interview evaluation' },
              { value: 'End-to-end', label: 'From application to final decision' },
            ].map((s) => (
              <div key={s.label} className="text-center">
                <p className="text-lg font-bold text-foreground">{s.value}</p>
                <p className="text-xs text-muted-foreground max-w-[180px]">{s.label}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Scrolling ticker ─────────────────────────── */}
      <section className="py-6">
        <div className="marquee bg-white/80 backdrop-blur border-y border-border select-none">
          <div className="marquee__track">
            {['Resume Analysis', 'CV Builder', 'AI Video Interviews', 'HR Pipelines', 'ATS Scoring', 'Skill Gap Detection', 'Interview Reports', 'Automated Screening'].flatMap((label, i) => [
              <div key={`a-${i}`} className="flex items-center px-8 py-3">
                <span className="text-slate-700 text-sm font-semibold uppercase tracking-wider whitespace-nowrap">{label}</span>
                <span className="mx-8 h-1 w-1 rounded-full bg-slate-300 inline-block" />
              </div>,
            ])}
            {['Resume Analysis', 'CV Builder', 'AI Video Interviews', 'HR Pipelines', 'ATS Scoring', 'Skill Gap Detection', 'Interview Reports', 'Automated Screening'].flatMap((label, i) => [
              <div key={`b-${i}`} className="flex items-center px-8 py-3">
                <span className="text-slate-700 text-sm font-semibold uppercase tracking-wider whitespace-nowrap">{label}</span>
                <span className="mx-8 h-1 w-1 rounded-full bg-slate-300 inline-block" />
              </div>,
            ])}
          </div>
        </div>
      </section>

      {/* ── Platform Modules ─────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Everything in One Platform</h2>
            <p className="text-xl text-muted-foreground max-w-2xl mx-auto">
              Four interconnected modules that power the full hiring journey — from first CV draft to final offer.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {platformFeatures.map((feature, index) => (
              <Card key={index} className={`card-elevated border-0 group bg-gradient-to-br ${feature.accent} hover:-translate-y-1 transition-all duration-300`}>
                <CardHeader className="pb-4">
                  <div className="flex items-start gap-4">
                    <div className={`w-12 h-12 rounded-2xl ${feature.iconBg} flex items-center justify-center text-2xl group-hover:scale-110 transition-transform duration-300 shrink-0`}>
                      {feature.icon}
                    </div>
                    <div>
                      <CardTitle className="text-xl mb-1">{feature.title}</CardTitle>
                      <CardDescription className="text-sm leading-relaxed">{feature.description}</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <ul className="space-y-2 mb-5">
                    {feature.benefits.map((b, i) => (
                      <li key={i} className="flex items-center text-sm text-muted-foreground gap-2">
                        <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                        {b}
                      </li>
                    ))}
                  </ul>
                  {isExternal(feature.path) ? (
                    <a href={feature.path} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all group/cta">
                      {feature.cta}
                      <ArrowRight className="h-4 w-4 group-hover/cta:translate-x-0.5 transition-transform" />
                    </a>
                  ) : (
                    <Link to={feature.path} className="inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:gap-2.5 transition-all group/cta">
                      {feature.cta}
                      <ArrowRight className="h-4 w-4 group-hover/cta:translate-x-0.5 transition-transform" />
                    </Link>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* ── Audience Split ───────────────────────────── */}
      <section className="py-24 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">Built for Both Sides of the Table</h2>
            <p className="text-xl text-muted-foreground">
              Whether you're applying or hiring, ELEVATR has a workflow for you.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-8">
            {audiencePanels.map((panel, i) => (
              <div key={i} className="card-elevated rounded-2xl p-8 flex flex-col gap-6 hover:-translate-y-1 transition-all duration-300">
                <div className={`w-14 h-14 rounded-2xl bg-gradient-to-br ${panel.gradient} flex items-center justify-center`}>
                  <panel.icon className="h-7 w-7 text-white" />
                </div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-widest text-primary mb-1">{panel.title}</p>
                  <h3 className="text-2xl font-bold mb-3">{panel.subtitle}</h3>
                  <p className="text-muted-foreground leading-relaxed">{panel.description}</p>
                </div>
                <ul className="space-y-2">
                  {panel.points.map((pt, j) => (
                    <li key={j} className="flex items-center gap-2 text-sm text-muted-foreground">
                      <CheckCircle className="h-4 w-4 text-primary shrink-0" />
                      {pt}
                    </li>
                  ))}
                </ul>
                {isExternal(panel.path) ? (
                  <a href={panel.path} target="_blank" rel="noopener noreferrer" className="block">
                    <Button variant="gradient" className="w-full gap-2">
                      {panel.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </a>
                ) : (
                  <Link to={panel.path}>
                    <Button variant="gradient" className="w-full gap-2">
                      {panel.cta}
                      <ArrowRight className="h-4 w-4" />
                    </Button>
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Workflow Steps ───────────────────────────── */}
      <section className="py-24">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl lg:text-4xl font-bold mb-4">How ELEVATR Works</h2>
            <p className="text-xl text-muted-foreground">End-to-end hiring in four stages</p>
          </div>
          <div className="grid md:grid-cols-4 gap-6 relative">
            {workflow.map((item, index) => (
              <div key={index} className="text-center relative">
                <div className="inline-flex items-center justify-center w-16 h-16 bg-primary rounded-2xl mb-5 relative shadow-lg">
                  <item.icon className="h-8 w-8 text-primary-foreground" />
                  <div className="absolute -top-2 -right-2 w-7 h-7 bg-secondary text-secondary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                    {item.step}
                  </div>
                </div>
                <div className="inline-flex mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded-full">
                    {item.who}
                  </span>
                </div>
                <h3 className="text-lg font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{item.description}</p>
                {index < 3 && (
                  <ArrowRight className="hidden md:block absolute top-8 -right-3 h-5 w-5 text-muted-foreground/50" />
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Trust Signals / Stats ────────────────────── */}
      <section className="py-16 bg-muted/30">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8 text-center">
            {[
              { value: '4 Tools', label: 'In one platform', icon: Zap },
              { value: '95%', label: 'AI scoring accuracy', icon: CheckCircle },
              { value: 'End-to-End', label: 'From CV to offer letter', icon: TrendingUp },
              { value: 'No bias', label: 'Structured AI screening', icon: Shield },
            ].map((stat, i) => (
              <div key={i}>
                <div className="inline-flex items-center justify-center w-12 h-12 bg-primary/10 rounded-full mb-4">
                  <stat.icon className="h-6 w-6 text-primary" />
                </div>
                <div className="text-3xl font-bold text-foreground mb-1">{stat.value}</div>
                <div className="text-sm text-muted-foreground">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Final CTA ────────────────────────────────── */}
      <section className="py-24 bg-gradient-to-r from-primary/10 via-secondary/10 to-primary/10">
        <div className="max-w-4xl mx-auto text-center px-4 sm:px-6 lg:px-8">
          <h2 className="text-3xl lg:text-4xl font-bold mb-4">
            Ready to get started?
          </h2>
          <p className="text-xl text-muted-foreground mb-10">
            Whether you're a candidate or an HR team, ELEVATR has tools built for you.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/upload">
              <Button variant="gradient" size="lg" className="gap-2 w-full sm:w-auto">
                <FileText className="h-5 w-5" />
                Analyze My Resume
              </Button>
            </Link>
            <Link to="/buildcv">
              <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto">
                <Sparkles className="h-5 w-5" />
                Build a New CV
              </Button>
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
};

export default LandingPage;