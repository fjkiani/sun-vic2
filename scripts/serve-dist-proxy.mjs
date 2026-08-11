// serve-dist-proxy — serve the freshly built dist/ and proxy /api/* to a real deployment.
//
// Why this exists: the only honest way to verify the new PDF text layer, click-to-edit and
// scroll sync is to load the actual built bundle in a real browser against real documents.
// `vite preview` alone has no API, and the deployed site is still running the old bundle.
// So: our bundle, production's data.
//
// Usage: node scripts/serve-dist-proxy.mjs [--port 4180] [--target https://sun-vic2.vercel.app]

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';

const args = process.argv.slice(2);
const arg = (n, d) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : d; };
const PORT = Number(arg('--port', '4180'));
const TARGET = arg('--target', process.env.E2E_BASE || 'https://sun-vic2.vercel.app');
const DIST = path.resolve('dist');

const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.woff2': 'font/woff2', '.map': 'application/json', '.ico': 'image/x-icon',
};

async function serveFile(res, filePath) {
  const buf = await readFile(filePath);
  res.writeHead(200, { 'content-type': MIME[path.extname(filePath)] || 'application/octet-stream' });
  res.end(buf);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (url.pathname.startsWith('/api/')) {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const headers = { ...req.headers };
    delete headers.host; delete headers['content-length']; delete headers['accept-encoding'];
    try {
      const upstream = await fetch(`${TARGET}${url.pathname}${url.search}`, {
        method: req.method, headers, body, redirect: 'manual',
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, {
        'content-type': upstream.headers.get('content-type') || 'application/json',
      });
      res.end(text);
    } catch (e) {
      res.writeHead(502, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: 'proxy_failed', detail: String(e) }));
    }
    return;
  }

  const rel = url.pathname === '/' ? '/index.html' : url.pathname;
  const candidate = path.join(DIST, rel);
  try {
    const s = await stat(candidate);
    if (s.isFile()) return void await serveFile(res, candidate);
  } catch { /* fall through to SPA index */ }
  try {
    await serveFile(res, path.join(DIST, 'index.html'));   // SPA deep links
  } catch {
    res.writeHead(404); res.end('no dist/ — run npm run build first');
  }
});

server.listen(PORT, () => console.log(`serving dist/ on http://localhost:${PORT} → api proxied to ${TARGET}`));
