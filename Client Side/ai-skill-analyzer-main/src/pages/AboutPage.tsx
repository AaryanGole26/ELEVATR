import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Target,
  Users,
  Heart,
  Shield,
  Zap,
  Globe,
  Rocket,
  TrendingUp,
  Brain,
  Video,
  BarChart3,
  ArrowRight,
  Github,
  Linkedin,
} from 'lucide-react';
import { Link } from 'react-router-dom';

const AboutPage = () => {
  const teamMembers = [
    {
      name: 'Ayush Mayekar',
      role: 'CEO & Co-Founder',
      description: 'AI/ML Expert, Bachelor of Engineering from VCET',
      image: '/am.jpg',
      initials: 'AM',
    },
    {
      name: 'Aaryan Gole',
      role: 'CTO & Co-Founder',
      description: 'AI/ML Expert, Bachelor of Engineering from VCET',
      image: '/acg.jpg',
      initials: 'AG',
    },
    {
      name: 'Dnyanesh Panchal',
      role: 'CMO & Co-Founder',
      description: 'AI/ML Expert, Bachelor of Engineering from VCET',
      image: '/dp.jpg',
      initials: 'DP',
    },
  ];

  const values = [
    {
      icon: Heart,
      title: 'Empowering Careers',
      description: 'We believe everyone deserves their dream job and we\'re here to make it accessible to all.',
      color: 'bg-rose-500/10',
      iconColor: 'text-rose-500',
    },
    {
      icon: Shield,
      title: 'Privacy First',
      description: 'Your data is yours. We use enterprise-grade security and never store personal information unnecessarily.',
      color: 'bg-blue-500/10',
      iconColor: 'text-blue-600',
    },
    {
      icon: Zap,
      title: 'AI Innovation',
      description: 'Cutting-edge AI meets career expertise to deliver actionable, real-time insights.',
      color: 'bg-amber-500/10',
      iconColor: 'text-amber-600',
    },
    {
      icon: Globe,
      title: 'Accessibility',
      description: 'Quality career tools shouldn\'t be expensive. We democratize professional growth for everyone.',
      color: 'bg-emerald-500/10',
      iconColor: 'text-emerald-600',
    },
  ];

  const platform = [
    { icon: Target, label: 'Resume Analyzer', desc: 'AI-scored resume vs JD matching', color: 'bg-blue-500/10', iconColor: 'text-blue-600' },
    { icon: Brain, label: 'CV Builder', desc: 'Professional ATS-ready templates', color: 'bg-purple-500/10', iconColor: 'text-purple-600' },
    { icon: Video, label: 'AI Interviewer', desc: 'Live AI video interview sessions', color: 'bg-emerald-500/10', iconColor: 'text-emerald-600' },
    { icon: BarChart3, label: 'HR Pipeline', desc: 'End-to-end hiring management', color: 'bg-orange-500/10', iconColor: 'text-orange-600' },
  ];

  return (
    <div className="min-h-screen pt-20 pb-20">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">

        {/* Hero */}
        <div className="text-center mb-20">
          <Badge variant="secondary" className="mb-6 gap-1.5">
            <Rocket className="h-3.5 w-3.5" />
            About ELEVATR
          </Badge>
          <h1 className="text-5xl md:text-6xl font-bold mb-6 tracking-tight">
            Built to make{' '}
            <span className="hero-text">hiring better</span>
            <br className="hidden sm:block" />
            for everyone
          </h1>
          <p className="text-xl text-muted-foreground max-w-3xl mx-auto leading-relaxed">
            ELEVATR is a unified AI hiring platform that helps candidates improve their resumes,
            ace video interviews, and land jobs — while giving HR teams the tools to screen,
            interview, and hire efficiently.
          </p>
        </div>

        {/* Platform overview */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-20">
          {platform.map((p, i) => (
            <div key={i} className="card-elevated rounded-2xl p-5 flex flex-col gap-3 text-center hover:-translate-y-1 transition-all duration-300">
              <div className={`w-12 h-12 ${p.color} rounded-xl flex items-center justify-center mx-auto`}>
                <p.icon className={`h-6 w-6 ${p.iconColor}`} />
              </div>
              <div>
                <p className="font-semibold text-sm text-foreground">{p.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{p.desc}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Mission & Vision */}
        <div className="grid lg:grid-cols-2 gap-8 mb-20">
          <Card className="card-elevated border-0 h-full">
            <CardHeader>
              <div className="w-14 h-14 bg-primary/10 rounded-2xl flex items-center justify-center mb-3">
                <Target className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl">Our Mission</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                To democratize career advancement by making professional resume optimization
                accessible to everyone. We believe that with the right tools and insights,
                anyone can unlock their career potential and land the job they deserve.
              </p>
            </CardContent>
          </Card>

          <Card className="card-elevated border-0 h-full">
            <CardHeader>
              <div className="w-14 h-14 bg-secondary/30 rounded-2xl flex items-center justify-center mb-3">
                <TrendingUp className="h-7 w-7 text-primary" />
              </div>
              <CardTitle className="text-2xl">Our Vision</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground leading-relaxed">
                To create a world where hiring is structured, transparent, and fair — where
                candidates are evaluated on their real skills and potential through AI, and
                HR teams can move from job description to final decision without friction.
              </p>
            </CardContent>
          </Card>
        </div>

        {/* Stats */}
        <Card className="card-elevated border-0 mb-20 overflow-hidden">
          <div className="grid grid-cols-2 md:grid-cols-4 divide-x divide-border">
            {[
              { value: '4 Modules', label: 'Integrated AI tools', color: 'text-primary' },
              { value: '95%', label: 'AI scoring accuracy', color: 'text-blue-600' },
              { value: 'E2E', label: 'From CV to offer letter', color: 'text-purple-600' },
              { value: 'VCET', label: 'Engineering origins', color: 'text-emerald-600' },
            ].map((s, i) => (
              <div key={i} className="p-10 text-center">
                <div className={`text-4xl font-bold mb-2 ${s.color}`}>{s.value}</div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
              </div>
            ))}
          </div>
        </Card>

        {/* Values */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Our Core Values</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              The principles that guide every design decision, feature, and interaction in ELEVATR.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {values.map((value, index) => (
              <div key={index} className="card-elevated rounded-2xl p-7 text-center flex flex-col items-center gap-4 hover:-translate-y-1 transition-all duration-300">
                <div className={`w-14 h-14 ${value.color} rounded-2xl flex items-center justify-center`}>
                  <value.icon className={`h-7 w-7 ${value.iconColor}`} />
                </div>
                <div>
                  <h3 className="font-semibold mb-2 text-foreground">{value.title}</h3>
                  <p className="text-sm text-muted-foreground leading-relaxed">{value.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Team */}
        <div className="mb-20">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold mb-3">Meet the Team</h2>
            <p className="text-muted-foreground max-w-xl mx-auto">
              Three engineers from VCET building AI-powered hiring tools for the modern world.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
            {teamMembers.map((member, index) => (
              <Card key={index} className="card-elevated border-0 text-center hover:-translate-y-1 transition-all duration-300">
                <CardContent className="p-8 flex flex-col items-center gap-4">
                  {/* Avatar with fallback initials */}
                  <div className="relative">
                    <img
                      src={member.image}
                      alt={member.name}
                      className="w-24 h-24 rounded-full object-cover ring-2 ring-primary/20 shadow-md"
                      onError={(e) => {
                        const el = e.currentTarget;
                        el.style.display = 'none';
                        const sib = el.nextElementSibling as HTMLElement;
                        if (sib) sib.style.display = 'flex';
                      }}
                    />
                    <div
                      className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-indigo-500 items-center justify-center text-white text-2xl font-bold ring-2 ring-primary/20 shadow-md"
                      style={{ display: 'none' }}
                    >
                      {member.initials}
                    </div>
                  </div>
                  <div>
                    <h3 className="font-bold text-lg text-foreground mb-1">{member.name}</h3>
                    <p className="text-sm text-primary font-semibold mb-2">{member.role}</p>
                    <p className="text-xs text-muted-foreground">{member.description}</p>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        {/* CTA */}
        <Card className="card-elevated border-0 bg-gradient-to-br from-primary/5 via-secondary/5 to-primary/5">
          <CardContent className="p-12 text-center">
            <h3 className="text-3xl font-bold mb-4">Ready to experience ELEVATR?</h3>
            <p className="text-muted-foreground mb-8 max-w-xl mx-auto">
              Start with the resume analyzer, build a new CV, or explore all the features of the platform.
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link to="/upload">
                <Button variant="gradient" size="lg" className="gap-2 w-full sm:w-auto">
                  <Target className="h-5 w-5" />
                  Analyze My Resume
                </Button>
              </Link>
              <Link to="/contact">
                <Button variant="outline" size="lg" className="gap-2 w-full sm:w-auto">
                  Contact the Team
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AboutPage;
