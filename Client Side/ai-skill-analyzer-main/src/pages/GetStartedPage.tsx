import { Link } from 'react-router-dom';
import { ArrowRight, FileSearch, Sparkles, CheckCircle2 } from 'lucide-react';

const GetStartedPage = () => {
  return (
    <div className="min-h-screen flex items-center justify-center py-20 px-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-primary/5 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/5 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-14">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-semibold mb-6 border border-primary/20">
            <Sparkles className="h-3.5 w-3.5" />
            AI-Powered Career Tools
          </div>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight text-foreground mb-4">
            Where do you want to{' '}
            <span className="hero-text">start?</span>
          </h1>
          <p className="text-muted-foreground text-lg max-w-xl mx-auto">
            Choose your path — analyze your existing resume against a job description, or build a brand-new one from scratch.
          </p>
        </div>

        {/* Option Cards */}
        <div className="grid md:grid-cols-2 gap-6">

          {/* Option 1 — Analyze Resume */}
          <Link
            to="/upload"
            className="group relative card-elevated p-8 rounded-2xl flex flex-col gap-5 cursor-pointer no-underline border border-border hover:border-primary/40 transition-all duration-300"
          >
            {/* Number badge */}
            <div className="absolute top-5 right-5 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
              01
            </div>

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <FileSearch className="h-7 w-7 text-primary" />
            </div>

            {/* Content */}
            <div>
              <h2 className="text-xl font-bold text-foreground mb-2 group-hover:text-primary transition-colors">
                Analyze My Resume
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Upload your resume and a job description. Our AI scores your fit, identifies skill gaps, and gives you actionable improvements.
              </p>
            </div>

            {/* Feature list */}
            <ul className="space-y-2 mt-auto">
              {['ATS compatibility score', 'Skill gap analysis', 'Tailored improvement tips'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-primary shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="flex items-center gap-2 text-primary font-semibold text-sm mt-2 group-hover:gap-3 transition-all">
              Analyze now
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>

          {/* Option 2 — Build CV */}
          <Link
            to="/buildcv"
            className="group relative card-elevated p-8 rounded-2xl flex flex-col gap-5 cursor-pointer no-underline border border-border hover:border-purple-500/40 transition-all duration-300"
          >
            {/* Number badge */}
            <div className="absolute top-5 right-5 w-8 h-8 rounded-full bg-muted flex items-center justify-center text-xs font-bold text-muted-foreground group-hover:bg-purple-500/10 group-hover:text-purple-600 transition-colors">
              02
            </div>

            {/* Icon */}
            <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center group-hover:scale-110 transition-transform duration-300">
              <Sparkles className="h-7 w-7 text-purple-500" />
            </div>

            {/* Content */}
            <div>
              <h2 className="text-xl font-bold text-foreground mb-2 group-hover:text-purple-600 transition-colors">
                Build a New CV
              </h2>
              <p className="text-muted-foreground text-sm leading-relaxed">
                Start from a professional template. Fill in your details, and export a polished, ATS-friendly resume in minutes.
              </p>
            </div>

            {/* Feature list */}
            <ul className="space-y-2 mt-auto">
              {['Professional templates', 'Live preview editor', 'PDF export ready'].map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-4 w-4 text-purple-500 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>

            {/* CTA */}
            <div className="flex items-center gap-2 text-purple-600 font-semibold text-sm mt-2 group-hover:gap-3 transition-all">
              Start building
              <ArrowRight className="h-4 w-4 group-hover:translate-x-1 transition-transform" />
            </div>
          </Link>
        </div>

        {/* Bottom note */}
        <p className="text-center text-sm text-muted-foreground mt-10">
          Not sure where to start?{' '}
          <Link to="/features" className="text-primary font-medium hover:underline">
            Explore features
          </Link>{' '}
          to learn more.
        </p>
      </div>
    </div>
  );
};

export default GetStartedPage;
