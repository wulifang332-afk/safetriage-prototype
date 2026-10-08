import { Badge } from '@/components/ui/badge';
import { Check, FileText, ChevronRight, Clock3 } from 'lucide-react';
import { PatientCase, CaseStatus, statusLabels, sourceFor } from './data';
export function Status({status}:{status:CaseStatus}) {return <Badge className={`status status-${status}`}>{statusLabels[status]}</Badge>}
export function Avatar({patient,large=false}:{patient:PatientCase;large?:boolean}) {return <span className={`patient-avatar avatar-${patient.scenario} ${large?'large':''}`}>{patient.initials}</span>}
export function SourceButton({id,index,onClick,patient}:{id:string;index?:number;onClick:()=>void;patient:PatientCase}) {const s=sourceFor(id,patient);return <button className="source-link" onClick={onClick}><FileText size={16}/>{index!==undefined&&<b>[{index+1}]</b>}<span>{s?.title||id}</span><ChevronRight size={15}/></button>}
export function StepDot({done=false}:{done?:boolean}){return <span className={`step-dot ${done?'done':''}`}>{done?<Check size={11}/>:<Clock3 size={11}/>}</span>}
