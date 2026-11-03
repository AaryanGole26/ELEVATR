'use client';

import { useCallback, useEffect, useState } from 'react';
import { Download, RefreshCw } from 'lucide-react';
import { Alert, LoadingState, Modal, fetchJson, useToast } from '@/shared/components/ui';
import type { InterviewEvaluationView } from '@/shared/types';

/** The HR view of one interview. Used from both the HR dashboard and the pipeline page. */
export function EvaluationModal({ interviewId, onClose, onChanged }: { interviewId: string; onClose: () => void; onChanged?: () => void }) {
  const [evaluation, setEvaluation] = useState<InterviewEvaluationView | null>(null);
  const [error, setError] = useState('');
  const [retrying, setRetrying] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    setError('');
    try {
      const data = await fetchJson<{ evaluation: InterviewEvaluationView }>(`/api/interviews/${interviewId}/details`);
      setEvaluation(data.evaluation);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load the evaluation.');
    }
  }, [interviewId]);

  useEffect(() => {
    void load();
  }, [load]);

  const retry = async () => {
    setRetrying(true);
    try {
      const data = await fetchJson<{ evaluation_status: string }>(`/api/interviews/${interviewId}/reprocess`, { method: 'POST' });
      if (data.evaluation_status === 'complete') toast('success', 'The interview has been evaluated.');
      else toast('error', 'The AI evaluation is still unavailable. Please try again later.');
      await load();
      onChanged?.();
    } catch (err) {
      toast('error', err instanceof Error ? err.message : 'Could not re-run the evaluation.');
    } finally {
      setRetrying(false);
    }
  };

  const kpis = Object.entries(evaluation?.kpis || {});

  return (
    <Modal title="AI interview evaluation" subtitle={evaluation ? `${evaluation.candidate_email || 'Candidate'} · ${evaluation.pipeline_title}` : undefined} onClose={onClose} large>
      {error && <Alert>{error}</Alert>}
      {!evaluation && !error && <LoadingState label="Loading evaluation..." />}

      {evaluation && (
        <div className="stack">
          {evaluation.overall_score !== null ? (
            <div className="score-hero">
              <span className="score-hero-value">{evaluation.overall_score}<small>/100</small></span>
              <div>
                <strong>Overall score</strong>
                <p className="page-subtitle">
                  {evaluation.submission_type === 'written' ? 'Written interview' : 'Video interview'}
                  {evaluation.max_questions > 0 && ` · ${evaluation.questions_answered}/${evaluation.max_questions} questions`}
                  {evaluation.submission_type !== 'written' && ` · ${evaluation.proctor_violations} proctoring warnings`}
                </p>
              </div>
            </div>
          ) : (
            <Alert kind="warning">
              The transcript was saved, but the AI evaluation hasn&apos;t completed, so this interview has no score yet.
            </Alert>
          )}

          <div className="actions">
            {evaluation.report_url && (
              <a className="btn btn-secondary" href={evaluation.report_url} target="_blank" rel="noreferrer">
                <Download size={15} aria-hidden="true" /> Download report
              </a>
            )}
            {evaluation.overall_score === null && (
              <button type="button" className="btn" onClick={retry} disabled={retrying}>
                <RefreshCw size={15} aria-hidden="true" /> {retrying ? 'Evaluating...' : 'Retry evaluation'}
              </button>
            )}
          </div>

          {evaluation.summary && (
            <section>
              <h3>Summary</h3>
              <p className="page-subtitle">{evaluation.summary}</p>
            </section>
          )}

          {(evaluation.strengths.length > 0 || evaluation.weaknesses.length > 0) && (
            <div className="grid grid-2">
              <section>
                <h3>Strengths</h3>
                <ul className="bullets">{evaluation.strengths.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </section>
              <section>
                <h3>Areas to improve</h3>
                <ul className="bullets">{evaluation.weaknesses.map((item, index) => <li key={index}>{item}</li>)}</ul>
              </section>
            </div>
          )}

          {kpis.length > 0 && (
            <section>
              <h3>Breakdown</h3>
              <div className="grid grid-2">
                {kpis.map(([key, kpi]) => (
                  <div key={key} className="kpi">
                    <div className="kpi-head"><span>{key.replace('_', ' ')}</span><span>{kpi?.score ?? 0}</span></div>
                    <div className="meter"><span style={{ width: `${Math.max(0, Math.min(100, kpi?.score ?? 0))}%` }} /></div>
                    <p>{kpi?.feedback}</p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {evaluation.transcript.length > 0 && (
            <section>
              <h3>Transcript</h3>
              <div className="transcript">
                {evaluation.transcript.map((turn, index) => (
                  <div key={index} className={`turn ${turn.role === 'candidate' ? 'turn-candidate' : ''}`}>
                    <span className="turn-label">{turn.role === 'candidate' ? 'Candidate' : 'Interviewer'}</span>
                    {turn.text}
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </Modal>
  );
}
