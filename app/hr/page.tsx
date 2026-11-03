'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Briefcase, Check, ChevronDown, Plus, RefreshCw } from 'lucide-react';
import { AuthGuard } from '@/shared/components/AuthGuard';
import { EvaluationModal } from '@/shared/components/EvaluationModal';
import { useAuth } from '@/shared/auth-context';
import { Alert, EmptyState, LoadingState, Metric, Modal, StatusBadge, fetchJson, useToast } from '@/shared/components/ui';

type Pipeline = {
  id: string;
  job_title: string;
  tags: string[] | null;
  is_active: boolean;
  created_at: string;
  _stats?: { candidates: number; avg_score: number; shortlisted: number };
};

type RoundRecord = {
  application_id: string;
  pipeline_title: string;
  email: string;
  status: string;
  latest_interview_id: string | null;
  latest_interview_score: number | null;
  updated_at: string;
  stage_flow: Array<{ stage_order: number; stage: string; done: boolean }>;
};

const EMPTY_FORM = { job_title: '', jd_text: '', tags: '', threshold: 70 };

export default function HRDashboard() {
  return (
    <AuthGuard requiredRole="hr">
      <HRDashboardContent />
    </AuthGuard>
  );
}

function HRDashboardContent() {
  const { user } = useAuth();
  const toast = useToast();
  const [pipelines, setPipelines] = useState<Pipeline[]>([]);
  const [records, setRecords] = useState<RoundRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [formError, setFormError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [recordsOpen, setRecordsOpen] = useState(false);
  const [evaluationId, setEvaluationId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [pipelineData, stats] = await Promise.all([
        fetchJson<{ pipelines: Pipeline[] }>('/api/pipelines'),
        fetchJson<{ round_records?: RoundRecord[] }>('/api/stats')
      ]);
      setPipelines(pipelineData.pipelines);
      setRecords(stats.round_records || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load your dashboard.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const createPipeline = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setFormError('');
    try {
      await fetchJson('/api/pipelines', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_title: form.job_title.trim(),
          jd_text: form.jd_text.trim(),
          tags: form.tags.split(',').map((tag) => tag.trim()).filter(Boolean),
          threshold: form.threshold
        })
      });
      toast('success', 'Pipeline created. It is now open to candidates.');
      setForm(EMPTY_FORM);
      setCreating(false);
      await load();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create the pipeline.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="page-enter">
      <div className="page-header">
        <div>
          <h1>HR dashboard</h1>
          <p className="page-subtitle">{user?.email}</p>
        </div>
        <div className="actions">
          <button type="button" className="btn btn-secondary" onClick={load} disabled={loading}>
            <RefreshCw size={15} aria-hidden="true" /> Refresh
          </button>
          <button type="button" className="btn" onClick={() => setCreating(true)}>
            <Plus size={15} aria-hidden="true" /> New pipeline
          </button>
        </div>
      </div>

      {error && <Alert>{error}</Alert>}

      <div className="grid grid-4">
        <Metric label="Total pipelines" value={pipelines.length} />
        <Metric label="Open pipelines" value={pipelines.filter((p) => p.is_active).length} />
        <Metric label="Candidates tracked" value={pipelines.reduce((sum, p) => sum + (p._stats?.candidates || 0), 0)} />
      </div>

      <section className="section">
        <div className="section-title"><h2>Your pipelines</h2></div>
        {loading && <div className="card"><LoadingState label="Loading pipelines..." /></div>}
        {!loading && pipelines.length === 0 && !error && (
          <div className="card">
            <EmptyState icon={<Briefcase size={28} aria-hidden="true" />} title="No pipelines yet">
              <p>Create your first hiring pipeline to start receiving candidates.</p>
              <button type="button" className="btn" onClick={() => setCreating(true)}>Create pipeline</button>
            </EmptyState>
          </div>
        )}
        {!loading && pipelines.length > 0 && (
          <div className="grid grid-3">
            {pipelines.map((pipeline) => (
              <Link key={pipeline.id} href={`/hr/pipeline/${pipeline.id}`} className="card card-link">
                <div className="section-title">
                  <h3 style={{ margin: 0 }}>{pipeline.job_title}</h3>
                  <span className={`badge ${pipeline.is_active ? 'badge-ok' : ''}`}>{pipeline.is_active ? 'Open' : 'Closed'}</span>
                </div>
                <div className="stat-row">
                  <div className="stat"><strong>{pipeline._stats?.candidates || 0}</strong><span>Candidates</span></div>
                  <div className="stat"><strong>{pipeline._stats?.avg_score || 0}</strong><span>Avg match</span></div>
                  <div className="stat"><strong>{pipeline._stats?.shortlisted || 0}</strong><span>Shortlisted</span></div>
                </div>
                {!!pipeline.tags?.length && (
                  <div className="tags mb">{pipeline.tags.map((tag) => <span key={tag} className="tag">{tag}</span>)}</div>
                )}
                <small>Created {new Date(pipeline.created_at).toLocaleDateString()}</small>
              </Link>
            ))}
          </div>
        )}
      </section>

      <section className="card section">
        <button type="button" className="disclosure-toggle" aria-expanded={recordsOpen} onClick={() => setRecordsOpen((open) => !open)}>
          <span>
            <h2 style={{ margin: 0 }}>All candidate records</h2>
            <span className="page-subtitle">Every candidate&apos;s progress across your pipelines.</span>
          </span>
          <ChevronDown size={20} aria-hidden="true" />
        </button>

        {recordsOpen && (
          <div className="mt">
            {records.length === 0 ? (
              <p className="muted">No candidate records yet.</p>
            ) : (
              <div className="table-wrap">
                <table className="table">
                  <thead>
                    <tr><th>Candidate</th><th>Pipeline</th><th>Status</th><th>Interview</th><th>Progress</th><th>Updated</th><th /></tr>
                  </thead>
                  <tbody>
                    {records.map((record) => (
                      <tr key={record.application_id}>
                        <td>{record.email}</td>
                        <td>{record.pipeline_title}</td>
                        <td><StatusBadge status={record.status} /></td>
                        <td>{record.latest_interview_score ?? '–'}</td>
                        <td>
                          <ul className="stage-list">
                            {[...record.stage_flow].sort((a, b) => a.stage_order - b.stage_order).map((stage) => (
                              <li key={stage.stage_order} className={`stage ${stage.done ? 'stage-done' : ''}`}>
                                {stage.done && <Check size={11} aria-hidden="true" />}{stage.stage}
                              </li>
                            ))}
                          </ul>
                        </td>
                        <td className="nowrap">{new Date(record.updated_at).toLocaleDateString()}</td>
                        <td>
                          {record.latest_interview_id && (
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setEvaluationId(record.latest_interview_id)}>AI Eval</button>
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
      </section>

      {creating && (
        <Modal title="New pipeline" subtitle="Candidates are screened against this job description." onClose={() => !submitting && setCreating(false)}>
          {formError && <Alert>{formError}</Alert>}
          <form onSubmit={createPipeline} className="form">
            <div className="form-group">
              <label htmlFor="title">Job title</label>
              <input id="title" type="text" value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="e.g. Senior Backend Engineer" disabled={submitting} required minLength={3} maxLength={100} />
            </div>
            <div className="form-group">
              <label htmlFor="jd">Job description</label>
              <textarea id="jd" rows={7} value={form.jd_text} onChange={(e) => setForm({ ...form, jd_text: e.target.value })} placeholder="Paste the full job description..." disabled={submitting} required minLength={20} />
            </div>
            <div className="grid grid-2">
              <div className="form-group">
                <label htmlFor="tags">Tags (comma-separated)</label>
                <input id="tags" type="text" value={form.tags} onChange={(e) => setForm({ ...form, tags: e.target.value })} placeholder="backend, python, aws" disabled={submitting} />
              </div>
              <div className="form-group">
                <label htmlFor="threshold">Minimum match score</label>
                <input id="threshold" type="number" min={0} max={100} value={form.threshold} onChange={(e) => setForm({ ...form, threshold: Number(e.target.value) })} disabled={submitting} required />
              </div>
            </div>
            <div className="actions" style={{ justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setCreating(false)} disabled={submitting}>Cancel</button>
              <button type="submit" className="btn" disabled={submitting}>{submitting ? 'Creating...' : 'Create pipeline'}</button>
            </div>
          </form>
        </Modal>
      )}

      {evaluationId && <EvaluationModal interviewId={evaluationId} onClose={() => setEvaluationId(null)} onChanged={load} />}
    </div>
  );
}
