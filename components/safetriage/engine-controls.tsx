import { useState } from 'react';
import { Settings2, Radio, FlaskConical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import type { EngineSettings } from '../../shared/triage';

export function initialSettings(): EngineSettings {
  const apiUrl = import.meta.env.VITE_API_BASE_URL || 'https://safetriage-api.vercel.app';
  let settings: EngineSettings = { mode: apiUrl ? 'live' : 'demo', apiUrl, accessCode: '' };
  try {
    const saved = JSON.parse(localStorage.getItem('safetriage-engine-v1') || 'null');
    if (saved && ['demo', 'live'].includes(saved.mode)) settings = { ...settings, mode: saved.mode, apiUrl: typeof saved.apiUrl === 'string' ? saved.apiUrl : apiUrl };
    settings.accessCode = sessionStorage.getItem('safetriage-access-code') || '';
  } catch { /* Storage is optional; credentials remain in component memory. */ }
  return settings;
}
export function saveSettings(settings: EngineSettings) {
  try {
    localStorage.setItem('safetriage-engine-v1', JSON.stringify({ mode: settings.mode, apiUrl: settings.apiUrl }));
    if (settings.accessCode) sessionStorage.setItem('safetriage-access-code', settings.accessCode);
    else sessionStorage.removeItem('safetriage-access-code');
  } catch { /* In-memory use remains available. */ }
}
export function EngineControls({ settings, onChange, busy }: { settings: EngineSettings; onChange: (s: EngineSettings) => void; busy: boolean }) {
  const [open, setOpen] = useState(settings.mode==='live'&&!settings.accessCode);
  const [url, setUrl] = useState(settings.apiUrl);
  const [code, setCode] = useState(settings.accessCode);
  const [status, setStatus] = useState('');
  const [checking, setChecking] = useState(false);
  function show() { setUrl(settings.apiUrl); setCode(settings.accessCode); setStatus(''); setOpen(true); }
  function normalizedUrl() {
    const parsed = new URL(url.trim());
    const local = ['127.0.0.1', 'localhost'].includes(parsed.hostname);
    if ((parsed.protocol !== 'https:' && !(local && parsed.protocol === 'http:')) || parsed.username || parsed.password || parsed.search || parsed.hash) throw new Error('Use an HTTPS backend URL, or localhost for development.');
    return parsed.origin + parsed.pathname.replace(/\/$/, '');
  }
  async function check() {
    setChecking(true); setStatus('Checking backend…');
    try {
      const base = normalizedUrl();
      const response = await fetch(`${base}/api/health`, { signal: AbortSignal.timeout(10000) });
      const value = await response.json();
      if (!response.ok || value.service !== 'SafeTriage') throw new Error('This URL is not a SafeTriage backend.');
      setStatus(value.configured ? `Backend configured · ${value.model} · ${value.retrieval}. Model credit is checked when a case runs.` : 'Backend reachable, but its API key or access code is missing.');
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Could not reach the backend.'); }
    finally { setChecking(false); }
  }
  function connect() {
    try {
      const apiUrl = normalizedUrl();
      if (!code.trim()) throw new Error('Enter the demo access code, not an API key.');
      if (/^sk-/i.test(code.trim())) throw new Error('Use the demo access code. Provider API keys belong only on the backend.');
      onChange({ mode: 'live', apiUrl, accessCode: code.trim() }); setOpen(false);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Check the connection settings.'); }
  }
  return <><div className="engine-controls" aria-label="Generation mode">
    <button className={settings.mode === 'demo' ? 'selected' : ''} disabled={busy} onClick={() => onChange({ ...settings, mode: 'demo' })}><FlaskConical size={13}/>Demo</button>
    <button className={settings.mode === 'live' ? 'selected' : ''} disabled={busy} onClick={() => settings.apiUrl && settings.accessCode ? onChange({ ...settings, mode: 'live' }) : show()}><Radio size={13}/>Live AI</button>
    <button aria-label="AI connection settings" disabled={busy} onClick={show}><Settings2 size={15}/></button>
  </div><Dialog open={open} onOpenChange={setOpen}><DialogContent className="engine-dialog"><DialogHeader><DialogTitle>Connect Live AI</DialogTitle><DialogDescription>Use DeepSeek with the project's fictional knowledge library. Drafts still require human review.</DialogDescription></DialogHeader>
    <details className="backend-settings"><summary>Backend connection</summary><label className="engine-field">Backend URL<Input aria-label="Backend URL" placeholder="https://your-project.vercel.app" value={url} onChange={e => setUrl(e.target.value)}/></label></details>
    <label className="engine-field">Demo access code<Input aria-label="Demo access code" type="password" autoComplete="off" value={code} onChange={e => setCode(e.target.value)}/><small>Provided by the project owner. Saved for this browser tab's session. Do not enter a provider API key.</small></label>
    <p className="engine-note">Demo runs fixed scenarios. Live AI retrieves relevant sources and asks DeepSeek to generate a new draft. Only fictional messages belong in this teaching prototype.</p>
    {status && <p className="engine-status" role="status">{status}</p>}
    <DialogFooter><Button variant="outline" disabled={checking} onClick={check}>{checking ? 'Checking…' : 'Check backend'}</Button><Button onClick={connect}>Use Live AI</Button></DialogFooter>
  </DialogContent></Dialog></>;
}
