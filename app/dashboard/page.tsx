'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Check, Download, FileSearch, FileText, RefreshCw, Video } from 'lucide-react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useAuth } from '@/shared/auth-context';
import { Alert, EmptyState, LoadingState, Metric, StatusBadge, fetchJson } from '@/shared/components/ui';

type Application = {
  id: string;
  status: string;
  score: number;
  created_at: string;
  interview_link: string | null;
  interview_report_url: string | null;
  interview_score: number | null;
  round_records: Array<{ round: string; stage_order: number; label: string; at: string }>;
  pipeline: { title: string };
};

type Opportunity = {
  id: string;
  title: string;
  threshold: number;
  tags: string[] | null;
  created_at: string;
  applied: boolean;
  is_active: boolean;
  application_status: string | null;
};

const IN_PROGRESS = ['pending', 'screened', 'shortlisted', 'interview', 'interviewed'];

export default function CandidateDashboard() {
  return (
    <AuthGuard requiredRole="candidate">
      <CandidateDashboardContent />
    </AuthGuard>
  );
}

function CandidateDashboardContent() {
  const { user } = useAuth();
  const [applications, setApplications] = useState<Application[]>([]);
  const [opportunities, setOpportunities] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tagFilter, setTagFilter] = useState('all');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [apps, opps] = await Promise.all([
        fetchJson<{ applications: Application[] }>('/api/applications'),
        fetchJson<{ opportunities: Opportunity[] }>('/api/opportunities')
      ]);
      setApplications(apps.applications);
      setOpportunities(opps.opportunities);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const allTags = useMemo(
    () => Array.from(new Set(opportunities.flatMap((o) => o.tags || []))).sort((a, b) => a.localeCompare(b)),
    [opportunities]
  );
  const openRoles = opportunities.filter((o) => !o.applied && o.is_active);
  const visibleRoles = openRoles.filter((o) => tagFilter === 'all' || (o.tags || []).includes(tagFilter));
  const averageScore = applications.length
    ? Math.round(applications.reduce((sum, app) => sum + (app.score || 0), 0) / applications.length)
    : 0;

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1>My dashboard</h1>
          <p className="page-subtitle">{user?.email}</p>
        </div>
        <div className="actions">
          <Link href="/resume-tools" className="btn btn-secondary"><FileSearch size={15} aria-hidden="true" /> Resume tools</Link>
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid grid-4">
        <Metric label="Applications" value={applications.length} />
        <Metric label="In progress" value={applications.filter((a) => IN_PROGRESS.includes(a.status)).length} />
        <Metric label="Selected" value={applications.filter((a) => a.status === 'selected').length} />
        <Metric label="Average match" value={applications.length ? averageScore : '–'} />
      </div>

      <div className="grid grid-sidebar section">
        <section className="card">
          <div className="section-title"><h2>My applications</h2></div>
          {loading && <LoadingState label="Loading applications..." />}
          {!loading && applications.length === 0 && (
            <EmptyState icon={<FileText size={28} aria-hidden="true" />} title="No applications yet">
              <p>Choose an open role to submit your resume.</p>
            </EmptyState>
          )}
          {!loading && applications.length > 0 && (
            <div className="list">
              {applications.map((app) => (
                <article key={app.id} className="list-item">
                  <div className="list-main">
                    <h4>{app.pipeline.title}</h4>
                    <p>
                      Match score {app.score}/100
                      {app.interview_score !== null && ` · Interview ${app.interview_score}/100`}
                    </p>
                    <ul className="timeline">
                      {[...app.round_records].sort((a, b) => a.stage_order - b.stage_order).map((record) => (
                        <li key={record.round} title={new Date(record.at).toLocaleString()}>
                          <Check size={12} aria-hidden="true" /> {record.label}
                        </li>
                      ))}
                    </ul>
                    {(app.interview_link || app.interview_report_url) && (
                      <div className="actions mt">
                        {app.interview_link && (
                          <a className="btn btn-sm" href={app.interview_link}><Video size={14} aria-hidden="true" /> Take interview</a>
                        )}
                        {app.interview_report_url && (
                          <a className="btn btn-sm btn-secondary" href={app.interview_report_url} target="_blank" rel="noreferrer">
                            <Download size={14} aria-hidden="true" /> My report
                          </a>
                        )}
                      </div>
                    )}
                  </div>
                  <StatusBadge status={app.status} />
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card" id="opportunities">
          <div className="section-title">
            <h2>Open roles</h2>
            {allTags.length > 0 && (
              <select aria-label="Filter roles by tag" style={{ width: 'auto' }} value={tagFilter} onChange={(e) => setTagFilter(e.target.value)}>
                <option value="all">All tags</option>
                {allTags.map((tag) => <option key={tag} value={tag}>{tag}</option>)}
              </select>
            )}
          </div>
          {loading && <LoadingState label="Loading roles..." />}
          {!loading && visibleRoles.length === 0 && (
            <EmptyState icon={<Briefcase size={28} aria-hidden="true" />} title={openRoles.length ? 'No roles match this tag' : 'No open roles right now'}>
              <p>{openRoles.length ? 'Try a different tag.' : 'New roles will appear here. Check back soon.'}</p>
            </EmptyState>
          )}
          {!loading && visibleRoles.length > 0 && (
            <div className="list">
              {visibleRoles.map((role) => (
                <article key={role.id} className="list-item">
                  <div className="list-main">
                    <h4>{role.title}</h4>
                    <p>Posted {new Date(role.created_at).toLocaleDateString()}</p>
                    {!!role.tags?.length && (
                      <div className="tags mt">{role.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</div>
                    )}
                  </div>
                  <Link href={`/apply/${role.id}`} className="btn btn-sm">Apply</Link>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
