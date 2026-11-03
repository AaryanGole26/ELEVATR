'use client';

import './Navbar.css';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, TrendingUp, X } from 'lucide-react';
import { useAuth } from '@/shared/auth-context';

export default function Navbar() {
  const pathname = usePathname();
  const { user, role, signOut, loading } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setMenuOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
    setMobileOpen(false);
  }, [pathname]);

  const links: Array<{ name: string; path: '/' | '/hr' | '/dashboard' | '/resume-tools' }> = !user
    ? [{ name: 'Home', path: '/' }, { name: 'Resume tools', path: '/resume-tools' }]
    : role === 'hr'
      ? [{ name: 'Home', path: '/' }, { name: 'HR dashboard', path: '/hr' }]
      : [{ name: 'Home', path: '/' }, { name: 'My dashboard', path: '/dashboard' }, { name: 'Resume tools', path: '/resume-tools' }];

  const isActive = (path: string) => (path === '/' ? pathname === '/' : pathname.startsWith(path));

  return (
    <nav className={`nv ${scrolled ? 'nv-scrolled' : ''}`} aria-label="Main">
      <div className="nv-inner">
        <Link href="/" className="nv-logo">
          <span className="nv-logo-icon"><TrendingUp size={18} color="#ffffff" aria-hidden="true" /></span>
          <span>ELEVATR</span>
        </Link>

        <div className="nv-links">
          {links.map((link) => (
            <Link key={link.path} href={link.path} className={`nv-link ${isActive(link.path) ? 'nv-link-active' : ''}`} aria-current={isActive(link.path) ? 'page' : undefined}>
              {link.name}
            </Link>
          ))}
        </div>

        <div className="nv-right">
          {loading ? null : user ? (
            <div className="nv-account" ref={menuRef}>
              <button type="button" className="nv-account-btn" onClick={() => setMenuOpen((open) => !open)} aria-expanded={menuOpen} aria-haspopup="menu">
                <span className="nv-avatar" aria-hidden="true">{user.email?.charAt(0).toUpperCase()}</span>
                <span className="nv-role">{role === 'hr' ? 'Recruiter' : 'Candidate'}</span>
                <ChevronDown size={14} aria-hidden="true" className={menuOpen ? 'nv-flip' : ''} />
              </button>
              {menuOpen && (
                <div className="nv-menu" role="menu">
                  <p className="nv-menu-email">{user.email}</p>
                  <button type="button" role="menuitem" className="nv-menu-item" onClick={signOut}>
                    <LogOut size={15} aria-hidden="true" /> Sign out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="nv-auth">
              <Link href="/login" className="btn btn-secondary btn-sm">Sign in</Link>
              <Link href="/signup" className="btn btn-sm">Get started</Link>
            </div>
          )}
        </div>

        <button type="button" className="nv-burger" onClick={() => setMobileOpen((open) => !open)} aria-expanded={mobileOpen} aria-label="Toggle navigation menu">
          {mobileOpen ? <X size={20} aria-hidden="true" /> : <Menu size={20} aria-hidden="true" />}
        </button>
      </div>

      {mobileOpen && (
        <div className="nv-mobile">
          {links.map((link) => (
            <Link key={link.path} href={link.path} className={`nv-link ${isActive(link.path) ? 'nv-link-active' : ''}`}>{link.name}</Link>
          ))}
          {user ? (
            <>
              <p className="nv-menu-email">{user.email}</p>
              <button type="button" className="btn btn-secondary btn-block" onClick={signOut}>Sign out</button>
            </>
          ) : (
            <div className="actions">
              <Link href="/login" className="btn btn-secondary" style={{ flex: 1 }}>Sign in</Link>
              <Link href="/signup" className="btn" style={{ flex: 1 }}>Get started</Link>
            </div>
          )}
        </div>
      )}
    </nav>
  );
}
