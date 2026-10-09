import type { TriageMode, TriageResult } from '../../shared/triage.ts';
import type { CaseStatus, Event, PatientCase, Source } from './data.ts';

export type RunEvent = Event & { timeKind: 'browser' | 'response-received' | 'legacy' };
export type RunDecision = {
 action: 'approve' | 'reject' | 'escalate'; at: string; actor: string;
 finalDraft: string; sourceIds: string[]; note?: string; team?: string;
};
export type RunRecord = {
 id: string; caseId: string; mode: TriageMode; capturedFromStart: boolean;
 capturedAt: string; startedAt: string | null; completedAt?: string; supersededAt?: string;
 input: { message: string; followUp?: string }; state: CaseStatus;
 plan: string[]; events: RunEvent[]; sources: Source[]; retrieved: Source[];
 originalDraft: string | null; currentDraft: string; result?: TriageResult;
 decision?: RunDecision; error?: string;
};
export const workflowPlan = [
 'Validate the input and check safety boundaries',
 'Retrieve sources scoped to this patient, if permitted',
 'Prepare a draft or clarification when evidence is sufficient',
 'Check the output and citations, or stop safely',
 'Wait for a reviewer to approve, reject or escalate',
];
export function createRun(p: PatientCase, mode: TriageMode, at: string, id: string): RunRecord {
 return { id, caseId: p.id, mode, capturedFromStart: true, capturedAt: at, startedAt: at,
  input: { message: p.message, ...(p.followUp ? { followUp: p.followUp } : {}) }, state: 'running',
  plan: [...workflowPlan], events: [], sources: [], retrieved: [], originalDraft: null, currentDraft: '' };
}
export function savedSnapshot(p: PatientCase, mode: TriageMode, events: Event[], sources: Source[], at: string, id: string): RunRecord {
 return { ...createRun(p, mode, at, id), capturedFromStart: false, startedAt: null,
  state: p.status, events: events.filter(e => e.caseId === p.id).map(e => ({ ...e, timeKind: 'legacy' })),
  sources, retrieved: p.ai?.retrieved ?? sources, originalDraft: p.ai?.draft ?? null,
  currentDraft: p.draft, result: p.ai, error: p.runError };
}
export function recoverRun(r: RunRecord, at: string, eventId: string): RunRecord {
 if (r.state !== 'running') return r;
 return { ...r, state: 'paused', error: 'The page was reloaded during this run. Its result was not accepted. Start a new run to retry.',
  events: [...r.events, { id: eventId, at, caseId: r.caseId, actor: 'Workflow', action: 'Run interrupted',
   detail: 'Recovered as paused after reload. No completion or server cancellation is inferred.', timeKind: 'browser' }] };
}
export function isRunRecord(value: unknown): value is RunRecord {
 if (!value || typeof value !== 'object') return false;
 const r = value as RunRecord;
 return typeof r.id === 'string' && typeof r.caseId === 'string' && ['demo', 'live'].includes(r.mode)
  && typeof r.input?.message === 'string' && typeof r.currentDraft === 'string'
  && Array.isArray(r.events) && r.events.every(e => typeof e.at === 'string' && typeof e.action === 'string')
  && Array.isArray(r.plan) && Array.isArray(r.sources) && Array.isArray(r.retrieved);
}
// Deliberate allowlist: connection settings, access codes and arbitrary provider fields never enter exports.
export function exportRun(r: RunRecord, exportedAt: string) {
 const source = (s: Source) => ({ id: s.id, title: s.title, kind: s.kind, version: s.version,
  excerpt: s.excerpt, applies: s.applies, ...(s.quote ? { quote: s.quote } : {}), ...(s.score !== undefined ? { score: s.score } : {}) });
 const a = r.result;
 return { schemaVersion: 1, application: 'SafeTriage', exportedAt,
  scope: 'One fictional case run; browser-local, editable teaching record. Sending and staff identity are simulated.',
  timestampNote: 'Browser events use the browser clock. Backend steps are stamped at response receipt, not at individual server execution times.',
  run: { id: r.id, caseId: r.caseId, mode: r.mode, capturedFromStart: r.capturedFromStart,
   capturedAt: r.capturedAt, startedAt: r.startedAt, completedAt: r.completedAt, supersededAt: r.supersededAt, state: r.state,
   input: { message: r.input.message, followUp: r.input.followUp }, plan: [...r.plan],
   events: r.events.map(e => ({ id: e.id, at: e.at, caseId: e.caseId, actor: e.actor, action: e.action, detail: e.detail, timeKind: e.timeKind })),
   sources: r.sources.map(source), retrieved: r.retrieved.map(source),
   output: { originalDraft: r.originalDraft, currentDraft: r.currentDraft, edited: r.originalDraft !== null && r.originalDraft !== r.currentDraft,
    editedTextRevalidated: false },
   generation: a ? { requestId: a.requestId, action: a.action, provenance: a.provenance, model: a.model,
    elapsedMs: a.elapsedMs, generationAttempts: a.generationAttempts, inputTokens: a.inputTokens, outputTokens: a.outputTokens,
    retrieval: { method: a.retrieval.method, query: a.retrieval.query, eligibleDocuments: a.retrieval.eligibleDocuments, elapsedMs: a.retrieval.elapsedMs } } : null,
   humanDecision: r.decision ? { action: r.decision.action, at: r.decision.at, actor: r.decision.actor,
    identityVerified: false, finalDraft: r.decision.finalDraft, sourceIds: [...r.decision.sourceIds], note: r.decision.note, team: r.decision.team } : null,
   error: r.error },
 };
}
