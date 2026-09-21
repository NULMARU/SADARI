import { createServer } from 'node:http';
import { readFileSync, readdirSync, mkdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import worker from './server/worker.js';
mkdirSync('.sites-runtime', { recursive: true });
const sqlite = new DatabaseSync('.sites-runtime/dev.sqlite');
if (!sqlite.prepare("SELECT name FROM sqlite_master WHERE name = 'rooms'").get()) {
  for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) sqlite.exec(readFileSync('drizzle/' + file, 'utf8'));
}
const DB = { prepare(sql) { let values = []; return { bind(...v) { values = v; return this; }, async first() { return sqlite.prepare(sql).get(...values) || null; }, async run() { const r = sqlite.prepare(sql).run(...values); return { meta: { changes: Number(r.changes) } }; } }; } };
const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml' };
createServer(async (req, res) => {
  try {
    const base = 'http://' + req.headers.host;
    const path = new URL(req.url, base).pathname;
    if (['/', '/index.html', '/style.css', '/script.js', '/favicon.svg'].includes(path)) {
      const file = path === '/' ? 'index.html' : path.slice(1);
      res.writeHead(200, { 'Content-Type': types[file.slice(file.lastIndexOf('.'))] }); res.end(readFileSync(file)); return;
    }
    const chunks = []; for await (const chunk of req) chunks.push(chunk);
    const request = new Request(new URL(req.url, base), { method: req.method, headers: req.headers, ...(!['GET', 'HEAD'].includes(req.method) ? { body: Buffer.concat(chunks), duplex: 'half' } : {}) });
    const response = await worker.fetch(request, { DB });
    res.writeHead(response.status, Object.fromEntries(response.headers)); res.end(Buffer.from(await response.arrayBuffer()));
  } catch (error) { console.error(error); res.writeHead(500); res.end('Local server error'); }
}).listen(4173, '127.0.0.1', () => console.log('Local: http://127.0.0.1:4173'));
