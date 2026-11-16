// Runs the acceptance scenarios T1-T8 from the requirements doc against an in-memory database.
import assert from 'node:assert/strict';
import { openDb } from './db.js';
import { makeServer } from './server.js';

const db = openDb(':memory:');
const server = makeServer(db);
await new Promise((r) => server.listen(0, r));
const base = `http://127.0.0.1:${server.address().port}`;

const call = async (method, path, body) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data };
};
const ok = async (...a) => { const r = await call(...a); assert.equal(r.status, 200, `${a[0]} ${a[1]} -> ${r.status} ${JSON.stringify(r.data)}`); return r.data; };
const fails = async (status, ...a) => { const r = await call(...a); assert.equal(r.status, status, `${a[0]} ${a[1]} expected ${status}, got ${r.status}`); return r.data; };
let passed = 0;
const test = async (name, fn) => { await fn(); passed++; console.log('  ok  ' + name); };

// ingredients: stock unit kg/l/pcs, recipe units g/ml/pcs. Costs are per stock unit.
const ing = async (name, unit, sub, factor, unit_cost, opening_qty, min_stock = 0) =>
  ok('POST', '/api/ingredients', { name, unit, sub_unit: sub, factor, unit_cost, opening_qty, min_stock });
const rice = await ing('Rice', 'kg', 'g', 1000, 10000, 20, 5);
const chicken = await ing('Chicken', 'kg', 'g', 1000, 53333.3333333, 21, 5);
const egg = await ing('Egg', 'pcs', '', 1, 2000, 60, 10);
const oil = await ing('Cooking oil', 'l', 'ml', 1000, 50000, 10, 2);
const season = await ing('Seasoning', 'kg', 'g', 1000, 100000, 5, 1);
const coffee = await ing('Coffee beans', 'kg', 'g', 1000, 120000, 3, 0.5);

const rec = (...p) => p.map(([i, q]) => ({ ingredient_id: i.id, qty_sub: q }));
let friedRice, iced;

await test('T1 recipe cost 14,000 and food cost 28%', async () => {
  friedRice = await ok('POST', '/api/menu', { name: 'Chicken Fried Rice', name_lo: 'ເຂົ້າຜັດໄກ່', price: 50000,
    recipe: rec([rice, 200], [chicken, 150], [egg, 1], [oil, 20], [season, 10]) });
  assert.ok(Math.abs(friedRice.cost - 14000) < 1, `cost ${friedRice.cost}`);
  assert.ok(Math.abs(friedRice.food_cost_pct - 28) < 0.01);
  iced = await ok('POST', '/api/menu', { name: 'Iced Coffee', price: 20000, recipe: rec([coffee, 20]) });
});

let order;
await test('T2 order of 2 fried rice + 1 coffee paid by QR deducts stock', async () => {
  order = await ok('POST', '/api/orders', { type: 'dine_in', table_no: '5', lines: [{ menu_id: friedRice.id, qty: 2 }, { menu_id: iced.id, qty: 1 }] });
  assert.equal(order.total, 120000);
  assert.equal((await ok('GET', '/api/summary')).sales, 0, 'open order is not a sale');
  order = await ok('POST', `/api/orders/${order.id}/pay`, { method: 'qr' });
  assert.equal(order.status, 'paid'); assert.equal(order.method, 'qr');
  const s = Object.fromEntries((await ok('GET', '/api/ingredients')).map((i) => [i.name, i.stock]));
  assert.ok(Math.abs(s.Chicken - (21 - 0.3)) < 1e-9, `chicken ${s.Chicken}`);
  assert.ok(Math.abs(s.Rice - (20 - 0.4)) < 1e-9);
  assert.equal(s.Egg, 58);
  const sum = await ok('GET', '/api/summary');
  assert.equal(sum.sales, 120000); assert.equal(sum.orders, 1);
  assert.ok(sum.food_cost_pct > 0);
  await fails(400, 'POST', `/api/orders/${order.id}/pay`, { method: 'cash' }); // cannot pay twice
});

await test('T3 wasted chicken is recorded as waste, sales unchanged', async () => {
  await fails(400, 'POST', '/api/stock', { ingredient_id: chicken.id, type: 'waste', qty: 0.15 }); // reason required
  await ok('POST', '/api/stock', { ingredient_id: chicken.id, type: 'waste', qty: 0.15, note: 'dropped on floor' });
  const c = (await ok('GET', '/api/ingredients')).find((i) => i.name === 'Chicken');
  assert.ok(Math.abs(c.stock - (21 - 0.3 - 0.15)) < 1e-9);
  assert.equal((await ok('GET', '/api/summary')).sales, 120000);
  const moves = await ok('GET', `/api/stock/moves?ingredient_id=${chicken.id}`);
  assert.equal(moves[0].type, 'waste');
});

await test('T4 voiding an open order changes nothing', async () => {
  const before = await ok('GET', '/api/ingredients');
  const o = await ok('POST', '/api/orders', { type: 'takeaway', lines: [{ menu_id: friedRice.id, qty: 1 }] });
  const v = await ok('POST', `/api/orders/${o.id}/void`);
  assert.equal(v.status, 'void');
  assert.deepEqual((await ok('GET', '/api/ingredients')).map((i) => i.stock), before.map((i) => i.stock));
  assert.equal((await ok('GET', '/api/summary')).sales, 120000);
  await fails(400, 'POST', `/api/orders/${o.id}/pay`, { method: 'cash' });
});

await test('T5 refund removes the sale but does not return stock', async () => {
  const before = await ok('GET', '/api/ingredients');
  const r = await ok('POST', `/api/orders/${order.id}/refund`);
  assert.equal(r.status, 'refunded');
  assert.equal((await ok('GET', '/api/summary')).sales, 0);
  assert.deepEqual((await ok('GET', '/api/ingredients')).map((i) => i.stock), before.map((i) => i.stock));
});

await test('T6 physical count records a variance with a reason', async () => {
  const sysStock = (await ok('GET', '/api/ingredients')).find((i) => i.name === 'Chicken').stock;
  await fails(400, 'POST', '/api/stock', { ingredient_id: chicken.id, type: 'count', qty: 18 }); // reason required
  await ok('POST', '/api/stock', { ingredient_id: chicken.id, type: 'count', qty: 18, note: 'monthly count' });
  const c = (await ok('GET', '/api/ingredients')).find((i) => i.name === 'Chicken');
  assert.equal(c.stock, 18);
  const m = (await ok('GET', `/api/stock/moves?ingredient_id=${chicken.id}`))[0];
  assert.equal(m.type, 'count'); assert.ok(Math.abs(m.qty - (18 - sysStock)) < 1e-9);
});

await test('T7 stock at or below minimum shows in low-stock list', async () => {
  await ok('POST', '/api/stock', { ingredient_id: chicken.id, type: 'count', qty: 4, note: 'used a lot' });
  const low = (await ok('GET', '/api/summary')).low_stock.map((i) => i.name);
  assert.ok(low.includes('Chicken')); assert.ok(!low.includes('Rice'));
});

await test('T8 purchase order draft -> approved -> received', async () => {
  const sup = await ok('POST', '/api/suppliers', { name: 'Talat Sao Meats', phone: '020 0000 0000' });
  const po = await ok('POST', '/api/po', { supplier_id: sup.id, lines: [{ ingredient_id: chicken.id, qty: 10, unit_cost: 53000 }] });
  assert.equal(po.status, 'draft'); assert.equal(po.total, 530000);
  await fails(400, 'POST', `/api/po/${po.id}/receive`, {}); // must be approved first
  assert.equal((await ok('POST', `/api/po/${po.id}/approve`)).status, 'approved');
  const before = (await ok('GET', '/api/ingredients')).find((i) => i.name === 'Chicken').stock;
  const rcv = await ok('POST', `/api/po/${po.id}/receive`, { invoice_no: 'INV-001' });
  assert.equal(rcv.status, 'received'); assert.equal(rcv.invoice_no, 'INV-001');
  const c = (await ok('GET', '/api/ingredients')).find((i) => i.name === 'Chicken');
  assert.equal(c.stock, before + 10); assert.equal(c.unit_cost, 53000);
  await fails(400, 'POST', `/api/po/${po.id}/receive`, {}); // cannot receive twice
  await fails(400, 'POST', `/api/po/${po.id}/cancel`);
});

await test('validation and exports', async () => {
  await fails(400, 'POST', '/api/menu', { name: 'Bad', price: 'abc' });
  await fails(400, 'POST', '/api/orders', { type: 'dine_in', lines: [] }); // table required for dine-in
  await fails(404, 'GET', '/api/nope');
  await fails(400, 'POST', '/api/stock', { ingredient_id: rice.id, type: 'waste', qty: -1, note: 'x' });
  await fails(400, 'POST', '/api/menu', { name: 'Dup', price: 1, recipe: [{ ingredient_id: rice.id, qty_sub: 1 }, { ingredient_id: rice.id, qty_sub: 2 }] });
  for (const n of ['sales', 'stock', 'moves', 'purchases']) {
    const r = await call('GET', `/api/export/${n}`);
    assert.equal(r.status, 200); assert.ok(r.data.includes(','), n);
  }
  assert.equal((await call('GET', '/')).status, 200);
  assert.equal((await call('GET', '/..%2f..%2fpackage.json')).status, 403);
});

console.log(`\n${passed} test groups passed`);
server.close();
