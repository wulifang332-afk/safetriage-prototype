import { deepseek, type ServerConfig } from './provider.ts';
import { triage, TriageError, type Generator } from './engine.ts';

const windows = new Map<string, { count: number; expires: number }>();
async function equalSecret(a: string, b: string) {
  const hash = async (value: string) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  const [left, right] = await Promise.all([hash(a), hash(b)]);
  let diff = 0; for (let i = 0; i < left.length; i++) diff |= left[i] ^ right[i];
  return diff === 0;
}
function rateLimit(key: string) {
  const now = Date.now();
  for (const [k, w] of windows) if (w.expires <= now) windows.delete(k);
  const window = windows.get(key) || { count: 0, expires: now + 60000 };
  window.count++; windows.set(key, window);
  return window.count <= 12;
}
async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.includes('application/json')) throw new TriageError('INVALID_INPUT', 'Use JSON input.', 415);
  if (Number(request.headers.get('content-length') || 0) > 12000) throw new TriageError('INPUT_TOO_LARGE', 'Request is too large.', 413);
  const reader = request.body?.getReader();
  if (!reader) throw new TriageError('INVALID_INPUT', 'Request body is required.');
  const chunks: Uint8Array[] = []; let length = 0;
  while (true) {
    const { value, done } = await reader.read(); if (done) break;
    length += value.length;
    if (length > 12000) { await reader.cancel(); throw new TriageError('INPUT_TOO_LARGE', 'Request is too large.', 413); }
    chunks.push(value);
  }
  const body = new Uint8Array(length); let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  try { return JSON.parse(new TextDecoder().decode(body)); } catch { throw new TriageError('INVALID_INPUT', 'Invalid JSON input.'); }
}

export async function handle(request: Request, config: ServerConfig, generator?: Generator): Promise<Response> {
  const origin = request.headers.get('Origin');
  const allowed = new Set((config.ALLOWED_ORIGIN || 'https://wulifang332-afk.github.io').split(',').map(s => s.trim()));
  if (config.ALLOW_LOCAL_DEV === 'true') { allowed.add('http://127.0.0.1:5173'); allowed.add('http://127.0.0.1:4173'); }
  const headers = new Headers({ 'Content-Type': 'application/json', 'Cache-Control': 'no-store', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
  if (origin && allowed.has(origin)) headers.set('Access-Control-Allow-Origin', origin);
  const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
  if (origin && !allowed.has(origin)) return reply({ error: { code: 'ORIGIN_DENIED', message: 'This origin is not allowed.' } }, 403);
  if (request.method === 'OPTIONS') {
    headers.set('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
    headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    return new Response(null, { status: 204, headers });
  }
  const path = new URL(request.url).pathname;
  if (request.method === 'GET' && path.endsWith('/health')) return reply({ service: 'SafeTriage', configured: Boolean(config.DEEPSEEK_API_KEY && config.ACCESS_CODE), provider: 'DeepSeek', model: config.LLM_MODEL || 'deepseek-flash', retrieval: 'BM25', requiresAccessCode: true });
  if (request.method !== 'POST' || !path.endsWith('/triage')) return reply({ error: { code: 'NOT_FOUND', message: 'Endpoint not found.' } }, 404);
  if (!config.ACCESS_CODE || !config.DEEPSEEK_API_KEY) return reply({ error: { code: 'SERVICE_NOT_CONFIGURED', message: 'The backend needs an API key and a demo access code.' } }, 503);
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  if (!(await equalSecret(token, config.ACCESS_CODE))) return reply({ error: { code: 'ACCESS_DENIED', message: 'Enter the demo access code supplied by the project owner.' } }, 401);
  if (!rateLimit('demo')) return reply({ error: { code: 'RATE_LIMITED', message: 'Too many requests. Please wait one minute.' } }, 429);
  try { return reply(await triage(await readJson(request), generator || deepseek(config))); }
  catch (error) {
    if (error instanceof TriageError) return reply({ error: { code: error.code, message: error.message } }, error.status);
    return reply({ error: { code: 'INTERNAL_ERROR', message: 'The request failed safely. No draft was accepted.' } }, 500);
  }
}
