// Loads sample data so the team can try the system. Safe to run once on an empty database.
import { openDb } from './db.js';
import { makeApi } from './app.js';

const db = openDb();
if (db.prepare('SELECT COUNT(*) n FROM ingredients').get().n > 0) {
  console.log('Database already has data; nothing seeded. Delete data/erp.db first to start over.');
  process.exit(0);
}
const api = makeApi(db);
const post = (p, b) => api.handle('POST', p, {}, b);

const I = {};
for (const [key, name, lo, unit, sub, factor, cost, open, min] of [
  ['rice', 'Rice', 'ເຂົ້າ', 'kg', 'g', 1000, 10000, 20, 5],
  ['chicken', 'Chicken', 'ຊີ້ນໄກ່', 'kg', 'g', 1000, 53333, 21, 5],
  ['egg', 'Egg', 'ໄຂ່', 'pcs', '', 1, 2000, 60, 10],
  ['oil', 'Cooking oil', 'ນ້ຳມັນປຸງອາຫານ', 'l', 'ml', 1000, 50000, 10, 2],
  ['season', 'Seasoning', 'ເຄື່ອງປຸງ', 'kg', 'g', 1000, 100000, 5, 1],
  ['coffee', 'Coffee beans', 'ເມັດກາເຟ', 'kg', 'g', 1000, 120000, 3, 0.5],
  ['milk', 'Condensed milk', 'ນົມຂຸ້ນ', 'l', 'ml', 1000, 30000, 6, 1],
]) I[key] = await post('/api/ingredients', { name, name_lo: lo, unit, sub_unit: sub, factor, unit_cost: cost, opening_qty: open, min_stock: min });

const r = (...p) => p.map(([k, q]) => ({ ingredient_id: I[k].id, qty_sub: q }));
await post('/api/menu', { name: 'Chicken Fried Rice', name_lo: 'ເຂົ້າຜັດໄກ່', category: 'Main', price: 50000, recipe: r(['rice', 200], ['chicken', 150], ['egg', 1], ['oil', 20], ['season', 10]) });
await post('/api/menu', { name: 'Egg Fried Rice', name_lo: 'ເຂົ້າຜັດໄຂ່', category: 'Main', price: 35000, recipe: r(['rice', 200], ['egg', 2], ['oil', 20], ['season', 10]) });
await post('/api/menu', { name: 'Iced Coffee', name_lo: 'ກາເຟເຢັນ', category: 'Drinks', price: 20000, recipe: r(['coffee', 20], ['milk', 30]) });
await post('/api/suppliers', { name: 'Talat Sao Market', phone: '020 5555 0000', note: 'Meat and eggs' });
console.log('Sample data loaded: 7 ingredients, 3 menu items, 1 supplier.');
