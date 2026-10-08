import { knowledge, type KnowledgeDocument } from './knowledge.ts';
import type { RetrievedSource } from '../shared/triage.ts';

const stopWords = new Set('a an and are as at be been before by can could do for from had has have hi i in is it its me my of on or please so that the their them there these they this to was we were what when where which with would you your thank thanks hello about also'.split(' '));
const synonyms: Record<string, string> = {
  medicines: 'medication', medicine: 'medication', tablet: 'medication', tablets: 'medication',
  drug: 'medication', pills: 'medication', pill: 'medication',
  booking: 'appointment', booked: 'appointment', visit: 'appointment',
  confirm: 'confirmation', confirming: 'confirmation', renew: 'refill', renewal: 'refill',
  refill: 'refill', symptoms: 'symptom', strange: 'symptom', unclear: 'clarification',
  breath: 'breathing', breathe: 'breathing', instructions: 'instruction',
};
export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9]+/g) || [])
    .filter(t => t.length > 1 && !stopWords.has(t))
    .map(t => synonyms[t] || t.replace(/(?:ing|ed|s)$/, ''));
}

// BM25 ranks actual query/document overlap; no scenario-to-document lookup is used.
// Scope filtering happens before scoring, so other patient records cannot enter the prompt.
export function retrieve(query: string, patientId: string, limit = 4, corpus = knowledge) {
  const start = performance.now();
  const eligible = corpus.filter(d => !d.patientId || d.patientId === patientId);
  const terms = eligible.map(d => tokenize(`${d.title} ${d.tags.join(' ')} ${d.excerpt}`));
  const lengths = terms.map(t => t.length);
  const average = lengths.reduce((a, b) => a + b, 0) / Math.max(1, eligible.length);
  const queryTerms = [...new Set(tokenize(query))];
  const ranked = eligible.map((doc, index) => {
    const words = terms[index];
    const score = queryTerms.reduce((total, word) => {
      const frequency = words.filter(t => t === word).length;
      if (!frequency) return total;
      const containing = terms.filter(ts => ts.includes(word)).length;
      const idf = Math.log(1 + (eligible.length - containing + 0.5) / (containing + 0.5));
      return total + idf * (frequency * 2.5) / (frequency + 1.5 * (0.25 + 0.75 * words.length / (average || 1)));
    }, 0);
    return { doc, score };
  }).filter(r => r.score > 0).sort((a, b) => b.score - a.score || a.doc.id.localeCompare(b.doc.id));
  return {
    sources: ranked.slice(0, limit).map(({ doc, score }) => toSource(doc, score)),
    metadata: { method: 'BM25' as const, query, eligibleDocuments: eligible.length, elapsedMs: Math.round(performance.now() - start) },
  };
}
export function toSource(doc: KnowledgeDocument, score = 0): RetrievedSource {
  const { patientId: _patientId, tags: _tags, ...source } = doc;
  return { ...source, score: Math.round(score * 1000) / 1000 };
}
