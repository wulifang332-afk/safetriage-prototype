import { sources, seedCases } from '../components/safetriage/data.ts';

export type KnowledgeDocument = {
  id: string; title: string; kind: string; version: string; excerpt: string;
  applies: string; patientId?: string; tags: string[];
};
const tags: Record<string, string[]> = {
  'RX-01': ['refill', 'prescription', 'medication'],
  'SAFE-01': ['urgent', 'chest', 'breathing', 'safety'],
  'INFO-01': ['clarification', 'medication', 'symptom', 'timing'],
  'APPT-01': ['appointment', 'scheduling', 'confirmation'],
  'SEC-01': ['security', 'privacy', 'access', 'injection'],
  'PT-1042-RX': ['medication', 'refill', 'appointment'],
};
export const knowledge: KnowledgeDocument[] = [
  ...sources.map(source => ({ ...source, tags: tags[source.id] || [],
    ...(source.id === 'PT-1042-RX' ? { patientId: 'PT-1042' } : {}),
  })),
  ...seedCases.filter(p => p.id !== 'PT-1042' && p.scenario !== 'injection').map(p => ({
    id: `${p.id}-RECORD`, title: `${p.name} — fictional patient record`,
    kind: 'Fictional patient record', version: 'v1.0 · 07 Oct 2026', patientId: p.id,
    excerpt: `Patient ${p.id}, ${p.name}. Medication: ${p.medication}. Allergies: ${p.allergies}. Appointment: ${p.appointment}. This synthetic record does not authorize prescribing or clinical advice.`,
    applies: 'Supplies recorded facts for this patient only. Missing details must not be invented.',
    tags: ['patient', 'medication', 'appointment'],
  })),
];
export const patients = new Map(seedCases.map(p => [p.id, p]));
