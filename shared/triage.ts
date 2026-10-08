export type TriageMode = 'demo' | 'live';
export type TriageAction = 'draft' | 'clarify' | 'escalate';
export type RetrievedSource = {
  id: string; title: string; kind: string; version: string; excerpt: string;
  applies: string; score: number; quote?: string;
};
export type TriageRequest = { caseId: string; message: string; followUp?: string };
export type TraceEntry = { action: string; detail: string; actor: string };
export type TriageResult = {
  requestId: string; action: TriageAction; summary: string; urgency: string;
  category: string; draft: string; sources: RetrievedSource[];
  retrieved: RetrievedSource[]; steps: string[]; trace: TraceEntry[];
  provenance: 'llm' | 'guardrail'; model: string | null;
  retrieval: { method: 'BM25'; query: string; eligibleDocuments: number; elapsedMs: number };
  elapsedMs: number; inputTokens?: number; outputTokens?: number;
};
export type EngineSettings = { mode: TriageMode; apiUrl: string; accessCode: string };
