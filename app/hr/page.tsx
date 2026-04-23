'use client';

import { useEffect, useState } from 'react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { useAuth } from '@/shared/auth-context';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import './dashboard.css';

type Pipeline = {
  id: string;
  job_title: string;
  jd_text: string;
  threshold: number;
  tags: string[];
  is_active?: boolean;
  created_at: string;
  _stats?: {
    candidates: number;
    avg_score: number;
    shortlisted: number;
  };
};

type RoundRecord = {
  application_id: string;
  pipeline_title: string;
  email: string;
  status: string;
  status_mail_sent: boolean;
  interview_mail_sent: boolean;
  interview_completed: boolean;
  report_available: boolean;
  latest_interview_id?: string | null;
  latest_interview_score?: number | null;
  final_mail_sent: boolean;
  updated_at: string;
  stage_flow?: Array<{ stage_order: number; stage: string; done: boolean; at: string }>;
};

export default function HRDashboard() {
  return (
    <AuthGuard requiredRole="hr">
      <HRDashboardContent />
    </AuthGuard>
  );
}

function HRDashboardContent() {
  const { user } = useAuth();
  const router = useRouter();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [roundRecords, setRoundRecords] = useState<RoundRecord[]>([]);
  const [selectedEvaluation, setSelectedEvaluation] = useState<any>(null);
  const [evaluationLoadingId, setEvaluationLoadingId] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);

  // Form state
  const [formData, setFormData] = useState({
    job_title: '',
    jd_text: '',
    tags: '',
    threshold: 70
  });
  const [submitting, setSubmitting] = useState(false);
  const [isRoundRecordsExpanded, setIsRoundRecordsExpanded] = useState(false);

  const totalPipelines = pipelines.length;
  const activePipelines = pipelines.filter((pipeline) => pipeline.is_active !== false).length;
  const totalCandidates = pipelines.reduce((sum, pipeline) => sum + (pipeline._stats?.candidates || 0), 0);

  useEffect(() => {
    loadPipelines();
  }, []);

  const loadPipelines = async () => {
    setLoading(true);
    setError('');
    try {
      const [response, statsResponse] = await Promise.all([
        fetch('/api/pipelines'),
        fetch('/api/stats')
      ]);
      const data = await response.json();
      const statsData = await statsResponse.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || 'Failed to load pipelines');
      }

      // Fetch stats for each pipeline
      const pipelinesWithStats = (data?.data?.pipelines || []).map((p: Pipeline) => ({
        ...p,
        _stats: p._stats || { candidates: 0, avg_score: 0, shortlisted: 0 }
      }));

      setPipelines(pipelinesWithStats);
      setRoundRecords(Array.isArray(statsData?.data?.round_records) ? statsData.data.round_records : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error loading pipelines');
      setPipelines([]);
      setRoundRecords([]);
    } finally {
      setLoading(false);
    }
  };

  const handleViewEvaluation = async (record: RoundRecord) => {
    if (!record.latest_interview_id) return;
    
    setEvaluationLoadingId(record.application_id);
    setEvaluationError(null);
    try {
      const response = await fetch(`/api/interviews/${record.latest_interview_id}/result`);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result?.message || 'Failed to fetch evaluation');
      }
      
      setSelectedEvaluation(result.data?.interview || result.data || result);
    } catch (err) {
      setEvaluationError(err instanceof Error ? err.message : 'Failed to load evaluation');
    } finally {
      setEvaluationLoadingId(null);
    }
  };

  const handleCreatePipeline = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');

    try {
      if (!formData.job_title || !formData.jd_text) {
        throw new Error('Title and JD are required');
      }

      const response = await fetch('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_title: formData.job_title,
          jd_text: formData.jd_text,
          tags: formData.tags
            .split(',')
            .map((t) => t.trim())
            .filter(Boolean),
          threshold: formData.threshold
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data?.error?.message || data?.message || 'Failed to create pipeline');
      }

      setPipelines((prev) => [
        {
          ...data?.data?.pipeline,
          _stats: { candidates: 0, avg_score: 0, shortlisted: 0 }
        },
        ...prev
      ]);

      setFormData({ job_title: '', jd_text: '', tags: '', threshold: 70 });
      setShowCreateForm(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating pipeline');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1>HR Dashboard</h1>
          <p className="page-subtitle">Welcome, {user?.email}</p>
        </div>
        <div className="inlineActions wrap">
          <button
            className="btn btn-primary"
            onClick={() => setShowCreateForm(!showCreateForm)}
          >
            {showCreateForm ? 'Cancel' : '+ New Pipeline'}
          </button>
          <button className="btn btn-secondary" onClick={loadPipelines}>
            Refresh
          </button>
        </div>
      </div>

      <div className="row three">
        <div className="card">
          <h3 className="m0">Total Pipelines</h3>
          <p className="metric-value">{totalPipelines}</p>
        </div>
        <div className="card">
          <h3 className="m0">Active Pipelines</h3>
          <p className="metric-value">{activePipelines}</p>
        </div>
        <div className="card">
          <h3 className="m0">Candidates Tracked</h3>
          <p className="metric-value">{totalCandidates}</p>
        </div>
      </div>

      {error && <div className="error-box">{error}</div>}

      {showCreateForm && (
        <div className="card form-container-inline">
          <h2>Create New Pipeline</h2>
          <form onSubmit={handleCreatePipeline} className="form">
            <div className="form-group">
              <label htmlFor="title">Pipeline Title</label>
              <input
                id="title"
                type="text"
                value={formData.job_title}
                onChange={(e) => setFormData({ ...formData, job_title: e.target.value })}
                placeholder="e.g., Senior Backend Engineer"
                disabled={submitting}
                required
              />
            </div>

            <div className="form-group">
              <label htmlFor="jd">Job Description</label>
              <textarea
                id="jd"
                value={formData.jd_text}
                onChange={(e) => setFormData({ ...formData, jd_text: e.target.value })}
                placeholder="Paste the full job description..."
                rows={6}
                disabled={submitting}
                required
              />
            </div>

            <div className="row two">
              <div className="form-group">
                <label htmlFor="tags">Tags (comma-separated)</label>
                <input
                  id="tags"
                  type="text"
                  value={formData.tags}
                  onChange={(e) => setFormData({ ...formData, tags: e.target.value })}
                  placeholder="e.g., backend, python, aws"
                  disabled={submitting}
                />
              </div>

              <div className="form-group">
                <label htmlFor="threshold">Min Score Threshold</label>
                <input
                  id="threshold"
                  type="number"
                  min="0"
                  max="100"
                  value={formData.threshold}
                  onChange={(e) =>
                    setFormData({ ...formData, threshold: parseInt(e.target.value) })
                  }
                  disabled={submitting}
                />
              </div>
            </div>

            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create Pipeline'}
            </button>
          </form>
        </div>
      )}

      <div className="pipelines-section">
        <h2>Your Pipelines</h2>
        <p className="page-subtitle" style={{ marginBottom: '12px' }}>
          Open a pipeline to review candidates, update statuses, and drive interview decisions.
        </p>

        {loading && (
          <div className="loading-state">
            <div className="spinner"></div>
            <p>Loading pipelines...</p>
          </div>
        )}

        {!loading && pipelines.length === 0 && (
          <div className="empty-state">
            <h3>No pipelines yet</h3>
            <p>Create your first hiring pipeline to get started</p>
            <button
              className="btn btn-primary"
              onClick={() => setShowCreateForm(true)}
            >
              Create Pipeline
            </button>
          </div>
        )}

        {!loading && pipelines.length > 0 && (
          <div className="row three">
            {pipelines.map((pipeline: Pipeline) => (
              <Link key={pipeline.id} href={`/hr/pipeline/${pipeline.id}`}>
                <div className="card pipeline-card">
                  <h3>{pipeline.job_title}</h3>
                  <div className="pipeline-meta">
                    <div className="stat">
                      <strong>{pipeline._stats?.candidates || 0}</strong>
                      <span>Candidates</span>
                    </div>
                    <div className="stat">
                      <strong>{Math.round(pipeline._stats?.avg_score || 0)}</strong>
                      <span>Avg Score</span>
                    </div>
                    <div className="stat">
                      <strong>{pipeline._stats?.shortlisted || 0}</strong>
                      <span>Shortlisted</span>
                    </div>
                  </div>
                  <div className="pipeline-tags">
                    {pipeline.tags?.map((tag: string) => (
                      <span key={tag} className="tag">
                        {tag}
                      </span>
                    ))}
                  </div>
                  <p className="pipeline-date">
                    Created {new Date(pipeline.created_at).toLocaleDateString()}
                  </p>
                </div>
              </Link>
            ))}
          </div>
        )}

        <div className="card dash-records-card">
          <div 
            className="records-header"
            onClick={() => setIsRoundRecordsExpanded(!isRoundRecordsExpanded)}
          >
            <div>
              <h2>All Round Records</h2>
              <p className="page-subtitle">
                Track who got status mail, interview mail, interview completion, report generation, and final selection mail.
              </p>
            </div>
            <button className="btn btn-secondary btn-records-toggle">
              {isRoundRecordsExpanded ? "Hide Records" : "Show Records"}
            </button>
          </div>

          {isRoundRecordsExpanded && (
            <div className="records-content">
              {roundRecords.length === 0 ? (
                <p className="m0">No round records yet.</p>
              ) : (
                <div className="pipeline-table-wrap">
                  <table className="pipeline-table">
                    <thead>
                      <tr>
                        <th>Candidate</th>
                        <th>Pipeline</th>
                        <th>Status</th>
                        <th>Score</th>
                        <th>Stagewise Flow</th>
                        <th>Last Update</th>
                        <th>Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {roundRecords.map((record: RoundRecord) => (
                        <tr key={`${record.application_id}-${record.updated_at}`}>
                          <td>{record.email}</td>
                          <td>{record.pipeline_title}</td>
                          <td>{record.status}</td>
                          <td className="center-text">
                            {record.latest_interview_score !== null && record.latest_interview_score !== undefined ? (
                              <span className={`status-badge ${record.latest_interview_score >= 70 ? 'selected' : 'rejected'} score-badge`}>
                                {record.latest_interview_score}%
                              </span>
                            ) : (
                               <span className="muted-text">--</span>
                            )}
                          </td>
                          <td>
                            {(record.stage_flow || [])
                              .slice()
                              .sort((a, b) => a.stage_order - b.stage_order)
                              .map((stage) => {
                                const isNA = record.status === 'screened' && stage.stage_order >= 3;
                                return (
                                  <p key={`${record.application_id}-${stage.stage_order}`} className="m0">
                                    {stage.stage_order}. {stage.stage}: {stage.done ? 'Done' : (isNA ? 'NA' : 'Pending')}
                                  </p>
                                );
                              })}
                          </td>
                          <td>{new Date(record.updated_at).toLocaleDateString()}</td>
                          <td>
                            {record.latest_interview_id && (
                              <button 
                                className="btn btn-secondary btn-xs" 
                                onClick={() => handleViewEvaluation(record)}
                                disabled={evaluationLoadingId === record.application_id}
                              >
                                {evaluationLoadingId === record.application_id ? '...' : 'AI Eval'}
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
      
      {/* AI Evaluation Modal */}
      {selectedEvaluation && (
        <div className="modal-overlay" onClick={() => setSelectedEvaluation(null)}>
          <div className="modal-content glass-card evaluation-modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>AI Interview Evaluation</h2>
              <button className="btn btn-secondary btn-xs" onClick={() => setSelectedEvaluation(null)}>Close</button>
            </div>
            
            <div className="modal-body stack">
              <div className="evaluation-score-card glass-card hero-gradient">
                <div className="score-main">
                  <span className="score-label">Overall Session Score</span>
                  <span className="score-value">
                    {(() => {
                      const res = selectedEvaluation.result_json || selectedEvaluation;
                      return res.overall_score || res.overallScore || res.score || '--';
                    })()}%
                  </span>
                </div>
              </div>

              <div className="evaluation-section">
                <h3>Interview Transcript & Context</h3>
                <div className="transcript-box">
                  {(() => {
                    const res = selectedEvaluation.result_json || selectedEvaluation;
                    const evalText = res.evaluation || res.feedback || "No transcript analysis available yet.";
                    return <pre style={{ whiteSpace: 'pre-wrap', fontFamily: 'inherit' }}>{evalText}</pre>;
                  })()}
                </div>
              </div>

              {selectedEvaluation.report_pdf_url && (
                <div className="evaluation-actions">
                  <a href={selectedEvaluation.report_pdf_url} target="_blank" rel="noreferrer" className="btn btn-primary btn-block-center">
                    Download Full Report
                  </a>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {evaluationError && (
        <div className="modal-overlay" onClick={() => setEvaluationError(null)}>
          <div className="modal-content glass-card" style={{ maxWidth: '400px' }}>
            <h2>Evaluation Error</h2>
            <p className="error-box">{evaluationError}</p>
            <button className="btn btn-primary" onClick={() => setEvaluationError(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}