'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useAuth } from '@/shared/auth-context';
import Link from 'next/link';

type Application = {
  id: string;
  pipeline_id: string;
  status: string;
  score: number;
  created_at: string;
  interview_link?: string | null;
  interview_report_url?: string | null;
  interview_score?: number | null;
  interview_completed?: boolean;
  round_records?: Array<{ round: string; stage_order?: number; label: string; at: string; inferred?: boolean }>;
  pipeline?: {
    title: string;
  };
};

type Opportunity = {
  id: string;
  title: string;
  jd_text: string;
  threshold: number;
  tags: string[];
  created_at: string;
  applied: boolean;
  is_active?: boolean;
  application_status: string | null;
};

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
  const [maxThreshold, setMaxThreshold] = useState(100);

  const totalApplications = applications.length;
  const inReviewCount = applications.filter((app) => ['pending', 'screened', 'shortlisted', 'interview', 'interviewed'].includes(app.status)).length;
  const selectedCount = applications.filter((app) => app.status === 'selected').length;
  const averageScore = totalApplications > 0
    ? Math.round(applications.reduce((sum, app) => sum + (app.score || 0), 0) / totalApplications)
    : 0;

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError('');

    try {
      const [appResponse, opportunitiesResponse] = await Promise.all([
        fetch('/api/applications'),
        fetch('/api/opportunities')
      ]);

      const appData = await appResponse.json();
      const opportunitiesData = await opportunitiesResponse.json();

      if (!appResponse.ok) {
        throw new Error(appData?.message || 'Failed to load applications');
      }

      if (!opportunitiesResponse.ok) {
        throw new Error(opportunitiesData?.message || 'Failed to load opportunities');
      }

      const applicationsPayload = appData?.data?.applications ?? appData?.applications ?? [];
      const opportunitiesPayload = opportunitiesData?.data?.opportunities ?? opportunitiesData?.opportunities ?? [];

      setApplications(Array.isArray(applicationsPayload) ? applicationsPayload : []);
      setOpportunities(Array.isArray(opportunitiesPayload) ? opportunitiesPayload : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading dashboard data');
      setApplications([]);
      setOpportunities([]);
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadgeClass = (status: string): string => {
    switch (status) {
      case 'pending':
        return 'pending';
      case 'shortlisted':
        return 'shortlisted';
      case 'interview':
      case 'interviewed':
        return 'interview';
      case 'rejected':
        return 'rejected';
      case 'selected':
        return 'selected';
      default:
        return 'pending';
    }
  };

  const getDisplayStatus = (status: string): string => {
    return status.charAt(0).toUpperCase() + status.slice(1);
  };

  const allTags = Array.from(
    new Set(opportunities.flatMap((opportunity) => opportunity.tags || []).map((tag) => tag.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b));

  const filteredOpportunities = opportunities.filter((opportunity) => {
    const tagMatched = tagFilter === 'all' || (opportunity.tags || []).some((tag) => tag.toLowerCase() === tagFilter.toLowerCase());
    const thresholdMatched = (opportunity.threshold || 0) <= maxThreshold;
    return tagMatched && thresholdMatched;
  });

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>My Dashboard</h1>
          <p className="page-subtitle">Welcome back, {user?.email}</p>
        </div>
        <div className="inlineActions wrap">
          <Link href="/resume-tools" className="btn btn-primary">
            Analyze Resume
          </Link>
          <Link href="/resume-builder" className="btn btn-secondary">
            Build Resume
          </Link>
          <button className="btn btn-secondary" onClick={loadDashboardData}>
            Refresh Status
          </button>
        </div>
      </div>

      <div className="glass-card stack hero-gradient">
        <h2 className="m0 mb-sm">Your Application Journey</h2>
        <p className="m0 muted-text">Track every stage, improve your profile, and stay ready for interview invites.</p>
      </div>

      <div className="row four">
        <div className="glass-card">
          <h3 className="m0">Applications</h3>
          <p className="metric-value">{totalApplications}</p>
        </div>
        <div className="glass-card">
          <h3 className="m0">In Progress</h3>
          <p className="metric-value">{inReviewCount}</p>
        </div>
        <div className="glass-card">
          <h3 className="m0">Selected</h3>
          <p className="metric-value">{selectedCount}</p>
        </div>
        <div className="glass-card">
          <h3 className="m0">Avg Score</h3>
          <p className="metric-value">{averageScore}</p>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      <div className="dashboard-grid">
        {/* Applications Section */}
        <div className="glass-card">
          <h2>My Applications</h2>
          <p className="page-subtitle section-subtitle-spaced">
            Keep this page as your source of truth for every application update.
          </p>

          {loading && (
            <div className="loading-state section-loading-plain">
              <div className="spinner"></div>
              <p>Loading applications...</p>
            </div>
          )}

          {!loading && applications.length === 0 && (
            <div className="empty-state section-empty-plain">
              <h3>No applications yet</h3>
              <p>Browse open opportunities from HR and submit your resume</p>
              <Link href="#opportunities" className="btn btn-primary">
                View Opportunities
              </Link>
            </div>
          )}

          {!loading && applications.length > 0 && (
            <div className="applications-list">
              {applications.map((app) => (
                <div key={app.id} className="application-item">
                  <div className="application-details">
                    <h4>{app.pipeline?.title || 'Position'}</h4>
                    <p>Applied {new Date(app.created_at).toLocaleDateString()}</p>
                    <p>Score: {app.score}/100</p>
                    {app.interview_score !== null && app.interview_score !== undefined && (
                      <p>Interview score: {app.interview_score}/100</p>
                    )}
                    {app.round_records && app.round_records.length > 0 && (
                      <div className="stack stack-tight mt-sm">
                        {app.round_records
                          .slice()
                          .sort((a, b) => (a.stage_order || 99) - (b.stage_order || 99))
                          .map((record) => (
                          <p key={`${app.id}-${record.round}-${record.at}`} className="m0">
                            Stage {record.stage_order || '-'}: {record.label} · {new Date(record.at).toLocaleDateString()}
                          </p>
                        ))}
                      </div>
                    )}
                    <div className="inlineActions wrap mt-sm">
                      {app.interview_link && app.status !== 'rejected' && (
                        <a className="btn btn-secondary" href={app.interview_link} target="_blank" rel="noreferrer">
                          Open Interview Link
                        </a>
                      )}
                      {app.interview_report_url && (
                        <a className="btn btn-secondary" href={app.interview_report_url} target="_blank" rel="noreferrer">
                          Download My Summary
                        </a>
                      )}
                    </div>
                  </div>
                  <span className={`status-badge ${getStatusBadgeClass(app.status)}`}>
                    {getDisplayStatus(app.status)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="glass-card" id="opportunities">
          <h2>Open Opportunities From HR</h2>
          <p className="page-subtitle section-subtitle-spaced">
            Pipelines created by HR appear here. Apply to any role that matches your profile.
          </p>

          <div className="opportunity-filters">
            <div className="form-group">
              <label htmlFor="tagFilter">Filter By Tag</label>
              <select
                id="tagFilter"
                value={tagFilter}
                onChange={(e) => setTagFilter(e.target.value)}
              >
                <option value="all">All tags</option>
                {allTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-group">
              <label htmlFor="thresholdFilter">Max Threshold: {maxThreshold}</label>
              <input
                id="thresholdFilter"
                type="range"
                min="0"
                max="100"
                step="1"
                value={maxThreshold}
                onChange={(e) => setMaxThreshold(Number(e.target.value))}
              />
            </div>
          </div>

          {loading && (
            <div className="loading-state section-loading-plain">
              <div className="spinner"></div>
              <p>Loading opportunities...</p>
            </div>
          )}

          {!loading && opportunities.length === 0 && (
            <div className="empty-state section-empty-plain">
              <h3>No opportunities yet</h3>
              <p>HR has not posted pipelines yet. Check back soon.</p>
            </div>
          )}

          {!loading && opportunities.length > 0 && filteredOpportunities.length === 0 && (
            <div className="empty-state section-empty-plain">
              <h3>No matches for current filters</h3>
              <p>Try a different tag or raise max threshold.</p>
            </div>
          )}

          {!loading && filteredOpportunities.length > 0 && (
            <div className="applications-list">
              {filteredOpportunities.map((opportunity) => (
                <div key={opportunity.id} className="application-item">
                  <div className="application-details">
                    <h4>{opportunity.title}</h4>
                    <p>Minimum score threshold: {opportunity.threshold}</p>
                    <p>Posted {new Date(opportunity.created_at).toLocaleDateString()}</p>
                    {(opportunity.tags || []).length > 0 && (
                      <div className="pipeline-tags">
                        {opportunity.tags.map((tag) => (
                          <span key={`${opportunity.id}-${tag}`} className="tag">{tag}</span>
                        ))}
                      </div>
                    )}
                  </div>
                  {opportunity.applied ? (
                    <span className={`status-badge ${getStatusBadgeClass(opportunity.application_status || 'pending')}`}>
                      Applied ({getDisplayStatus(opportunity.application_status || 'pending')})
                    </span>
                  ) : !opportunity.is_active ? (
                    <span className="status-badge rejected">
                      Position Closed
                    </span>
                  ) : (
                    <Link href={`/apply/${opportunity.id}`} className="btn btn-primary">
                      Apply Now
                    </Link>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Quick Actions */}
        <div className="glass-card">
          <h2>Career Boost Actions</h2>
          <div className="stack stack-tight">
            <Link href="/resume-tools" className="btn btn-secondary btn-block-center">
              Analyze Resume Against Job
            </Link>
            <Link href="/resume-builder" className="btn btn-secondary btn-block-center">
              Build ATS-Friendly Resume
            </Link>
            <Link href="#opportunities" className="btn btn-secondary btn-block-center">
              Explore New Opportunities
            </Link>
            <button className="btn btn-secondary btn-block-center" onClick={loadDashboardData}>
              Refresh Application Timeline
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}