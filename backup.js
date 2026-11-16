// Makes a dated copy of the database in data/backups. Run daily with Windows Task Scheduler:
//   node --disable-warning=ExperimentalWarning backup.js
// Then copy the data/backups folder to a USB drive or cloud folder.
import fs from 'node:fs';
import path from 'node:path';
import { openDb } from './db.js';

const file = process.env.ERP_DB || 'data/erp.db';
if (!fs.existsSync(file)) { console.error(`No database at ${file}`); process.exit(1); }
const db = openDb(file);
const dir = path.join(path.dirname(file), 'backups');
fs.mkdirSync(dir, { recursive: true });
const stamp = new Date().toISOString().replace(/[-:T]/g, '').slice(0, 14);
const out = path.join(dir, `erp-${stamp}.db`);
db.exec(`VACUUM INTO '${out.replace(/'/g, "''")}'`);
// keep the newest 30 backups
const all = fs.readdirSync(dir).filter((f) => f.endsWith('.db')).sort();
for (const f of all.slice(0, Math.max(0, all.length - 30))) fs.unlinkSync(path.join(dir, f));
console.log(`Backup saved: ${out}`);
