'use client';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import type { EngineSettings, TriageResult } from '../../shared/triage';
import { seedCases, initialEvents, PatientCase, Event, CaseStatus } from './data';
export function useDemoStore(settings:EngineSettings){
 const STORAGE=settings.mode==='live'?'safetriage-live-v1':'safetriage-demo-v1';
 const freshCases=()=>settings.mode==='demo'?seedCases:seedCases.map(p=>({...p,status:'new' as CaseStatus,draft:'',sources:[],summary:'',steps:[]}));
 const controller=useRef<AbortController|null>(null); const generation=useRef(0);
 const [cases,setCases]=useState<PatientCase[]>(freshCases); const [events,setEvents]=useState<Event[]>(settings.mode==='demo'?initialEvents:[]); const [loaded,setLoaded]=useState(false); const timers=useRef<ReturnType<typeof setTimeout>[]>([]); const busy=useRef(false);
 useEffect(()=>{try{const raw=localStorage.getItem(STORAGE);if(raw){const s=JSON.parse(raw);if(s.version===1&&Array.isArray(s.cases)&&s.cases.length===seedCases.length&&s.cases.every((p:PatientCase)=>seedCases.some(x=>x.id===p.id)&&typeof p.draft==='string')&&Array.isArray(s.events)){setCases(s.cases.map((p:PatientCase)=>({...p,status:p.status==='running'?'paused':p.status})));setEvents(s.events)}}}catch{/* A corrupt browser demo is safely replaced with fixtures. */}setLoaded(true);return()=>{generation.current++;controller.current?.abort();timers.current.forEach(clearTimeout)}},[]);
 useEffect(()=>{if(!loaded)return;try{localStorage.setItem(STORAGE,JSON.stringify({version:1,cases,events}))}catch{toast.error('Browser storage is unavailable. Progress will last for this session only.')}},[cases,events,loaded]);
 function log(caseId:string,action:string,detail:string,actor='Demo agent'){setEvents(old=>[...old,{id:crypto.randomUUID(),at:new Date().toISOString(),caseId,actor,action,detail}])}
 function update(id:string,patch:Partial<PatientCase>){setCases(old=>old.map(p=>p.id===id?{...p,...patch}:p))}
 function run(id:string){if(settings.mode==='live'){void runLive(id);return}const p=cases.find(x=>x.id===id);if(!p||busy.current||!['new','paused'].includes(p.status))return;busy.current=true;update(id,{status:'running'});log(id,'Workflow started','Scenario fixture: '+p.scenario+'. No live model or external service is called.','Workflow');
  const blocked=['urgent','injection','unavailable'].includes(p.scenario);
  const stages=p.scenario==='urgent'?[['Risk signal identified','Original message contains a fixture-defined urgent safety concern.','safety_check'],['Routine drafting stopped','No reassuring draft was created. SAFE-01 applies.','safety_check']]:p.scenario==='injection'?[['Untrusted instruction detected','Attempt to override approval and access another patient was isolated.','input_guard'],['Cross-patient access blocked','No patient lookup executed. SEC-01 applies.','access_guard']]:[['Patient records retrieved','Read-only lookup scoped to '+p.id+'.','patient_lookup'],[p.scenario==='unavailable'?'Source unavailable':'Policy retrieved',p.scenario==='unavailable'?'Required procedure guidance unavailable. No unsupported draft created.':'Retrieved '+p.sources.join(', ')+'. Exact source excerpts are available.','guideline_search']];
  stages.forEach((s,i)=>timers.current.push(setTimeout(()=>log(id,s[0],s[1],s[2]),450*(i+1))));
  timers.current.push(setTimeout(()=>{update(id,{status:blocked?'blocked':'review'});log(id,blocked?'Safety stop — staff action needed':'Awaiting your review',blocked?p.summary:'Draft prepared. Human approval required before simulated sending.','Workflow');busy.current=false},450*(stages.length+1)));
 }
 function edit(id:string,draft:string){update(id,{draft})}
 function approve(id:string,acknowledged:boolean){const p=cases.find(x=>x.id===id);if(!p||p.status!=='review'||!acknowledged||!p.draft.trim())return false;const waiting=settings.mode==='live'?p.ai?.action==='clarify':p.scenario==='missing'&&!p.followUp;update(id,{status:waiting?'awaiting':'sent'});log(id,waiting?'Clarification approved':'Reply approved',`Reviewer: Mia Chen. Sources: ${p.sources.join(', ')}. Final draft: ${p.draft}`,'Mia Chen');log(id,waiting?'Waiting for patient information':'Simulated reply sent','Local demonstration only. No actual patient message was sent.','Workflow');toast.success(waiting?'Clarification approved. Case saved while waiting.':'Reply approved and added to the simulated conversation.');return true}
 function decide(id:string,action:'escalated'|'rejected',note:string,team:string){const p=cases.find(x=>x.id===id);if(!p||!['review','blocked'].includes(p.status)||!note.trim())return false;update(id,{status:action,reviewerNote:note});log(id,action==='escalated'?'Case escalated':'Draft rejected',`${action==='escalated'?'Assigned to '+team+'. ':''}${note} No reply sent.`,'Mia Chen');toast.success(action==='escalated'?`Handoff recorded for ${team}.`:'Draft rejected. No reply sent.');return true}
 function followUp(id:string,customMessage?:string){const p=cases.find(x=>x.id===id);if(!p||p.status!=='awaiting'||(settings.mode==='demo'&&p.scenario!=='missing'))return;if(settings.mode==='live'&&(!customMessage||customMessage.trim().length<5))return;const message=settings.mode==='live'?customMessage!.trim().slice(0,2000):'It was my new iron tablet yesterday evening. I meant a metallic taste, which has gone away. I feel fine now.';update(id,{followUp:message,status:'paused',ai:undefined,sources:settings.mode==='live'?[]:p.sources,runError:undefined,summary:'The patient has supplied the medication, timing and symptom description. Resume the workflow to prepare a staff-reviewed acknowledgement.',draft:settings.mode==='live'?'':'Hi Aisha, thank you for clarifying that you noticed a metallic taste after your new iron tablet and that this has now resolved. We will share your update with the care team for review. [1]\n\nKind regards,\nHarbour Primary Care',steps:['Read the new patient information','Recheck the message against the demo safety policy','Prepare an acknowledgement for clinician review']});log(id,'Patient follow-up received',message,'Simulated patient');toast.success('Demo patient response added. Resume triage to continue.')}
 function reset(){generation.current++;controller.current?.abort();timers.current.forEach(clearTimeout);timers.current=[];busy.current=false;setCases(freshCases());setEvents(settings.mode==='demo'?initialEvents:[]);toast.success('Demo reset. All six scenarios are ready.')}

 function message(id:string,value:string){
  const p=cases.find(x=>x.id===id);if(!p||busy.current||!['new','paused'].includes(p.status))return;
  update(id,{message:value.slice(0,2000),draft:'',sources:[],ai:undefined,runError:undefined});
 }
 async function runLive(id:string){
  const p=cases.find(x=>x.id===id);if(!p||busy.current||!['new','paused','review','blocked'].includes(p.status))return;
  if(!settings.apiUrl||!settings.accessCode){toast.error('Open AI connection settings to configure the backend and demo access code.');return}
  const epoch=++generation.current; const request=new AbortController();controller.current=request;busy.current=true;
  update(id,{status:'running',draft:'',sources:[],ai:undefined,runError:undefined});
  log(id,'Live request started','The backend will retrieve scoped evidence and apply safety controls before calling DeepSeek.','Workflow');
  try{
   const response=await fetch(`${settings.apiUrl.replace(/\/$/,'')}/api/triage`,{method:'POST',headers:{'Content-Type':'application/json',Authorization:`Bearer ${settings.accessCode}`},body:JSON.stringify({caseId:id,message:p.message,...(p.followUp?{followUp:p.followUp}:{})}),signal:AbortSignal.any([request.signal,AbortSignal.timeout(55000)])});
   let body: TriageResult&{error?:{message?:string}};
   try{body=await response.json()}catch{throw new Error('The backend did not return a valid response. Check its deployment and URL.')}
   if(!response.ok)throw new Error(body.error?.message||'Live triage failed. No generated reply was accepted.');
   if(epoch!==generation.current)return;
   if(!body.requestId||!['draft','clarify','escalate'].includes(body.action)||!Array.isArray(body.sources)||!Array.isArray(body.trace))throw new Error('The backend response was incomplete. No draft was accepted.');
   update(id,{status:body.action==='escalate'?'blocked':'review',draft:body.draft,summary:body.summary,urgency:body.urgency,category:body.category,sources:body.sources.map(s=>s.id),steps:body.steps,ai:body,runError:undefined});
   for(const event of body.trace)log(id,event.action,event.detail,event.actor);
  }catch(error){
   if(epoch!==generation.current)return;
   const detail=error instanceof Error&&error.name==='TimeoutError'?'The request timed out. Retry or route the case to staff.':error instanceof Error?error.message:'Could not reach the backend. Check the connection and try again.';
   update(id,{status:'paused',draft:'',sources:[],runError:detail,ai:undefined});log(id,'Live request failed',detail,'Workflow');toast.error(detail);
  }finally{if(epoch===generation.current){busy.current=false;controller.current=null}}
 }
 return {cases,events,loaded,run,edit,message,approve,decide,followUp,reset};
}
