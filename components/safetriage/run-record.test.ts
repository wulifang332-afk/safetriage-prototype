import test from 'node:test';
import assert from 'node:assert/strict';
import { seedCases, initialEvents, sources } from './data.ts';
import { createRun, savedSnapshot, recoverRun, exportRun } from './run-record.ts';
import type { TriageResult } from '../../shared/triage.ts';

const start = '2026-10-09T03:00:00.000Z';
const end = '2026-10-09T03:00:02.000Z';
const patient = seedCases[0];

test('a new run isolates input, follow-up and evidence from an earlier attempt', () => {
 const first = createRun(patient, 'live', start, 'first');
 first.originalDraft = 'Original response'; first.currentDraft = 'Reviewer edit';
 first.sources = [sources[0]];
 const second = createRun({...patient, message: 'Updated input', followUp: 'New detail'}, 'live', end, 'second');
 assert.equal(first.input.message, patient.message);
 assert.equal(first.input.followUp, undefined);
 assert.deepEqual(second.input, {message: 'Updated input', followUp: 'New detail'});
 assert.deepEqual(second.sources, []);
 assert.equal(second.originalDraft, null);
 assert.equal(second.currentDraft, '');
 second.plan.push('Additional test step');
 assert.equal(first.plan.includes('Additional test step'), false);
});

test('a historical snapshot does not invent original times, drafts or a human decision', () => {
 const snapshot = savedSnapshot({...patient, status: 'sent'}, 'demo', [
  ...initialEvents, {id:'other',at:start,caseId:'OTHER',actor:'Staff',action:'Approve',detail:'Unrelated'}
 ], sources, end, 'legacy');
 assert.equal(snapshot.capturedFromStart, false);
 assert.equal(snapshot.startedAt, null);
 assert.equal(snapshot.completedAt, undefined);
 assert.equal(snapshot.originalDraft, null);
 assert.equal(snapshot.decision, undefined);
 assert.ok(snapshot.events.every(e => e.caseId === patient.id && e.timeKind === 'legacy'));
 assert.equal(snapshot.events.length, initialEvents.length);
});

test('interrupted runs pause without claiming completion or server cancellation', () => {
 const running = createRun(patient, 'live', start, 'interrupted');
 const recovered = recoverRun(running, end, 'recovery-event');
 assert.equal(recovered.state, 'paused');
 assert.equal(recovered.startedAt, start);
 assert.equal(recovered.completedAt, undefined);
 assert.equal(recovered.decision, undefined);
 assert.equal(recovered.events.at(-1)?.action, 'Run interrupted');
 assert.equal(recovered.events.at(-1)?.at, end);
 assert.equal(running.state, 'running');
 assert.equal(recoverRun(recovered, end, 'duplicate'), recovered);
});

test('export preserves original and approved text, evidence versions and timestamp provenance', () => {
 const r = createRun(patient, 'live', start, 'run-1');
 r.originalDraft = 'Original [1]'; r.currentDraft = 'Edited [1]'; r.state = 'sent';
 r.sources = [{...sources[0], quote: 'Refill requests must be reviewed by the prescribing clinician.'}];
 r.events = [{id:'step',at:end,caseId:patient.id,actor:'retrieval',action:'Retrieved',detail:'Scoped evidence',timeKind:'response-received'}];
 r.decision = {action:'approve',at:end,actor:'Mia Chen',finalDraft:'Edited [1]',sourceIds:['RX-01']};
 const out = exportRun(r, end).run;
 assert.equal(out.output.originalDraft, 'Original [1]');
 assert.equal(out.output.currentDraft, 'Edited [1]');
 assert.equal(out.output.edited, true);
 assert.equal(out.output.editedTextRevalidated, false);
 assert.equal(out.humanDecision?.finalDraft, 'Edited [1]');
 assert.equal(out.humanDecision?.identityVerified, false);
 assert.equal(out.sources[0].version, sources[0].version);
 assert.equal(out.sources[0].quote, r.sources[0].quote);
 assert.equal(out.events[0].timeKind, 'response-received');
});

test('export excludes connection settings and unknown provider or nested private fields', () => {
 const r = createRun(patient, 'live', start, 'run-2');
 const privateFields = {accessCode:'SECRET_SENTINEL',apiKey:'SECRET_SENTINEL'};
 Object.assign(r, {settings:privateFields, ...privateFields});
 Object.assign(r.input, privateFields);
 r.sources = [Object.assign({...sources[0]}, privateFields)];
 r.retrieved = [...r.sources];
 r.events = [Object.assign({id:'event',at:end,caseId:patient.id,actor:'Workflow',action:'Complete',detail:'Done',timeKind:'browser' as const}, privateFields)];
 r.decision = Object.assign({action:'reject' as const,at:end,actor:'Mia Chen',finalDraft:'',sourceIds:[],note:'Needs review'}, privateFields);
 const result: TriageResult = {requestId:'request-1',action:'draft',summary:'Summary',urgency:'Routine',category:'Refill',draft:'Draft',sources:[],retrieved:[],steps:[],trace:[],provenance:'llm',model:'test-model',retrieval:{method:'BM25',query:'refill',eligibleDocuments:2,elapsedMs:1},elapsedMs:12};
 r.result = Object.assign(result, privateFields);
 Object.assign(r.result.retrieval, privateFields);
 const output = JSON.stringify(exportRun(r, end));
 assert.equal(output.includes('SECRET_SENTINEL'), false);
 assert.equal(exportRun(r, end).run.generation?.requestId, 'request-1');
 assert.equal(exportRun(r, end).run.humanDecision?.action, 'reject');
});
