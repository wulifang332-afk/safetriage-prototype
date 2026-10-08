import { createServer } from 'node:http';
import { Readable } from 'node:stream';
import { handle } from './http.ts';
const port = Number(process.env.PORT || 8787);
const server = createServer(async (req, res) => {
  try {
    const controller = new AbortController();
    req.on('aborted', () => controller.abort());
    const init: RequestInit & { duplex?: 'half' } = { method: req.method, headers: req.headers as HeadersInit, signal: controller.signal };
    if (req.method !== 'GET' && req.method !== 'HEAD') { init.body = Readable.toWeb(req) as ReadableStream; init.duplex = 'half'; }
    const response = await handle(new Request(`http://127.0.0.1:${port}${req.url}`, init), { ...process.env, ALLOW_LOCAL_DEV: 'true' });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(await response.text());
  } catch { res.writeHead(500, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Request failed safely.' } })); }
});
server.listen(port, '127.0.0.1', () => console.log(`SafeTriage backend: http://127.0.0.1:${port}`));
