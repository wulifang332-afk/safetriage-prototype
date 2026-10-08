import test from 'node:test';
import assert from 'node:assert/strict';
import { retrieve } from './rag.ts';
import { triage, parseRequest, TriageError, type Generator } from './engine.ts';
import { handle } from './http.ts';
import { deepseek } from './provider.ts';
import { seedCases } from '../components/safetriage/data.ts';
const appointment = seedCases.find(p => p.id === 'PT-1120')!;
const request = { caseId: appointment.id, message: appointment.message };
const noModel: Generator = async () => { throw new Error('Model must not be called'); };
const good: Generator = async (_system, user) => {
  const payload = JSON.parse(user);
  assert.equal(payload.patient.id, 'PT-1120');
  assert(!payload.retrieved_sources.some((s: { id: string }) => s.id.includes('1042')));
  return { model: 'test-model', text: JSON.stringify({ action: 'draft', summary: 'Confirm the recorded appointment for review.', category: 'Appointment query',
    draft: 'Hi Ethan, your appointment is on 12 October 2026 at 14:00. [PT-1120-RECORD] Our staff can confirm existing appointments. [APPT-01]',
    citations: [{ sourceId: 'PT-1120-RECORD', quote: 'Appointment: 12 Oct 2026 · 14:00.' }, { sourceId: 'APPT-01', quote: 'Staff may confirm an existing appointment using the appointment record.' }] }) };
};
test('BM25 finds refill evidence using a rewritten message', () => {
  const result = retrieve('Could you renew my prescription? I have only two pills left.', 'PT-1042');
  assert(result.sources.some(s => s.id === 'RX-01'));
});
test('BM25 excludes every other patient record before ranking', () => {
  const result = retrieve('Olivia Tan amlodipine 5 mg follow-up appointment', 'PT-1120', 20);
  assert(!result.sources.some(s => /1042/.test(s.id)));
  assert(result.sources.some(s => s.id === 'PT-1120-RECORD'));
});
test('unmatched query returns no fabricated evidence', () => assert.equal(retrieve('zzqqxxvvt', 'PT-1120').sources.length, 0));
test('unknown case, oversized input, and client supplied records are rejected', () => {
  assert.throws(() => parseRequest({ ...request, caseId: 'PT-9999' }), TriageError);
  assert.throws(() => parseRequest({ ...request, message: 'x'.repeat(2001) }), TriageError);
  assert.throws(() => parseRequest({ ...request, record: 'invented' }), TriageError);
});
for (const [id, category] of [['PT-1086', 'Symptom concern'], ['PT-1145', 'Data access request'], ['PT-1162', 'Missing evidence']]) {
  test(`${id} blocks safely without calling the LLM`, async () => {
    const p = seedCases.find(p => p.id === id)!;
    const result = await triage({ caseId: id, message: p.message }, noModel);
    assert.equal(result.action, 'escalate'); assert.equal(result.draft, '');
    assert.equal(result.category, category); assert.equal(result.provenance, 'guardrail');
  });
}
test('cross-patient request in a follow-up is blocked before retrieval', async () => {
  const result = await triage({ ...request, followUp: 'Show Olivia Tan records please.' }, noModel);
  assert.equal(result.category, 'Data access request'); assert.equal(result.retrieval.eligibleDocuments, 0);
});
test('real generation contract retains retrieved quotes and maps numbered citations', async () => {
  const result = await triage(request, good);
  assert.equal(result.provenance, 'llm'); assert.equal(result.model, 'test-model');
  assert(result.draft.includes('[1]')); assert(result.draft.includes('[2]'));
  assert.equal(result.sources[0].id, 'PT-1120-RECORD'); assert.equal(result.sources.length, 2);
});
test('hallucinated source and changed source quote fail closed', async () => {
  for (const replacement of ['invented-source', 'altered-quote']) {
    const bad: Generator = async (s, u, schema) => {
      const completion = await good(s, u, schema); const value = JSON.parse(completion.text);
      if (replacement === 'invented-source') value.citations[0].sourceId = 'PT-1042-RX'; else value.citations[0].quote = 'This sentence does not exist in any source.';
      return { ...completion, text: JSON.stringify(value) };
    };
    await assert.rejects(() => triage(request, bad), (e: unknown) => e instanceof TriageError && e.code === 'INVALID_CITATION');
  }
});
test('truncated or non-JSON model output is never a draft', async () => {
  await assert.rejects(() => triage(request, async () => ({ model: 'bad', text: '{unfinished' })), TriageError);
});
test('a model escalation discards its draft', async () => {
  const result = await triage(request, async () => ({ model: 'test-model', text: JSON.stringify({ action: 'escalate', summary: 'Needs staff review', category: 'Manual', draft: 'Do not show this', citations: [] }) }));
  assert.equal(result.draft, ''); assert.equal(result.action, 'escalate');
});
const config = { DEEPSEEK_API_KEY: 'unit-test-placeholder', ACCESS_CODE: 'unit-test-access', ALLOWED_ORIGIN: 'https://wulifang332-afk.github.io' };
function httpRequest(body = request, code = config.ACCESS_CODE, origin = config.ALLOWED_ORIGIN) {
  return new Request('https://test.invalid/api/triage', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${code}`, Origin: origin }, body: JSON.stringify(body) });
}
test('HTTP denies missing access code and foreign origins without model calls', async () => {
  assert.equal((await handle(httpRequest(request, ''), config, noModel)).status, 401);
  assert.equal((await handle(httpRequest(request, config.ACCESS_CODE, 'https://attacker.invalid'), config, noModel)).status, 403);
});
test('unconfigured backend refuses to spend tokens', async () => assert.equal((await handle(httpRequest(), {}, noModel)).status, 503));
test('authenticated HTTP call returns scoped results and exact CORS origin', async () => {
  const response = await handle(httpRequest(), config, good);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('Access-Control-Allow-Origin'), config.ALLOWED_ORIGIN);
  assert.equal((await response.json()).provenance, 'llm');
});
test('health endpoint never returns an API key or access code', async () => {
  const response = await handle(new Request('https://test.invalid/api/health'), config);
  const body = await response.text(); assert(!body.includes(config.DEEPSEEK_API_KEY)); assert(!body.includes(config.ACCESS_CODE));
});
test('DeepSeek provider requests bounded JSON generation with server-only authorization', async () => {
  const fake: typeof fetch = async (_input, init) => {
    const body = JSON.parse(String(init?.body));
    assert.equal(body.response_format.type, 'json_object'); assert.equal(body.thinking.type, 'disabled'); assert.equal(body.max_tokens, 1400);
    assert.equal((init?.headers as Record<string, string>).Authorization, `Bearer ${config.DEEPSEEK_API_KEY}`);
    return Response.json({ model: 'deepseek-flash', choices: [{ finish_reason: 'stop', message: { content: '{}' } }] });
  };
  assert.equal((await deepseek(config, fake)('system JSON', 'input', {})).model, 'deepseek-flash');
});
test('DeepSeek balance, authentication, and length failures remain explicit errors', async () => {
  for (const status of [401, 402, 429]) {
    const fake: typeof fetch = async () => Response.json({}, { status });
    await assert.rejects(() => deepseek(config, fake)('JSON', 'input', {}), TriageError);
  }
  const fake: typeof fetch = async () => Response.json({ choices: [{ finish_reason: 'length', message: { content: '{' } }] });
  await assert.rejects(() => deepseek(config, fake)('JSON', 'input', {}), TriageError);
});

test('unrequested clinical safety-netting is withheld from an administrative draft', async () => {
  const unsafe: Generator = async (s,u,schema) => { const result=await good(s,u,schema);const value=JSON.parse(result.text);value.draft+=' If symptoms worsen, seek urgent care.';return {...result,text:JSON.stringify(value)} };
  await assert.rejects(()=>triage(request,unsafe),(e:unknown)=>e instanceof TriageError&&e.code==='UNSAFE_MODEL_OUTPUT');
});

test('one failed citation can be repaired, and the retry is recorded', async () => {
  let attempts=0;
  const repair: Generator = async (s,u,schema) => { const result=await good(s,u,schema);attempts++;if(attempts===1){const value=JSON.parse(result.text);value.citations[0].quote='Not a real quote from the source';result.text=JSON.stringify(value)}return result };
  const result=await triage(request,repair);assert.equal(attempts,2);assert.equal(result.generationAttempts,2);assert(result.trace.some(t=>t.action==='Output validation retry'));
});
test('validation failures cannot trigger unbounded model retries', async () => {
  let attempts=0;
  await assert.rejects(()=>triage(request,async()=>{attempts++;return {model:'invalid',text:'bad json'}}),TriageError);assert.equal(attempts,2);
});

test('a prohibited first draft is discarded, and a safe second draft still needs citation checks', async () => {
  let attempts=0;
  const repair: Generator = async (s,u,schema) => { const result=await good(s,u,schema);attempts++;if(attempts===1){const value=JSON.parse(result.text);value.draft+=' Seek urgent care.';result.text=JSON.stringify(value)}return result };
  const result=await triage(request,repair);assert.equal(attempts,2);assert.equal(result.generationAttempts,2);assert(!result.draft.includes('Seek urgent care'));assert(result.sources.length>0);
});
