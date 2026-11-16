import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';

export function openDb(file = process.env.ERP_DB || 'data/erp.db') {
  if (file !== ':memory:') fs.mkdirSync(file.replace(/[\\/][^\\/]*$/, '') || '.', { recursive: true });
  const db = new DatabaseSync(file);
  db.exec(`
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS ingredients (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_lo TEXT DEFAULT '',
  unit TEXT NOT NULL,                 -- stock and purchase unit, e.g. kg
  sub_unit TEXT DEFAULT '',           -- recipe unit, e.g. g (blank = same as unit)
  factor REAL DEFAULT 1,              -- how many sub_units in one unit (kg to g = 1000)
  min_stock REAL DEFAULT 0, unit_cost REAL DEFAULT 0, -- unit_cost is per stock unit
  active INTEGER DEFAULT 1
);
-- Every change to stock is one row here. Stock on hand = SUM(qty).
-- type: receive | sale | waste | staff | adjust | count
CREATE TABLE IF NOT EXISTS stock_moves (
  id INTEGER PRIMARY KEY, ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  qty REAL NOT NULL, type TEXT NOT NULL, ref TEXT DEFAULT '', note TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_moves_ing ON stock_moves(ingredient_id);

CREATE TABLE IF NOT EXISTS menu_items (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, name_lo TEXT DEFAULT '',
  category TEXT DEFAULT '', price REAL NOT NULL, active INTEGER DEFAULT 1
);
CREATE TABLE IF NOT EXISTS recipe_lines (
  menu_id INTEGER NOT NULL REFERENCES menu_items(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id), qty REAL NOT NULL,
  PRIMARY KEY (menu_id, ingredient_id)
);

CREATE TABLE IF NOT EXISTS suppliers (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, phone TEXT DEFAULT '', note TEXT DEFAULT ''
);
-- status: draft | approved | received | cancelled
CREATE TABLE IF NOT EXISTS purchase_orders (
  id INTEGER PRIMARY KEY, supplier_id INTEGER REFERENCES suppliers(id),
  status TEXT DEFAULT 'draft', note TEXT DEFAULT '', invoice_no TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now','localtime')), received_at TEXT
);
CREATE TABLE IF NOT EXISTS po_lines (
  po_id INTEGER NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  ingredient_id INTEGER NOT NULL REFERENCES ingredients(id),
  qty REAL NOT NULL, unit_cost REAL NOT NULL, received_qty REAL
);

-- status: open | paid | void | refunded ; type: dine_in | takeaway | delivery
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, table_no TEXT DEFAULT '', type TEXT DEFAULT 'dine_in',
  status TEXT DEFAULT 'open', method TEXT DEFAULT '', discount REAL DEFAULT 0, total REAL DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now','localtime')), paid_at TEXT
);
CREATE TABLE IF NOT EXISTS order_lines (
  id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  menu_id INTEGER NOT NULL REFERENCES menu_items(id), qty INTEGER NOT NULL,
  price REAL NOT NULL, cost REAL DEFAULT 0
);
`);
  return db;
}

// run fn inside a transaction; roll back on any error
export function tx(db, fn) {
  db.exec('BEGIN');
  try { const r = fn(); db.exec('COMMIT'); return r; }
  catch (e) { db.exec('ROLLBACK'); throw e; }
}
