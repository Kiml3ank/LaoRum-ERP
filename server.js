import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { makeApi } from './app.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, 'public');
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json' };

export function makeServer(db) {
  const api = makeApi(db);

  const backup = () => {
    const dir = path.join(path.dirname(process.env.ERP_DB || 'data/erp.db'), 'backups');
    fs.mkdirSync(dir, { recursive: true });
    const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
    const file = path.join(dir, `erp-${stamp}.db`);
    db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
    return { file };
  };

  const send = (res, status, data, headers = {}) => {
    const isStr = typeof data === 'string';
    res.writeHead(status, { 'Content-Type': isStr ? 'text/plain; charset=utf-8' : 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers });
    res.end(isStr ? data : JSON.stringify(data));
  };

  return http.createServer(async (req, res) => {
    const url = new URL(req.url, 'http://x');
    try {
      if (url.pathname.startsWith('/api/')) {
        let body;
        if (req.method === 'POST' || req.method === 'PUT') {
          let raw = '';
          for await (const chunk of req) { raw += chunk; if (raw.length > 1e6) throw new api.HttpError(413, 'Request too large'); }
          try { body = raw ? JSON.parse(raw) : {}; } catch { throw new api.HttpError(400, 'Invalid JSON'); }
        }
        if (req.method === 'POST' && url.pathname === '/api/backup') return send(res, 200, backup());
        const out = await api.handle(req.method, url.pathname, Object.fromEntries(url.searchParams), body);
        if (out === undefined) return send(res, 404, { error: 'Not found' });
        if (out && out.csv !== undefined) return send(res, 200, out.csv, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${out.filename}"` });
        return send(res, 200, out);
      }
      // static files
      let rel = decodeURIComponent(url.pathname);
      if (rel === '/') rel = '/index.html';
      const file = path.normalize(path.join(PUBLIC, rel));
      if (!file.startsWith(PUBLIC + path.sep)) return send(res, 403, 'Forbidden');
      if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) return send(res, 404, 'Not found');
      res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
      fs.createReadStream(file).pipe(res);
    } catch (e) {
      if (e instanceof api.HttpError) return send(res, e.status, { error: e.message });
      if (/constraint/i.test(e.message || '')) return send(res, 400, { error: 'Invalid data: ' + e.message });
      console.error(e);
      send(res, 500, { error: 'Server error' });
    }
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 3100;
  const db = openDb();
  makeServer(db).listen(port, '0.0.0.0', () => {
    console.log(`LaoRum ERP running.\n  On this PC:  http://localhost:${port}`);
    for (const list of Object.values(os.networkInterfaces()))
      for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`  On the team: http://${n.address}:${port}   (same Wi-Fi/network)`);
  });
}
