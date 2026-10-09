import { useState } from 'react';
import { ChevronDown, Download, FileText, CircleDot, Clock3 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { statusLabels, type PatientCase, type Source } from './data';
import { exportRun, workflowPlan, type RunRecord, type RunEvent } from './run-record';

function time(at: string | null | undefined) { return at ? at.replace('T', ' ').replace('Z', ' UTC') : 'Not captured'; }
function download(record: RunRecord) {
 const blob = new Blob([JSON.stringify(exportRun(record, new Date().toISOString()), null, 2)], { type: 'application/json' });
 const url = URL.createObjectURL(blob); const link = document.createElement('a');
 link.href = url; link.download = `SafeTriage-${record.caseId}-${record.id}.json`; link.click();
 setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Timeline({events}: {events: RunEvent[]}) {
 return <ol className="run-timeline">{events.map(e => <li key={e.id}>
  <CircleDot size={15} aria-hidden="true"/><div><strong>{e.action}</strong><small>{e.actor} · {time(e.at)}{e.timeKind === 'response-received' ? ' · received' : e.timeKind === 'legacy' ? ' · earlier record' : ''}</small><p>{e.detail}</p></div>
 </li>)}</ol>;
}
export function WorkflowDetails({patient, records}: {patient: PatientCase; records: RunRecord[]}) {
 const [showRecord, setShowRecord] = useState(false);
 const [selectedId, setSelectedId] = useState<string>();
 const latest = records.at(-1);
 const selected = records.find(r => r.id === selectedId) ?? latest;
 return <div className="workflow-evidence">
  <details className="workflow-details">
   <summary><span><Clock3 size={15}/>Workflow details</span><span className="workflow-status">{statusLabels[patient.status]}<ChevronDown size={14}/></span></summary>
   <div className="workflow-body">
    <h4>Execution plan</h4><ol className="workflow-plan">{workflowPlan.map(s => <li key={s}>{s}</li>)}</ol>
    <p className="workflow-note">{latest?.mode === 'demo' ? 'Demo uses scripted steps and simulated sources. No model is called.' : 'The controller follows this bounded plan. A safety stop can skip retrieval or generation.'}</p>
    <h4>Recorded steps</h4>
    {latest ? <>{!latest.capturedFromStart && <p className="workflow-note">Earlier saved case: the full run was not captured. Start a new run for a complete record.</p>}<Timeline events={latest.events}/></> : <p className="workflow-note">No run yet. Select Run triage to start.</p>}
    {patient.status === 'running' && <p className="workflow-pending" role="status"><Clock3 size={14}/>{latest?.mode === 'live' ? 'Waiting for the backend. Completed steps appear when its response arrives.' : 'Simulated workflow in progress…'}</p>}
    {latest?.mode === 'live' && latest.events.some(e => e.timeKind === 'response-received') && <p className="workflow-note">“Received” marks when the browser received the backend trace, not when each server step ran.</p>}
   </div>
  </details>
  {latest && <div className="record-actions"><Button variant="ghost" size="sm" onClick={() => {setSelectedId(latest.id); setShowRecord(true);}}><FileText size={14}/>View run record</Button><Button variant="ghost" size="sm" onClick={() => download(latest)}><Download size={14}/>Download JSON</Button></div>}
  <Dialog open={showRecord} onOpenChange={setShowRecord}><DialogContent className="run-record-dialog">
   <DialogHeader><DialogTitle>Run record · {patient.name}</DialogTitle><DialogDescription>Inputs, evidence and decisions for one run. Stored in this browser; all patients, staff identities and delivery are simulated.</DialogDescription></DialogHeader>
   <div className="run-record-scroll">
    {records.length > 1 && <label className="run-selector">Saved runs<select aria-label="Saved runs" value={selected?.id} onChange={e => setSelectedId(e.target.value)}>{records.map((r,i) => <option key={r.id} value={r.id}>Run {i+1} · {r.startedAt ? time(r.startedAt) : 'Earlier saved case'} · {statusLabels[r.state]}</option>)}</select></label>}
    {selected && <RunContents record={selected}/>}
   </div>
   <DialogFooter><Button variant="outline" onClick={() => setShowRecord(false)}>Done</Button>{selected && <Button onClick={() => download(selected)}><Download size={15}/>Download JSON</Button>}</DialogFooter>
  </DialogContent></Dialog>
 </div>;
}
function SourceRecord({source, cited}: {source: Source; cited: boolean}) {
 return <article className="run-source"><strong>{source.id} · {source.title}</strong><small>{source.version} · {cited ? 'Cited / applied source' : 'Retrieved, not cited'}</small><p>{source.excerpt}</p>{source.quote && <blockquote>Exact quote: {source.quote}</blockquote>}</article>;
}
function RunContents({record: r}: {record: RunRecord}) {
 const sources = [...r.retrieved.map(s => r.sources.find(c => c.id === s.id) ?? s), ...r.sources.filter(s => !r.retrieved.some(x => x.id === s.id))];
 const edited = r.originalDraft !== null && r.originalDraft !== r.currentDraft;
 return <>
  {!r.capturedFromStart && <p className="record-notice">Partial historical snapshot. The input may have changed before this snapshot; an original start time and complete per-run history are unavailable. Earlier events can cover multiple attempts.</p>}
  {r.supersededAt && <p className="record-notice">Archived when another run began at {time(r.supersededAt)}. This record is preserved separately.</p>}
  <dl className="run-metadata"><div><dt>Mode / state</dt><dd>{r.mode === 'live' ? 'Live AI' : 'Demo (scripted)'} · {statusLabels[r.state]}</dd></div><div><dt>Case</dt><dd>{r.caseId}</dd></div><div><dt>Run ID</dt><dd>{r.id}</dd></div><div><dt>Started</dt><dd>{time(r.startedAt)}</dd></div><div><dt>Response / completion observed</dt><dd>{time(r.completedAt)}</dd></div>{r.result && <><div><dt>API request ID</dt><dd>{r.result.requestId}</dd></div><div><dt>Model / action</dt><dd>{r.result.model ?? 'Model not called'} · {r.result.action}</dd></div><div><dt>Server duration</dt><dd>{r.result.elapsedMs} ms</dd></div></>}</dl>
  <section className="record-section"><h3>Input</h3><p className="record-text">{r.input.message}</p>{r.input.followUp && <><h4>Patient follow-up at run start</h4><p className="record-text">{r.input.followUp}</p></>}</section>
  <section className="record-section"><h3>Actions and timestamps</h3><p className="workflow-note">Times use UTC. Backend steps use response-receipt timestamps; they are not separate server execution times.</p><Timeline events={r.events}/></section>
  <section className="record-section"><h3>Sources</h3>{r.result && <p className="workflow-note">{r.result.retrieval.eligibleDocuments === 0 ? 'Safety rule applied before retrieval; model not called.' : `${r.result.retrieval.method} · ${r.result.retrieval.eligibleDocuments} eligible documents · ${r.retrieved.length} retrieved`}</p>}{sources.length ? sources.map(s => <SourceRecord key={s.id} source={s} cited={r.sources.some(x => x.id === s.id)}/>) : <p>No supporting sources were returned for this run.</p>}</section>
  <section className="record-section"><h3>Output</h3><h4>{r.mode === 'live' ? 'Original model draft' : 'Original scripted draft'}</h4><p className="record-text">{r.originalDraft === null ? 'Not captured.' : r.originalDraft || 'No draft. Generation was withheld or no draft was accepted.'}</p><h4>{r.decision ? 'Draft at decision' : 'Current draft'}{edited ? ' · edited' : ''}</h4><p className="record-text">{(r.decision?.finalDraft ?? r.currentDraft) || 'No draft.'}</p>{edited && <p className="workflow-note">The edited text was not automatically revalidated against the sources.</p>}{r.error && <p className="record-notice">{r.error}</p>}</section>
  <section className="record-section"><h3>Human decision</h3>{r.decision ? <><p><strong>{r.decision.action.toUpperCase()}</strong> · {r.decision.actor} (fictional reviewer)</p><p>{time(r.decision.at)}</p>{r.decision.team && <p>Assigned to: {r.decision.team}</p>}{r.decision.note && <p className="record-text">{r.decision.note}</p>}<p>Sources at decision: {r.decision.sourceIds.join(', ') || 'None'}</p><p className="workflow-note">Local demonstration only. No patient message or staff notification was sent.</p></> : <p>{r.capturedFromStart ? 'No reviewer decision recorded for this run.' : 'No structured decision captured. See any available earlier events above.'}</p>}</section>
 </>;
}
