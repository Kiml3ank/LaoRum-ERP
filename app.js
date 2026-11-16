import { tx } from './db.js';

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const bad = (m) => { throw new HttpError(400, m); };
const missing = (m = 'Not found') => { throw new HttpError(404, m); };

const num = (v, name, { min = -Infinity, allowBlank = false } = {}) => {
  if ((v === undefined || v === null || v === '') && allowBlank) return 0;
  const n = Number(v);
  if (!Number.isFinite(n)) bad(`${name} must be a number`);
  if (n < min) bad(`${name} must be at least ${min}`);
  return n;
};
const str = (v, name, required = true) => {
  const s = (v ?? '').toString().trim();
  if (required && !s) bad(`${name} is required`);
  return s;
};
const row = (x) => (x ? { ...x } : x);
const rows = (a) => a.map(row);

export function makeApi(db) {
  const q = (sql) => db.prepare(sql);

  // ---------- ingredients and stock ----------
  const ING_SQL = `SELECT i.*, COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.ingredient_id=i.id),0) AS stock
                   FROM ingredients i`;
  const getIngredient = (id) => row(q(ING_SQL + ' WHERE i.id=?').get(id)) || missing('Ingredient not found');
  const stockOf = (id) => q('SELECT COALESCE(SUM(qty),0) s FROM stock_moves WHERE ingredient_id=?').get(id).s;
  const addMove = (ingredient_id, qty, type, ref = '', note = '') =>
    q('INSERT INTO stock_moves(ingredient_id,qty,type,ref,note) VALUES(?,?,?,?,?)').run(ingredient_id, qty, type, ref, note).lastInsertRowid;

  function saveIngredient(body, id) {
    const name = str(body.name, 'name'), unit = str(body.unit, 'unit');
    const sub = str(body.sub_unit, 'sub_unit', false) || unit;
    const factor = sub === unit ? 1 : num(body.factor, 'factor', { min: 0.000001 });
    const f = [name, str(body.name_lo, 'name_lo', false), unit, sub, factor,
      num(body.min_stock, 'min_stock', { min: 0, allowBlank: true }), num(body.unit_cost, 'unit_cost', { min: 0, allowBlank: true })];
    if (id) { q('UPDATE ingredients SET name=?,name_lo=?,unit=?,sub_unit=?,factor=?,min_stock=?,unit_cost=? WHERE id=?').run(...f, id); return getIngredient(id); }
    return tx(db, () => {
      const nid = q('INSERT INTO ingredients(name,name_lo,unit,sub_unit,factor,min_stock,unit_cost) VALUES(?,?,?,?,?,?,?)').run(...f).lastInsertRowid;
      const open = num(body.opening_qty, 'opening_qty', { allowBlank: true });
      if (open) addMove(nid, open, 'adjust', '', 'opening stock');
      return getIngredient(nid);
    });
  }

  // type: waste | staff | adjust | count
  function stockEntry(body) {
    const ing = getIngredient(num(body.ingredient_id, 'ingredient_id'));
    const type = str(body.type, 'type'), note = str(body.note, 'note', false);
    const qty = num(body.qty, 'qty');
    return tx(db, () => {
      if (type === 'waste' || type === 'staff') {
        if (qty <= 0) bad('qty must be more than 0');
        if (type === 'waste' && !note) bad('a reason is required for waste');
        addMove(ing.id, -qty, type, '', note);
      } else if (type === 'adjust') {
        if (!qty) bad('qty must not be 0');
        if (!note) bad('a reason is required for an adjustment');
        addMove(ing.id, qty, 'adjust', '', note);
      } else if (type === 'count') {
        if (qty < 0) bad('counted quantity cannot be negative');
        const diff = qty - stockOf(ing.id);
        if (Math.abs(diff) > 1e-9) {
          if (!note) bad('a reason is required when the count differs from the system');
          addMove(ing.id, diff, 'count', '', note);
        }
      } else bad('type must be waste, staff, adjust or count');
      return getIngredient(ing.id);
    });
  }

  // ---------- menu and recipes ----------
  function recipeFor(menuId) {
    return rows(q(`SELECT r.ingredient_id, r.qty, i.name, i.name_lo, i.unit, i.sub_unit, i.factor, i.unit_cost,
                          r.qty*i.factor AS qty_sub, r.qty*i.unit_cost AS cost
                   FROM recipe_lines r JOIN ingredients i ON i.id=r.ingredient_id WHERE r.menu_id=? ORDER BY i.name`).all(menuId));
  }
  function menuItem(m) {
    const recipe = recipeFor(m.id);
    const cost = recipe.reduce((s, r) => s + r.cost, 0);
    return { ...m, recipe, cost, food_cost_pct: m.price > 0 && recipe.length ? (cost / m.price) * 100 : null };
  }
  function saveMenu(body, id) {
    const f = [str(body.name, 'name'), str(body.name_lo, 'name_lo', false), str(body.category, 'category', false),
      num(body.price, 'price', { min: 0 }), body.active === 0 || body.active === false ? 0 : 1];
    return tx(db, () => {
      if (id) { getMenu(id); q('UPDATE menu_items SET name=?,name_lo=?,category=?,price=?,active=? WHERE id=?').run(...f, id); }
      else id = q('INSERT INTO menu_items(name,name_lo,category,price,active) VALUES(?,?,?,?,?)').run(...f).lastInsertRowid;
      if (Array.isArray(body.recipe)) {
        q('DELETE FROM recipe_lines WHERE menu_id=?').run(id);
        const seen = new Set();
        for (const l of body.recipe) {
          const ing = getIngredient(num(l.ingredient_id, 'ingredient_id'));
          if (seen.has(ing.id)) bad('an ingredient appears twice in the recipe');
          seen.add(ing.id);
          const sub = num(l.qty_sub, 'recipe quantity');
          if (sub <= 0) bad('recipe quantity must be more than 0');
          q('INSERT INTO recipe_lines(menu_id,ingredient_id,qty) VALUES(?,?,?)').run(id, ing.id, sub / ing.factor);
        }
      }
      return getMenu(id);
    });
  }
  const getMenu = (id) => { const m = q('SELECT * FROM menu_items WHERE id=?').get(id); if (!m) missing('Menu item not found'); return menuItem(row(m)); };

  // ---------- orders ----------
  const orderLines = (id) => rows(q(`SELECT l.*, m.name, m.name_lo FROM order_lines l JOIN menu_items m ON m.id=l.menu_id WHERE l.order_id=? ORDER BY l.id`).all(id));
  const getOrder = (id) => { const o = q('SELECT * FROM orders WHERE id=?').get(id); if (!o) missing('Order not found'); return { ...o, lines: orderLines(id) }; };
  function setLines(orderId, lines) {
    if (!Array.isArray(lines)) bad('lines must be a list');
    q('DELETE FROM order_lines WHERE order_id=?').run(orderId);
    let sub = 0;
    for (const l of lines) {
      const m = q('SELECT * FROM menu_items WHERE id=?').get(num(l.menu_id, 'menu_id')) || missing('Menu item not found');
      if (!m.active) bad(`${m.name} is not on the menu`);
      const qty = num(l.qty, 'qty');
      if (!Number.isInteger(qty) || qty < 1) bad('qty must be a whole number of at least 1');
      q('INSERT INTO order_lines(order_id,menu_id,qty,price) VALUES(?,?,?,?)').run(orderId, m.id, qty, m.price);
      sub += qty * m.price;
    }
    return sub;
  }
  const TYPES = ['dine_in', 'takeaway', 'delivery'];
  function saveOrder(body, id) {
    const type = body.type || 'dine_in';
    if (!TYPES.includes(type)) bad('type must be dine_in, takeaway or delivery');
    const table_no = str(body.table_no, 'table_no', false);
    if (type === 'dine_in' && !table_no) bad('table number is required for dine-in');
    return tx(db, () => {
      if (id) { if (getOrder(id).status !== 'open') bad('only open orders can be changed'); q('UPDATE orders SET table_no=?,type=? WHERE id=?').run(table_no, type, id); }
      else id = q('INSERT INTO orders(table_no,type) VALUES(?,?)').run(table_no, type).lastInsertRowid;
      const sub = setLines(id, body.lines || []);
      q('UPDATE orders SET total=? WHERE id=?').run(sub, id);
      return getOrder(id);
    });
  }
  const METHODS = ['cash', 'card', 'qr'];
  function payOrder(id, body) {
    return tx(db, () => {
      const o = getOrder(id);
      if (o.status !== 'open') bad('order is not open');
      if (!o.lines.length) bad('order has no items');
      const method = str(body.method, 'method');
      if (!METHODS.includes(method)) bad('method must be cash, card or qr');
      const sub = o.lines.reduce((s, l) => s + l.qty * l.price, 0);
      const discount = num(body.discount, 'discount', { min: 0, allowBlank: true });
      if (discount > sub) bad('discount cannot be more than the order total');
      for (const l of o.lines) {
        const recipe = recipeFor(l.menu_id);
        const cost = recipe.reduce((s, r) => s + r.cost, 0);
        q('UPDATE order_lines SET cost=? WHERE id=?').run(cost, l.id); // cost per portion at time of sale
        for (const r of recipe) addMove(r.ingredient_id, -r.qty * l.qty, 'sale', `order:${id}`, '');
      }
      q(`UPDATE orders SET status='paid', method=?, discount=?, total=?, paid_at=datetime('now','localtime') WHERE id=?`).run(method, discount, sub - discount, id);
      return getOrder(id);
    });
  }
  function closeOrder(id, from, to) {
    const o = getOrder(id);
    if (o.status !== from) bad(`order is not ${from}`);
    q('UPDATE orders SET status=? WHERE id=?').run(to, id);
    return getOrder(id);
  }

  // ---------- purchasing ----------
  const poLines = (id) => rows(q(`SELECT l.*, i.name, i.name_lo, i.unit FROM po_lines l JOIN ingredients i ON i.id=l.ingredient_id WHERE l.po_id=? ORDER BY l.rowid`).all(id));
  function getPo(id) {
    const p = q('SELECT p.*, s.name AS supplier FROM purchase_orders p LEFT JOIN suppliers s ON s.id=p.supplier_id WHERE p.id=?').get(id);
    if (!p) missing('Purchase order not found');
    const lines = poLines(id);
    return { ...p, lines, total: lines.reduce((s, l) => s + l.qty * l.unit_cost, 0) };
  }
  function createPo(body) {
    const sid = num(body.supplier_id, 'supplier_id');
    if (!q('SELECT 1 FROM suppliers WHERE id=?').get(sid)) missing('Supplier not found');
    if (!Array.isArray(body.lines) || !body.lines.length) bad('add at least one line');
    return tx(db, () => {
      const id = q('INSERT INTO purchase_orders(supplier_id,note) VALUES(?,?)').run(sid, str(body.note, 'note', false)).lastInsertRowid;
      for (const l of body.lines) {
        const ing = getIngredient(num(l.ingredient_id, 'ingredient_id'));
        const qty = num(l.qty, 'qty');
        if (qty <= 0) bad('qty must be more than 0');
        q('INSERT INTO po_lines(po_id,ingredient_id,qty,unit_cost) VALUES(?,?,?,?)').run(id, ing.id, qty, num(l.unit_cost, 'unit_cost', { min: 0 }));
      }
      return getPo(id);
    });
  }
  function poStep(id, from, to, fn) {
    return tx(db, () => {
      const p = getPo(id);
      if (!from.includes(p.status)) bad(`purchase order is ${p.status}; expected ${from.join(' or ')}`);
      if (fn) fn(p);
      q('UPDATE purchase_orders SET status=? WHERE id=?').run(to, id);
      return getPo(id);
    });
  }
  function receivePo(id, body) {
    return poStep(id, ['approved'], 'received', (p) => {
      const given = new Map((body.lines || []).map((l) => [Number(l.ingredient_id), l.received_qty]));
      for (const l of p.lines) {
        const rq = given.has(l.ingredient_id) ? num(given.get(l.ingredient_id), 'received_qty', { min: 0 }) : l.qty;
        q('UPDATE po_lines SET received_qty=? WHERE po_id=? AND ingredient_id=?').run(rq, id, l.ingredient_id);
        if (rq > 0) {
          addMove(l.ingredient_id, rq, 'receive', `po:${id}`, '');
          q('UPDATE ingredients SET unit_cost=? WHERE id=?').run(l.unit_cost, l.ingredient_id);
        }
      }
      q(`UPDATE purchase_orders SET invoice_no=?, received_at=datetime('now','localtime') WHERE id=?`).run(str(body.invoice_no, 'invoice_no', false), id);
    });
  }

  // ---------- reports ----------
  const TODAY = `date(paid_at)=date('now','localtime')`;
  function summary() {
    const s = q(`SELECT COUNT(*) orders, COALESCE(SUM(total),0) sales FROM orders WHERE status='paid' AND ${TODAY}`).get();
    const c = q(`SELECT COALESCE(SUM(l.cost*l.qty),0) cost FROM order_lines l JOIN orders o ON o.id=l.order_id WHERE o.status='paid' AND date(o.paid_at)=date('now','localtime')`).get();
    const refunds = q(`SELECT COUNT(*) n FROM orders WHERE status='refunded' AND date(created_at)=date('now','localtime')`).get().n;
    const byMethod = rows(q(`SELECT method, COUNT(*) orders, SUM(total) total FROM orders WHERE status='paid' AND ${TODAY} GROUP BY method`).all());
    const low = rows(q(ING_SQL + ' WHERE i.active=1').all()).filter((i) => i.min_stock > 0 && i.stock <= i.min_stock)
      .sort((a, b) => a.stock / a.min_stock - b.stock / b.min_stock);
    const bestSellers = rows(q(`SELECT m.name, m.name_lo, SUM(l.qty) qty FROM order_lines l JOIN orders o ON o.id=l.order_id JOIN menu_items m ON m.id=l.menu_id
                                WHERE o.status='paid' AND date(o.paid_at)=date('now','localtime') GROUP BY m.id ORDER BY qty DESC LIMIT 5`).all());
    return { orders: s.orders, sales: s.sales, avg_order: s.orders ? s.sales / s.orders : 0, cost: c.cost,
      food_cost_pct: s.sales > 0 ? (c.cost / s.sales) * 100 : null, refunds,
      open_orders: q(`SELECT COUNT(*) n FROM orders WHERE status='open'`).get().n, by_method: byMethod, low_stock: low, best_sellers: bestSellers };
  }

  const EXPORTS = {
    sales: `SELECT o.id AS order_id, o.paid_at, o.type, o.table_no, o.status, o.method, o.discount, o.total FROM orders o WHERE o.status IN ('paid','refunded') ORDER BY o.id`,
    stock: `SELECT i.name, i.name_lo, i.unit, i.min_stock, i.unit_cost, COALESCE((SELECT SUM(qty) FROM stock_moves m WHERE m.ingredient_id=i.id),0) AS stock FROM ingredients i WHERE i.active=1 ORDER BY i.name`,
    moves: `SELECT m.created_at, i.name AS ingredient, m.type, m.qty, i.unit, m.ref, m.note FROM stock_moves m JOIN ingredients i ON i.id=m.ingredient_id ORDER BY m.id`,
    purchases: `SELECT p.id AS po_id, p.created_at, s.name AS supplier, p.status, p.invoice_no, i.name AS ingredient, l.qty, l.received_qty, l.unit_cost FROM purchase_orders p LEFT JOIN suppliers s ON s.id=p.supplier_id JOIN po_lines l ON l.po_id=p.id JOIN ingredients i ON i.id=l.ingredient_id ORDER BY p.id`,
  };
  const csv = (data) => {
    if (!data.length) return '';
    const cols = Object.keys(data[0]);
    const esc = (v) => { const s = v == null ? '' : String(v); return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
    return '﻿' + [cols.join(','), ...data.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n';
  };

  // ---------- route table ----------
  const R = [];
  const add = (method, pattern, fn) => R.push([method, new RegExp(`^${pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)')}$`), fn]);
  const id = (p) => num(p.id, 'id');

  add('GET', '/api/summary', () => summary());

  add('GET', '/api/ingredients', () => rows(q(ING_SQL + ' WHERE i.active=1 ORDER BY i.name').all()));
  add('POST', '/api/ingredients', ({ body }) => saveIngredient(body));
  add('PUT', '/api/ingredients/:id', ({ params, body }) => (getIngredient(id(params)), saveIngredient(body, id(params))));
  add('DELETE', '/api/ingredients/:id', ({ params }) => {
    const n = q('SELECT COUNT(*) n FROM recipe_lines WHERE ingredient_id=?').get(id(params)).n;
    if (n) bad('this ingredient is used in a recipe');
    q('UPDATE ingredients SET active=0 WHERE id=?').run(id(params)); return { ok: true };
  });
  add('POST', '/api/stock', ({ body }) => stockEntry(body));
  add('GET', '/api/stock/moves', ({ query }) => {
    const lim = Math.min(Number(query.limit) || 100, 1000);
    const sql = `SELECT m.*, i.name, i.name_lo, i.unit FROM stock_moves m JOIN ingredients i ON i.id=m.ingredient_id`;
    return rows(query.ingredient_id ? q(sql + ' WHERE m.ingredient_id=? ORDER BY m.id DESC LIMIT ?').all(Number(query.ingredient_id), lim)
      : q(sql + ' ORDER BY m.id DESC LIMIT ?').all(lim));
  });

  add('GET', '/api/menu', ({ query }) => rows(q(`SELECT * FROM menu_items ${query.all ? '' : 'WHERE active=1'} ORDER BY category, name`).all()).map(menuItem));
  add('POST', '/api/menu', ({ body }) => saveMenu(body));
  add('PUT', '/api/menu/:id', ({ params, body }) => saveMenu(body, id(params)));

  add('GET', '/api/suppliers', () => rows(q('SELECT * FROM suppliers ORDER BY name').all()));
  add('POST', '/api/suppliers', ({ body }) => row(q('SELECT * FROM suppliers WHERE id=?').get(
    q('INSERT INTO suppliers(name,phone,note) VALUES(?,?,?)').run(str(body.name, 'name'), str(body.phone, 'phone', false), str(body.note, 'note', false)).lastInsertRowid)));
  add('PUT', '/api/suppliers/:id', ({ params, body }) => {
    q('UPDATE suppliers SET name=?,phone=?,note=? WHERE id=?').run(str(body.name, 'name'), str(body.phone, 'phone', false), str(body.note, 'note', false), id(params));
    return row(q('SELECT * FROM suppliers WHERE id=?').get(id(params))) || missing();
  });

  add('GET', '/api/po', () => rows(q('SELECT id FROM purchase_orders ORDER BY id DESC LIMIT 100').all()).map((r) => getPo(r.id)));
  add('POST', '/api/po', ({ body }) => createPo(body));
  add('POST', '/api/po/:id/approve', ({ params }) => poStep(id(params), ['draft'], 'approved'));
  add('POST', '/api/po/:id/receive', ({ params, body }) => receivePo(id(params), body));
  add('POST', '/api/po/:id/cancel', ({ params }) => poStep(id(params), ['draft', 'approved'], 'cancelled'));

  add('GET', '/api/orders', ({ query }) => {
    const st = query.status;
    const list = st ? q('SELECT id FROM orders WHERE status=? ORDER BY id DESC LIMIT 200').all(st) : q('SELECT id FROM orders ORDER BY id DESC LIMIT 200').all();
    return list.map((r) => getOrder(r.id));
  });
  add('GET', '/api/orders/:id', ({ params }) => getOrder(id(params)));
  add('POST', '/api/orders', ({ body }) => saveOrder(body));
  add('PUT', '/api/orders/:id', ({ params, body }) => saveOrder(body, id(params)));
  add('POST', '/api/orders/:id/pay', ({ params, body }) => payOrder(id(params), body));
  add('POST', '/api/orders/:id/void', ({ params }) => closeOrder(id(params), 'open', 'void'));
  add('POST', '/api/orders/:id/refund', ({ params }) => closeOrder(id(params), 'paid', 'refunded'));

  add('GET', '/api/export/:name', ({ params }) => {
    const sql = EXPORTS[params.name] || missing('Unknown export');
    return { csv: csv(rows(q(sql).all())), filename: `${params.name}.csv` };
  });

  return {
    async handle(method, pathname, query, body) {
      for (const [m, re, fn] of R) {
        if (m !== method) continue;
        const hit = re.exec(pathname);
        if (hit) return fn({ params: hit.groups || {}, query, body: body || {} });
      }
      return undefined;
    },
    HttpError,
  };
}
