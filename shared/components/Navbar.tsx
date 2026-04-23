'use client';

import './Navbar.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/shared/auth-context';
import { useEffect, useRef, useState } from 'react';
import {
  TrendingUp,
  ChevronDown,
  Menu,
  X,
  UserPlus,
  FileSearch,
  ArrowRight,
  LayoutDashboard,
  Briefcase,
} from 'lucide-react';

export default function Navbar() {
  const pathname = usePathname();
  const { user, role, signOut, loading } = useAuth();

  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showGetStarted, setShowGetStarted] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  const userMenuRef = useRef<HTMLDivElement>(null);
  const getStartedRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(e.target as Node))
        setShowUserMenu(false);
      if (getStartedRef.current && !getStartedRef.current.contains(e.target as Node))
        setShowGetStarted(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  useEffect(() => {
    setShowUserMenu(false);
    setShowGetStarted(false);
    setMobileOpen(false);
  }, [pathname]);

  const handleSignOut = async () => {
    await signOut();
    setShowUserMenu(false);
  };

  const isActive = (path: string) => pathname === path;

  const navLinks = user
    ? role === 'hr'
      ? [
          { name: 'Home', path: '/' },
          { name: 'HR Dashboard', path: '/hr' },
        ]
      : [
          { name: 'Home', path: '/' },
          { name: 'My Dashboard', path: '/dashboard' },
          { name: 'Resume Tools', path: '/resume-tools' },
        ]
    : [
        { name: 'Home', path: '/' },
        { name: 'Features', path: '/resume-tools' },
        { name: 'About', path: 'http://localhost:8080/#/about' },
      ];

  return (
    <nav className={`nv-fixed ${scrolled ? 'nv-scrolled' : ''}`}>
      <div className="nv-container">
        <div className="nv-flex-between">

          {/* Logo */}
          <Link href="/" className="nv-logo-link">
            <div className="nv-logo-icon">
              <TrendingUp size={20} color="white" />
            </div>
            <div className="nv-logo-text-wrap">
              <span className="nv-logo-title">ELEVATR</span>
              <span className="nv-logo-subtitle">AI Hiring</span>
            </div>
          </Link>

          {/* Desktop Nav Links */}
          <div className="nv-desktop-nav">
            {navLinks.map((link) => {
              const isExt = link.path.startsWith('http');
              const active = !isExt && isActive(link.path);
              const cls = `nv-nav-link ${active ? 'nv-nav-link-active' : ''}`;
              
              return isExt ? (
                <a key={link.path} href={link.path} target="_blank" rel="noopener noreferrer" className={cls}>
                  {link.name}
                </a>
              ) : (
                <Link key={link.path} href={link.path} className={cls}>
                  {link.name}
                </Link>
              );
            })}
          </div>

          {/* Desktop Right CTA */}
          <div className="nv-right-cta">
            {loading ? (
              <span style={{ fontSize: '0.875rem', color: '#9ca3af' }}>Loading…</span>
            ) : user ? (
              <div style={{ position: 'relative' }} ref={userMenuRef}>
                <button
                  onClick={() => setShowUserMenu((v) => !v)}
                  className="nv-btn-avatar"
                >
                  <span className="nv-avatar-circle">
                    {user.email?.charAt(0).toUpperCase()}
                  </span>
                  {role && <span style={{ textTransform: 'capitalize' }}>{role}</span>}
                  <ChevronDown size={14} className={`nv-chevron ${showUserMenu ? 'nv-rotate-180' : ''}`} />
                </button>

                {showUserMenu && (
                  <div className="nv-dropdown" style={{ padding: '0.5rem' }}>
                    <div style={{ padding: '0.5rem', borderBottom: '1px solid #f3f4f6', marginBottom: '0.5rem' }}>
                      <p style={{ margin: 0, fontSize: '0.75rem', color: '#9ca3af', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.email}</p>
                    </div>
                    {role === 'hr' ? (
                      <Link href="/hr" className="nv-dropdown-item" onClick={() => setShowUserMenu(false)}>
                        <div className="nv-drop-icon-wrp nv-drop-icon-blue"><Briefcase size={16} /></div>
                        <div className="nv-drop-text"><p className="nv-drop-title" style={{marginTop: '0.25rem'}}>HR Dashboard</p></div>
                      </Link>
                    ) : (
                      <>
                        <Link href="/dashboard" className="nv-dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="nv-drop-icon-wrp nv-drop-icon-blue"><LayoutDashboard size={16} /></div>
                          <div className="nv-drop-text"><p className="nv-drop-title" style={{marginTop: '0.25rem'}}>My Dashboard</p></div>
                        </Link>
                        <Link href="/resume-tools" className="nv-dropdown-item" onClick={() => setShowUserMenu(false)}>
                          <div className="nv-drop-icon-wrp nv-drop-icon-indigo"><FileSearch size={16} /></div>
                          <div className="nv-drop-text"><p className="nv-drop-title" style={{marginTop: '0.25rem'}}>Resume Tools</p></div>
                        </Link>
                      </>
                    )}
                    <div style={{ borderTop: '1px solid #f3f4f6', marginTop: '0.5rem', paddingTop: '0.5rem' }}>
                      <button onClick={handleSignOut} className="nv-dropdown-item" style={{ width: '100%', color: '#ef4444', background: 'none', border: 'none', textAlign: 'left', display: 'block', padding: '0.5rem 0.75rem' }}>
                        Sign Out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div style={{ position: 'relative' }} ref={getStartedRef}>
                <button
                  onClick={() => setShowGetStarted((v) => !v)}
                  className="nv-btn-getstarted"
                >
                  Get Started
                  <ChevronDown size={14} className={`nv-chevron ${showGetStarted ? 'nv-rotate-180' : ''}`} />
                </button>

                {showGetStarted && (
                  <div className="nv-dropdown" style={{ width: '20rem' }}>
                    <div style={{ padding: '0.5rem' }}>
                      <Link href="/signup" className="nv-dropdown-item" onClick={() => setShowGetStarted(false)}>
                        <div className="nv-drop-icon-wrp nv-drop-icon-blue">
                          <UserPlus size={16} />
                        </div>
                        <div className="nv-drop-text">
                          <p className="nv-drop-title">Create Account</p>
                          <p className="nv-drop-desc">Sign up as candidate or HR</p>
                        </div>
                        <ArrowRight size={16} className="nv-drop-arrow" />
                      </Link>

                      <Link href="/resume-tools" className="nv-dropdown-item" onClick={() => setShowGetStarted(false)}>
                        <div className="nv-drop-icon-wrp nv-drop-icon-indigo">
                          <FileSearch size={16} />
                        </div>
                        <div className="nv-drop-text">
                          <p className="nv-drop-title">Analyze Resume</p>
                          <p className="nv-drop-desc">Score your CV vs a job description</p>
                        </div>
                        <ArrowRight size={16} className="nv-drop-arrow" />
                      </Link>
                    </div>
                    <div style={{ background: '#f9fafb', padding: '0.75rem 1rem', display: 'flex', justifyContent: 'space-between', borderTop: '1px solid #f3f4f6' }}>
                      <span style={{ fontSize: '0.75rem', color: '#9ca3af' }}>Already have an account?</span>
                      <Link href="/login" style={{ fontSize: '0.75rem', fontWeight: 600, color: '#2563eb', textDecoration: 'none' }} onClick={() => setShowGetStarted(false)}>Log in →</Link>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Mobile hamburger */}
          <button onClick={() => setMobileOpen((v) => !v)} className="nv-mobile-btn">
            {mobileOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileOpen && (
          <div className="nv-mobile-menu">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
              {navLinks.map((link) => {
                const isExt = link.path.startsWith('http');
                const active = !isExt && isActive(link.path);
                const cls = `nv-mobile-link ${active ? 'nv-mobile-link-active' : ''}`;
                return isExt ? (
                  <a key={link.path} href={link.path} target="_blank" rel="noopener noreferrer" className={cls} onClick={() => setMobileOpen(false)}>
                    {link.name}
                  </a>
                ) : (
                  <Link key={link.path} href={link.path} className={cls} onClick={() => setMobileOpen(false)}>
                    {link.name}
                  </Link>
                );
              })}

              {!user && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
                  <p style={{ margin: '0 0 0.5rem 0.75rem', fontSize: '0.625rem', fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase' }}>Get Started</p>
                  <Link href="/signup" className="nv-mobile-link" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} onClick={() => setMobileOpen(false)}>
                     <UserPlus size={16} color="#2563eb" /> Create Account
                  </Link>
                  <Link href="/resume-tools" className="nv-mobile-link" style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }} onClick={() => setMobileOpen(false)}>
                     <FileSearch size={16} color="#4f46e5" /> Analyze Resume
                  </Link>
                </div>
              )}

              {user && (
                <div style={{ marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid #f3f4f6' }}>
                  <button onClick={handleSignOut} className="nv-mobile-link" style={{ width: '100%', textAlign: 'left', background: 'none', border: 'none', color: '#ef4444' }}>
                    Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </nav>
  );
}
