import { useState, useRef, useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Menu, X, TrendingUp, ChevronDown, FileSearch, Sparkles, ArrowRight } from 'lucide-react';

const Navbar = () => {
  const [isOpen, setIsOpen] = useState(false);
  const [getStartedOpen, setGetStartedOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const navItems = [
    { name: 'Home', path: '/' },
    { name: 'Features', path: '/features' },
    { name: 'About', path: '/about' },
    { name: 'Contact', path: '/contact' },
  ];

  const isActive = (path: string) => location.pathname === path;

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setGetStartedOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Close mobile menu on route change
  useEffect(() => {
    setIsOpen(false);
    setGetStartedOpen(false);
  }, [location.pathname]);

  return (
    <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-md border-b border-border">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">

          {/* Logo */}
          <Link to="/" className="flex items-center gap-2 group flex-shrink-0">
            <div className="p-2 bg-primary rounded-xl group-hover:scale-110 transition-transform duration-300 flex items-center justify-center">
              <TrendingUp className="h-5 w-5 text-white" />
            </div>
            <div className="flex flex-col leading-none">
              <span className="hero-text text-base font-bold tracking-tight">ELEVATR</span>
              <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">AI Hiring</span>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center space-x-6">
            {navItems.map((item) => (
              <Link
                key={item.name}
                to={item.path}
                className={`text-sm font-medium transition-colors duration-200 ${
                  isActive(item.path)
                    ? 'text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {item.name}
              </Link>
            ))}
          </div>

          {/* Desktop CTA — Dropdown */}
          <div className="hidden md:flex items-center" ref={dropdownRef}>
            <div className="relative">
              <button
                onClick={() => setGetStartedOpen((v) => !v)}
                className="inline-flex items-center gap-1.5 btn-gradient text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-lg hover:shadow-xl transition-all duration-200 hover:-translate-y-0.5"
                aria-haspopup="true"
                aria-expanded={getStartedOpen ? 'true' : 'false'}
              >
                Get Started
                <ChevronDown
                  className={`h-4 w-4 transition-transform duration-200 ${getStartedOpen ? 'rotate-180' : ''}`}
                />
              </button>

              {/* Dropdown panel */}
              {getStartedOpen && (
                <div className="absolute right-0 top-full mt-2 w-72 bg-background border border-border rounded-2xl shadow-2xl overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-200">
                  <div className="p-2 space-y-1">
                    <Link
                      to="/upload"
                      className="flex items-start gap-3 p-3 rounded-xl hover:bg-accent transition-colors group"
                      onClick={() => setGetStartedOpen(false)}
                    >
                      <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <FileSearch className="h-4 w-4 text-primary" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">Analyze Resume</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Score your resume against a job description and close skill gaps.
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
                    </Link>

                    <Link
                      to="/buildcv"
                      className="flex items-start gap-3 p-3 rounded-xl hover:bg-accent transition-colors group"
                      onClick={() => setGetStartedOpen(false)}
                    >
                      <div className="w-9 h-9 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0 group-hover:scale-110 transition-transform">
                        <Sparkles className="h-4 w-4 text-purple-500" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-foreground">Build New CV</p>
                        <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">
                          Create a polished, ATS-ready resume from a professional template.
                        </p>
                      </div>
                      <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-purple-500 group-hover:translate-x-0.5 transition-all mt-1 shrink-0" />
                    </Link>
                  </div>
                  <div className="border-t border-border px-4 py-2.5 bg-muted/40">
                    <p className="text-xs text-muted-foreground text-center">
                      Part of the ELEVATR hiring platform
                    </p>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Mobile hamburger */}
          <div className="md:hidden">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsOpen(!isOpen)}
              aria-label="Toggle navigation menu"
            >
              {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </Button>
          </div>
        </div>

        {/* Mobile Navigation */}
        {isOpen && (
          <div className="md:hidden py-4 border-t border-border">
            <div className="flex flex-col space-y-1">
              {navItems.map((item) => (
                <Link
                  key={item.name}
                  to={item.path}
                  className={`px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-200 ${
                    isActive(item.path)
                      ? 'text-primary bg-primary/10'
                      : 'text-muted-foreground hover:text-foreground hover:bg-accent'
                  }`}
                  onClick={() => setIsOpen(false)}
                >
                  {item.name}
                </Link>
              ))}

              <div className="pt-3 border-t border-border mt-2 space-y-2">
                <p className="px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Get Started
                </p>
                <Link
                  to="/upload"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors group"
                  onClick={() => setIsOpen(false)}
                >
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <FileSearch className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Analyze Resume</p>
                    <p className="text-xs text-muted-foreground">Score & optimize your CV</p>
                  </div>
                </Link>
                <Link
                  to="/buildcv"
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-accent transition-colors group"
                  onClick={() => setIsOpen(false)}
                >
                  <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
                    <Sparkles className="h-4 w-4 text-purple-500" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">Build New CV</p>
                    <p className="text-xs text-muted-foreground">Start from a template</p>
                  </div>
                </Link>
              </div>
            </div>
          </div>
        )}
      </div>
    </nav>
  );
};

export default Navbar;