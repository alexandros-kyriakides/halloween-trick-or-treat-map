// Serves the production build plus a stand-in AppSync endpoint (same request/response shapes),
// so the real fetch-based client in src/api.ts can be exercised end to end.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createSimBackend } from '../devsim/backend.js';
import { EVENT_SETTINGS } from '../amplify/settings.ts';

const DIST = process.argv[2] ?? 'dist';
const PORT = Number(process.argv[3] ?? 4180);
const KEY = 'da2-testkey';
const sim = createSimBackend({ env: { ...EVENT_SETTINGS, GROUP_CODE: process.env.GROUP_CODE ?? 'TESTCODE' } });
import { readFileSync } from 'node:fs';
const CSP = readFileSync('customHttp.yml', 'utf8').match(/Content-Security-Policy\n\s+value: "([^"]+)"/)[1];
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.svg': 'image/svg+xml', '.json': 'application/json' };

http.createServer(async (req, res) => {
  if (req.url === '/amplify_outputs.json') {
    res.writeHead(200, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ version: '1.4', data: { url: `http://localhost:${PORT}/graphql`, aws_region: 'eu-central-1', api_key: KEY, default_authorization_type: 'API_KEY' } }));
  }
  if (req.url === '/graphql' && req.method === 'POST') {
    let body = '';
    for await (const c of req) body += c;
    const { query, variables } = JSON.parse(body);
    res.writeHead(200, { 'content-type': 'application/json' });
    if (req.headers['x-api-key'] !== KEY) return res.end(JSON.stringify({ errors: [{ errorType: 'UnauthorizedException', message: 'bad key' }] }));
    const field = query.match(/\{\s*(\w+)\s*\(/)[1];
    try {
      const data = await sim.call(field, variables);
      return res.end(JSON.stringify({ data: { [field]: data } }));
    } catch (e) {
      return res.end(JSON.stringify({ data: null, errors: [{ path: [field], errorType: e.errorType, message: e.message, errorInfo: e.errorInfo, data: null }] }));
    }
  }
  const path = req.url === '/' || !extname(req.url.split('?')[0]) ? '/index.html' : req.url.split('?')[0];
  try {
    const file = await readFile(join(DIST, path));
    res.writeHead(200, { 'content-type': types[extname(path)] ?? 'application/octet-stream', 'content-security-policy': CSP });
    res.end(file);
  } catch {
    res.writeHead(404).end();
  }
}).listen(PORT, () => console.log(`listening ${PORT}`));
