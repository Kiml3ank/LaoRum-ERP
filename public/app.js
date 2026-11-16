import { STR } from './i18n.js';

// ---------- helpers ----------
let lang = (() => { try { return localStorage.getItem('lang') || 'lo'; } catch { return 'lo'; } })();
const t = (k) => STR[lang][k] ?? STR.en[k] ?? k;
const nm = (o) => (lang === 'lo' && o.name_lo ? o.name_lo : o.name);
const fmt = (n) => new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(Math.round(n || 0));
const money = (n) => `${fmt(n)} ${t('currency')}`;
const qf = (n) => String(Math.round((n || 0) * 1000) / 1000);
const pct = (n) => (n == null ? '–' : `${(Math.round(n * 10) / 10).toString()}%`);
const stamp = (s) => (s || '').slice(5, 16);

async function api(method, path, body) {
  const res = await fetch(path, { method, headers: { 'Content-Type': 'application/json' }, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || t('error'));
  return data;
}

function h(tag, props, ...kids) {
  const el = document.createElement(tag);
  let value;
  for (const [k, v] of Object.entries(props || {})) {
    if (k === 'class') el.className = v;
    else if (k === 'value') value = v;
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
    else if (v === true) el.setAttribute(k, '');
    else if (v !== false && v != null) el.setAttribute(k, v);
  }
  for (const c of kids.flat(Infinity)) if (c != null && c !== false) el.append(c.nodeType ? c : document.createTextNode(c));
  if (value !== undefined) el.value = value;
  return el;
}
const btn = (label, onclick, cls = '') => h('button', { class: `btn ${cls}`, type: 'button', onclick }, label);
const field = (label, input) => h('div', {}, h('label', {}, label), input);
const input = (props) => h('input', props);
const badge = (text, kind = '') => h('span', { class: `badge ${kind}` }, text);
const empty = () => h('p', { class: 'mute' }, t('none'));

function toast(msg, err) {
  const el = h('div', { class: `toast ${err ? 'err' : ''}`, role: 'status' }, msg);
  document.body.append(el); setTimeout(() => el.remove(), err ? 4500 : 2000);
}
const safe = (fn) => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, true); } };

function modal(title, build, { wide = false } = {}) {
  const bg = h('div', { class: 'modal-bg', onclick: (e) => e.target === bg && close() });
  const close = () => bg.remove();
  const box = h('div', { class: `modal ${wide ? 'wide' : ''}`, role: 'dialog', 'aria-label': title }, h('h3', {}, title), build(close));
  bg.append(box); document.body.append(bg);
  const first = box.querySelector('input,select,textarea'); if (first) first.focus();
  return close;
}
const form = (children, onSave, close, saveLabel = t('save')) => h('form', { onsubmit: safe(async (e) => { e.preventDefault(); await onSave(); close(); }) },
  children, h('div', { class: 'row', style: 'margin-top:14px;justify-content:flex-end' }, btn(t('cancel'), close), h('button', { class: 'btn pri', type: 'submit' }, saveLabel)));

const TYPE = () => ({ dine_in: t('dine_in'), takeaway: t('takeaway'), delivery: t('delivery') });
const STATUS_KIND = { paid: 'good', open: 'warn', void: 'bad', refunded: 'bad', draft: 'warn', approved: '', received: 'good', cancelled: 'bad' };

// ---------- navigation ----------
const TABS = ['home', 'pos', 'menu', 'stock', 'buy'];
let tab = (location.hash || '#home').slice(1);
if (!TABS.includes(tab)) tab = 'home';
const view = document.getElementById('view');

function drawNav() {
  const nav = document.getElementById('nav'); nav.replaceChildren(...TABS.map((k) =>
    h('button', { class: k === tab ? 'on' : '', onclick: () => { tab = k; location.hash = k; go(); } }, t(k))));
  document.getElementById('langBtn').textContent = t('lang');
  document.title = t('app');
  document.documentElement.lang = lang;
}
document.getElementById('langBtn').onclick = () => { lang = lang === 'lo' ? 'en' : 'lo'; try { localStorage.setItem('lang', lang); } catch {} go(); };

async function go() {
  drawNav();
  try {
    const node = await ({ home: viewHome, pos: viewPos, menu: viewMenu, stock: viewStock, buy: viewBuy }[tab])();
    view.replaceChildren(node);
  } catch (e) { view.replaceChildren(h('p', {}, e.message)); }
}
const refresh = () => go();

// ---------- home ----------
async function viewHome() {
  const s = await api('GET', '/api/summary');
  const kpi = (l, v) => h('div', { class: 'card kpi' }, h('div', { class: 'v' }, v), h('div', { class: 'l' }, l));
  const maxQ = Math.max(1, ...s.best_sellers.map((b) => b.qty));
  return h('div', {},
    h('div', { class: 'grid kpis' }, kpi(t('today_sales'), money(s.sales)), kpi(t('orders'), s.orders), kpi(t('avg_order'), money(s.avg_order)),
      kpi(t('food_cost'), pct(s.food_cost_pct)), kpi(t('open_orders'), s.open_orders), kpi(t('refunds'), s.refunds)),
    h('div', { class: 'grid two', style: 'margin-top:12px' },
      h('div', { class: 'card' }, h('h3', {}, t('low_stock')),
        s.low_stock.length ? h('table', {}, s.low_stock.map((i) => h('tr', {}, h('td', {}, nm(i)), h('td', { class: 'n' }, `${qf(i.stock)} / ${qf(i.min_stock)} ${i.unit}`), h('td', {}, badge(t('low'), 'bad')))))
          : h('p', { class: 'mute' }, t('all_good'))),
      h('div', { class: 'card' }, h('h3', {}, t('by_method')),
        s.by_method.length ? h('table', {}, s.by_method.map((m) => h('tr', {}, h('td', {}, t(m.method)), h('td', { class: 'n' }, `${m.orders}`), h('td', { class: 'n' }, money(m.total))))) : empty()),
      h('div', { class: 'card' }, h('h3', {}, t('best_sellers')),
        s.best_sellers.length ? s.best_sellers.map((b) => h('div', { style: 'margin:6px 0' }, h('div', { class: 'row sp' }, h('span', {}, nm(b)), h('b', {}, b.qty)), h('div', { class: 'bar-h' }, h('i', { style: `width:${(b.qty / maxQ) * 100}%` })))) : empty()),
      h('div', { class: 'card' }, h('h3', {}, t('exports')),
        h('div', { class: 'row' }, ['sales', 'stock', 'moves', 'purchases'].map((n) => h('a', { class: 'btn sm', href: `/api/export/${n}`, download: `${n}.csv` }, t('ex_' + n)))),
        h('h3', { style: 'margin-top:16px' }, t('data_safety')),
        btn(t('backup'), safe(async () => { const r = await api('POST', '/api/backup'); toast(`${t('backup_done')}: ${r.file}`); })))));
}

// ---------- POS ----------
const blank = () => ({ id: null, table_no: '', type: 'dine_in', lines: [], discount: 0 });
let cart = blank(), cat = '', q = '';
let posData = { menu: [], open: [], recent: [] };

async function loadPos() {
  const [menu, open, paid, refunded] = await Promise.all([api('GET', '/api/menu'), api('GET', '/api/orders?status=open'), api('GET', '/api/orders?status=paid'), api('GET', '/api/orders?status=refunded')]);
  posData = { menu, open, recent: [...paid, ...refunded].sort((a, b) => b.id - a.id).slice(0, 15) };
}
async function viewPos() { await loadPos(); const root = h('div', {}); drawPos(root); return root; }

const cartTotal = () => cart.lines.reduce((s, l) => s + l.qty * (posData.menu.find((m) => m.id === l.menu_id)?.price || 0), 0);
function bump(menu_id, d) {
  const l = cart.lines.find((x) => x.menu_id === menu_id);
  if (l) { l.qty += d; if (l.qty < 1) cart.lines = cart.lines.filter((x) => x !== l); }
  else if (d > 0) cart.lines.push({ menu_id, qty: 1 });
}
async function saveCart() {
  if (cart.type === 'dine_in' && !cart.table_no.trim()) throw new Error(t('need_table'));
  const body = { table_no: cart.table_no, type: cart.type, lines: cart.lines };
  const o = cart.id ? await api('PUT', `/api/orders/${cart.id}`, body) : await api('POST', '/api/orders', body);
  cart.id = o.id; return o;
}

function drawPos(root) {
  const redraw = () => drawPos(root);
  const cats = [...new Set(posData.menu.map((m) => m.category).filter(Boolean))];
  const shown = posData.menu.filter((m) => (!cat || m.category === cat) && (!q || (m.name + (m.name_lo || '')).toLowerCase().includes(q.toLowerCase())));
  const total = cartTotal();
  const disc = Math.min(Number(cart.discount) || 0, total);

  const menuPane = h('div', {},
    h('div', { class: 'row', style: 'margin-bottom:10px' }, h('input', { type: 'search', placeholder: t('search'), value: q, style: 'max-width:220px', oninput: (e) => { q = e.target.value; const pos = e.target.selectionStart; redraw(); const i = root.querySelector('input[type=search]'); i.focus(); i.setSelectionRange(pos, pos); } }),
      h('div', { class: 'chips' }, [h('button', { class: `chip ${cat === '' ? 'on' : ''}`, type: 'button', onclick: () => { cat = ''; redraw(); } }, '★'), ...cats.map((c) => h('button', { class: `chip ${cat === c ? 'on' : ''}`, type: 'button', onclick: () => { cat = c; redraw(); } }, c))])),
    shown.length ? h('div', { class: 'tiles' }, shown.map((m) => h('button', { class: 'tile', type: 'button', onclick: () => { bump(m.id, 1); redraw(); } }, h('div', {}, nm(m)), h('div', { class: 'p' }, money(m.price))))) : empty(),
    h('h2', {}, t('open_order_list')),
    posData.open.length ? h('div', { class: 'chips' }, posData.open.map((o) => h('button', { class: `chip ${cart.id === o.id ? 'on' : ''}`, type: 'button', onclick: () => { cart = { id: o.id, table_no: o.table_no, type: o.type, discount: 0, lines: o.lines.map((l) => ({ menu_id: l.menu_id, qty: l.qty })) }; redraw(); } },
      `#${o.id} ${o.table_no || TYPE()[o.type]} · ${money(o.total)}`))) : h('p', { class: 'mute' }, t('none')),
    h('h2', {}, t('recent_orders')),
    posData.recent.length ? h('div', { class: 'card table-wrap' }, h('table', {}, posData.recent.map((o) => h('tr', {},
      h('td', {}, `#${o.id}`), h('td', {}, stamp(o.paid_at || o.created_at)), h('td', {}, o.table_no || TYPE()[o.type]), h('td', {}, t(o.method)), h('td', { class: 'n' }, money(o.total)),
      h('td', {}, badge(t(o.status), STATUS_KIND[o.status])),
      h('td', { class: 'n' }, btn(t('receipt'), () => showReceipt(o), 'sm'), ' ', o.status === 'paid' ? btn(t('refund'), safe(async () => { if (!confirm(t('confirm_refund'))) return; await api('POST', `/api/orders/${o.id}/refund`); toast(t('saved')); await loadPos(); redraw(); }), 'sm danger') : null))))) : empty());

  const lines = cart.lines.map((l) => { const m = posData.menu.find((x) => x.id === l.menu_id); if (!m) return null;
    return h('div', { class: 'line' }, h('div', {}, nm(m), h('div', { class: 'mute', style: 'font-size:.8rem' }, money(m.price))),
      h('div', { class: 'qtybox' }, btn('−', () => { bump(l.menu_id, -1); redraw(); }, 'sm'), h('b', {}, l.qty), btn('+', () => { bump(l.menu_id, 1); redraw(); }, 'sm')), h('div', {}, money(m.price * l.qty))); });

  const pay = safe(async (method) => {
    if (!cart.lines.length) return;
    const o = await saveCart();
    const done = await api('POST', `/api/orders/${o.id}/pay`, { method, discount: disc });
    cart = blank(); await loadPos(); redraw(); toast(`${t('paid')} · ${money(done.total)}`); showReceipt(done);
  });

  const cartPane = h('div', { class: 'card cart' }, h('h3', {}, cart.id ? `${t('order_no')} #${cart.id}` : t('new_order')),
    h('div', { class: 'row' }, h('div', { style: 'flex:1' }, field(t('order_type'), h('select', { value: cart.type, onchange: (e) => { cart.type = e.target.value; redraw(); } }, Object.entries(TYPE()).map(([k, v]) => h('option', { value: k }, v))))),
      cart.type === 'dine_in' ? h('div', { style: 'width:90px' }, field(t('table'), h('input', { value: cart.table_no, oninput: (e) => { cart.table_no = e.target.value; } }))) : null),
    lines.length ? lines : h('p', { class: 'mute' }, t('order_empty')),
    h('div', { class: 'row sp', style: 'margin-top:8px' }, h('span', {}, t('subtotal')), h('span', {}, money(total))),
    h('div', { class: 'row sp' }, h('span', {}, t('discount')), h('input', { type: 'number', min: 0, step: 'any', value: cart.discount || '', style: 'width:130px;text-align:right', oninput: (e) => { cart.discount = e.target.value; e.target.closest('.card').querySelector('.tot').textContent = money(total - Math.min(Number(e.target.value) || 0, total)); } })),
    h('div', { class: 'row sp', style: 'font-size:1.25rem;font-weight:700;margin:8px 0' }, h('span', {}, t('total')), h('span', { class: 'tot' }, money(total - disc))),
    h('div', { class: 'mute', style: 'font-size:.85rem' }, t('pay_with')),
    h('div', { class: 'row', style: 'flex-wrap:nowrap' }, ['cash', 'card', 'qr'].map((m) => h('button', { class: 'btn pri', type: 'button', style: 'flex:1;padding:8px 4px', disabled: !cart.lines.length, onclick: () => pay(m) }, t(m)))),
    h('div', { class: 'row', style: 'margin-top:8px' },
      btn(t('save_order'), safe(async () => { await saveCart(); await loadPos(); redraw(); toast(t('saved')); }), cart.lines.length ? '' : 'sm'),
      btn(t('new_order'), () => { cart = blank(); redraw(); }, 'sm'),
      cart.id ? btn(t('void_order'), safe(async () => { if (!confirm(t('confirm_void'))) return; await api('POST', `/api/orders/${cart.id}/void`); cart = blank(); await loadPos(); redraw(); }), 'sm danger right') : null));

  root.replaceChildren(h('div', { class: 'pos' }, menuPane, cartPane));
}

function showReceipt(o) {
  const r = document.getElementById('receipt');
  const sub = o.lines.reduce((s, l) => s + l.qty * l.price, 0);
  r.replaceChildren(...[h('div', { style: 'text-align:center;font-weight:bold' }, t('app')), h('div', { style: 'text-align:center' }, `${t('order_no')} #${o.id} · ${o.paid_at || o.created_at}`),
    h('hr'), ...o.lines.map((l) => h('div', { style: 'display:flex;justify-content:space-between' }, h('span', {}, `${l.qty} × ${nm(l)}`), h('span', {}, fmt(l.qty * l.price)))), h('hr'),
    o.discount ? h('div', { style: 'display:flex;justify-content:space-between' }, h('span', {}, t('discount')), h('span', {}, `-${fmt(o.discount)}`)) : null,
    h('div', { style: 'display:flex;justify-content:space-between;font-weight:bold' }, h('span', {}, t('total')), h('span', {}, money(o.status === 'open' ? sub : o.total))),
    o.method ? h('div', {}, t(o.method)) : null, h('div', { style: 'text-align:center;margin-top:8px' }, t('thanks'))].filter(Boolean));
  modal(t('receipt'), (close) => h('div', {}, h('div', { class: 'card', style: 'font-family:monospace;font-size:.9rem' }, ...[...r.childNodes].map((n) => n.cloneNode(true))),
    h('div', { class: 'row', style: 'margin-top:12px;justify-content:flex-end' }, btn(t('close'), close), btn('🖨', () => window.print(), 'pri'))));
}

// ---------- menu & recipes ----------
async function viewMenu() {
  const menu = await api('GET', '/api/menu?all=1');
  const ings = await api('GET', '/api/ingredients');
  return h('div', {}, h('div', { class: 'row sp' }, h('h2', { style: 'margin:0' }, t('menu')), btn(t('add_item'), () => menuEditor(null, ings), 'pri')),
    h('div', { class: 'card table-wrap', style: 'margin-top:10px' }, menu.length ? h('table', {},
      h('tr', {}, ...[t('name'), t('category'), t('price'), t('recipe_cost'), t('food_cost_pct'), t('margin'), ''].map((x, i) => h('th', { class: i > 1 && i < 6 ? 'n' : '' }, x))),
      menu.map((m) => h('tr', {}, h('td', {}, nm(m), m.active ? null : [' ', badge(t('void'), 'bad')]), h('td', {}, m.category), h('td', { class: 'n' }, money(m.price)),
        h('td', { class: 'n' }, m.recipe.length ? money(m.cost) : h('span', { class: 'mute' }, t('no_recipe'))),
        h('td', { class: 'n' }, m.food_cost_pct == null ? '–' : badge(pct(m.food_cost_pct), m.food_cost_pct > 40 ? 'bad' : m.food_cost_pct > 33 ? 'warn' : 'good')),
        h('td', { class: 'n' }, m.recipe.length ? money(m.price - m.cost) : '–'), h('td', { class: 'n' }, btn(t('edit'), () => menuEditor(m, ings), 'sm'))))) : empty()));
}

function menuEditor(m, ings) {
  const st = { recipe: (m?.recipe || []).map((r) => ({ ingredient_id: r.ingredient_id, qty_sub: r.qty_sub })) };
  modal(m ? t('edit') : t('add_item'), (close) => {
    const name = input({ value: m?.name || '', required: true }), lo = input({ value: m?.name_lo || '' }), category = input({ value: m?.category || '', list: 'cats' }), price = input({ type: 'number', min: 0, step: 'any', required: true, value: m?.price ?? '' });
    const active = h('input', { type: 'checkbox', checked: m ? !!m.active : true, style: 'width:auto;min-height:0' });
    const lines = h('div', {}), costBox = h('div', { class: 'card', style: 'margin-top:10px;background:var(--soft)' });
    const calc = () => {
      const cost = st.recipe.reduce((s, r) => { const i = ings.find((x) => x.id === Number(r.ingredient_id)); return s + (i ? (Number(r.qty_sub) || 0) / i.factor * i.unit_cost : 0); }, 0);
      const p = Number(price.value) || 0;
      costBox.replaceChildren(h('div', { class: 'row sp' }, h('span', {}, `${t('recipe_cost')} (${t('per_portion')})`), h('b', {}, money(cost))), h('div', { class: 'row sp' }, h('span', {}, t('food_cost_pct')), h('b', {}, p > 0 && cost > 0 ? pct(cost / p * 100) : '–')), h('div', { class: 'row sp' }, h('span', {}, t('margin')), h('b', {}, p > 0 ? money(p - cost) : '–')));
    };
    const drawLines = () => { lines.replaceChildren(...st.recipe.map((r, idx) => {
      const ing = ings.find((x) => x.id === Number(r.ingredient_id));
      return h('div', { class: 'row', style: 'margin:4px 0;flex-wrap:nowrap' },
        h('select', { value: r.ingredient_id, style: 'flex:2', onchange: (e) => { r.ingredient_id = Number(e.target.value); drawLines(); } }, h('option', { value: '' }, t('pick')), ings.map((i) => h('option', { value: i.id }, nm(i)))),
        h('input', { type: 'number', min: 0, step: 'any', value: r.qty_sub, style: 'flex:1;min-width:70px', oninput: (e) => { r.qty_sub = e.target.value; calc(); } }),
        h('span', { class: 'mute', style: 'min-width:34px' }, ing ? ing.sub_unit || ing.unit : ''), btn('✕', () => { st.recipe.splice(idx, 1); drawLines(); }, 'sm'));
    })); calc(); };
    price.addEventListener('input', calc); drawLines();
    return form([h('datalist', { id: 'cats' }, [...new Set(JSON.parse(sessionStorage.getItem('cats') || '[]'))].map((c) => h('option', { value: c }))),
      field(t('name'), name), field(t('name_lo'), lo), h('div', { class: 'row' }, h('div', { style: 'flex:1' }, field(t('category'), category)), h('div', { style: 'flex:1' }, field(t('price'), price))),
      h('label', { class: 'row' }, active, t('active')), h('h3', { style: 'margin-top:14px' }, t('recipe')), lines, btn(`+ ${t('add_ingredient_line')}`, () => { st.recipe.push({ ingredient_id: '', qty_sub: '' }); drawLines(); }, 'sm'), costBox],
    async () => {
      const recipe = st.recipe.filter((r) => r.ingredient_id && Number(r.qty_sub) > 0);
      const body = { name: name.value, name_lo: lo.value, category: category.value, price: price.value, active: active.checked ? 1 : 0, recipe };
      await api(m ? 'PUT' : 'POST', m ? `/api/menu/${m.id}` : '/api/menu', body); toast(t('saved')); refresh();
    }, close);
  }, { wide: true });
}

// ---------- inventory ----------
async function viewStock() {
  const ings = await api('GET', '/api/ingredients');
  return h('div', {}, h('div', { class: 'row sp' }, h('h2', { style: 'margin:0' }, t('stock')), btn(t('add_ingredient'), () => ingredientForm(null), 'pri')),
    h('div', { class: 'card table-wrap', style: 'margin-top:10px' }, ings.length ? h('table', {},
      h('tr', {}, ...[t('name'), t('on_hand'), t('minimum'), t('unit_cost'), t('status'), ''].map((x, i) => h('th', { class: i > 0 && i < 4 ? 'n' : '' }, x))),
      ings.map((i) => { const low = i.min_stock > 0 && i.stock <= i.min_stock;
        return h('tr', {}, h('td', {}, nm(i)), h('td', { class: 'n' }, `${qf(i.stock)} ${i.unit}`), h('td', { class: 'n' }, `${qf(i.min_stock)} ${i.unit}`), h('td', { class: 'n' }, `${money(i.unit_cost)}/${i.unit}`),
          h('td', {}, badge(low ? t('low') : t('ok'), low ? 'bad' : 'good')),
          h('td', { class: 'n', style: 'white-space:nowrap' }, ['waste', 'staff', 'count', 'adjust'].map((k) => [btn(t(k), () => stockEntry(i, k), 'sm'), ' ']), btn(t('history'), () => history(i), 'sm'), ' ', btn(t('edit'), () => ingredientForm(i), 'sm'))); })) : empty()));
}

function ingredientForm(i) {
  modal(i ? t('edit') : t('add_ingredient'), (close) => {
    const f = { name: input({ value: i?.name || '', required: true }), lo: input({ value: i?.name_lo || '' }), unit: input({ value: i?.unit || '', required: true, placeholder: 'kg, l, pcs' }),
      sub: input({ value: i && i.sub_unit !== i.unit ? i.sub_unit : '', placeholder: 'g, ml' }), factor: input({ type: 'number', min: 0, step: 'any', value: i && i.factor !== 1 ? i.factor : '', placeholder: '1000' }),
      min: input({ type: 'number', min: 0, step: 'any', value: i?.min_stock ?? '' }), cost: input({ type: 'number', min: 0, step: 'any', value: i?.unit_cost ?? '' }), open: input({ type: 'number', step: 'any' }) };
    return form([field(t('name'), f.name), field(t('name_lo'), f.lo), h('div', { class: 'row' }, h('div', { style: 'flex:1' }, field(t('unit'), f.unit)), h('div', { style: 'flex:1' }, field(t('sub_unit'), f.sub)), h('div', { style: 'flex:1' }, field(t('factor'), f.factor))),
      h('div', { class: 'row' }, h('div', { style: 'flex:1' }, field(t('minimum'), f.min)), h('div', { style: 'flex:1' }, field(t('unit_cost'), f.cost))), i ? null : field(t('opening'), f.open)],
    async () => { const body = { name: f.name.value, name_lo: f.lo.value, unit: f.unit.value, sub_unit: f.sub.value, factor: f.factor.value || 1, min_stock: f.min.value, unit_cost: f.cost.value, opening_qty: f.open.value };
      await api(i ? 'PUT' : 'POST', i ? `/api/ingredients/${i.id}` : '/api/ingredients', body); toast(t('saved')); refresh(); }, close);
  });
}

function stockEntry(i, type) {
  modal(`${t(type)} · ${nm(i)}`, (close) => {
    const qty = input({ type: 'number', step: 'any', required: true, placeholder: type === 'adjust' ? t('adjust_hint') : '' }), note = input({ required: type !== 'staff' });
    const diff = h('div', { class: 'mute' });
    if (type === 'count') qty.addEventListener('input', () => { const d = Number(qty.value) - i.stock; diff.textContent = qty.value === '' ? '' : `${t('variance')}: ${d > 0 ? '+' : ''}${qf(d)} ${i.unit}`; });
    return form([h('p', { class: 'mute' }, `${t('system_stock')}: ${qf(i.stock)} ${i.unit}`), field(`${type === 'count' ? t('counted') : t('qty')} (${i.unit})`, qty), diff, field(t('note'), note)],
      async () => { await api('POST', '/api/stock', { ingredient_id: i.id, type, qty: qty.value, note: note.value }); toast(t('saved')); refresh(); }, close);
  });
}

async function history(i) {
  const moves = await api('GET', `/api/stock/moves?ingredient_id=${i.id}&limit=100`);
  modal(`${t('history')} · ${nm(i)}`, (close) => h('div', {}, h('div', { class: 'table-wrap' }, moves.length ? h('table', {}, h('tr', {}, h('th', {}, t('when')), h('th', {}, t('type')), h('th', { class: 'n' }, t('qty')), h('th', {}, t('note'))),
    moves.map((m) => h('tr', {}, h('td', {}, stamp(m.created_at)), h('td', {}, t(m.type === 'receive' ? 'receive' : m.type)), h('td', { class: 'n' }, `${m.qty > 0 ? '+' : ''}${qf(m.qty)} ${m.unit}`), h('td', { class: 'mute' }, m.note || m.ref)))) : empty()),
    h('div', { class: 'row', style: 'margin-top:12px;justify-content:flex-end' }, btn(t('close'), close))), { wide: true });
}

// ---------- purchasing ----------
async function viewBuy() {
  const [sups, pos, ings] = await Promise.all([api('GET', '/api/suppliers'), api('GET', '/api/po'), api('GET', '/api/ingredients')]);
  const poCard = (p) => h('div', { class: 'card', style: 'margin-bottom:10px' },
    h('div', { class: 'row sp' }, h('b', {}, `PO #${p.id} · ${p.supplier || ''}`), h('span', {}, badge(t(p.status), STATUS_KIND[p.status]), ' ', h('span', { class: 'mute' }, stamp(p.created_at)))),
    h('table', {}, p.lines.map((l) => h('tr', {}, h('td', {}, nm(l)), h('td', { class: 'n' }, `${qf(l.qty)} ${l.unit}`), h('td', { class: 'n' }, `${money(l.unit_cost)}/${l.unit}`), h('td', { class: 'n' }, money(l.qty * l.unit_cost)), p.status === 'received' ? h('td', { class: 'n mute' }, `${t('received_qty')} ${qf(l.received_qty)}`) : null))),
    h('div', { class: 'row sp', style: 'margin-top:8px' }, h('b', {}, `${t('total')}: ${money(p.total)}`), h('div', { class: 'row' },
      p.status === 'draft' ? btn(t('approve'), safe(async () => { await api('POST', `/api/po/${p.id}/approve`); refresh(); }), 'pri sm') : null,
      p.status === 'approved' ? btn(t('receive_goods'), () => receiveForm(p), 'pri sm') : null,
      ['draft', 'approved'].includes(p.status) ? btn(t('cancel'), safe(async () => { if (confirm(t('confirm_cancel'))) { await api('POST', `/api/po/${p.id}/cancel`); refresh(); } }), 'sm danger') : null)));
  return h('div', {}, h('div', { class: 'row sp' }, h('h2', { style: 'margin:0' }, t('purchase_orders')), btn(t('new_po'), () => sups.length ? poForm(sups, ings) : toast(t('need_supplier'), true), 'pri')),
    h('div', { style: 'margin-top:10px' }, pos.length ? pos.map(poCard) : empty()),
    h('div', { class: 'row sp' }, h('h2', {}, t('suppliers')), btn(t('add_supplier'), () => supplierForm(null), 'sm')),
    h('div', { class: 'card table-wrap' }, sups.length ? h('table', {}, sups.map((s) => h('tr', {}, h('td', {}, s.name), h('td', {}, s.phone), h('td', { class: 'mute' }, s.note), h('td', { class: 'n' }, btn(t('edit'), () => supplierForm(s), 'sm'))))) : empty()));
}

function supplierForm(s) {
  modal(s ? t('edit') : t('add_supplier'), (close) => { const n = input({ value: s?.name || '', required: true }), p = input({ value: s?.phone || '' }), no = input({ value: s?.note || '' });
    return form([field(t('name'), n), field(t('phone'), p), field(t('note'), no)], async () => { await api(s ? 'PUT' : 'POST', s ? `/api/suppliers/${s.id}` : '/api/suppliers', { name: n.value, phone: p.value, note: no.value }); toast(t('saved')); refresh(); }, close); });
}

function poForm(sups, ings) {
  const st = { lines: [{ ingredient_id: '', qty: '', unit_cost: '' }] };
  modal(t('new_po'), (close) => {
    const sup = h('select', {}, sups.map((s) => h('option', { value: s.id }, s.name))), note = input({}), lines = h('div', {}), total = h('b', {});
    const draw = () => { lines.replaceChildren(...st.lines.map((l, idx) => { const ing = ings.find((i) => i.id === Number(l.ingredient_id));
      return h('div', { class: 'row', style: 'margin:4px 0;flex-wrap:nowrap' },
        h('select', { value: l.ingredient_id, style: 'flex:2', onchange: (e) => { l.ingredient_id = e.target.value; const i = ings.find((x) => x.id === Number(e.target.value)); if (i && !l.unit_cost) l.unit_cost = i.unit_cost; draw(); } }, h('option', { value: '' }, t('pick')), ings.map((i) => h('option', { value: i.id }, nm(i)))),
        h('input', { type: 'number', min: 0, step: 'any', placeholder: ing ? `${t('qty')} (${ing.unit})` : t('qty'), value: l.qty, style: 'flex:1;min-width:80px', oninput: (e) => { l.qty = e.target.value; sum(); } }),
        h('input', { type: 'number', min: 0, step: 'any', placeholder: t('unit_cost_short'), value: l.unit_cost, style: 'flex:1;min-width:90px', oninput: (e) => { l.unit_cost = e.target.value; sum(); } }), btn('✕', () => { st.lines.splice(idx, 1); draw(); }, 'sm')); })); sum(); };
    const sum = () => { total.textContent = `${t('total')}: ${money(st.lines.reduce((s, l) => s + (Number(l.qty) || 0) * (Number(l.unit_cost) || 0), 0))}`; };
    draw();
    return form([field(t('supplier'), sup), lines, btn(`+ ${t('add_line')}`, () => { st.lines.push({ ingredient_id: '', qty: '', unit_cost: '' }); draw(); }, 'sm'), h('div', { style: 'margin-top:8px' }, total), field(t('note'), note)],
      async () => { await api('POST', '/api/po', { supplier_id: sup.value, note: note.value, lines: st.lines.filter((l) => l.ingredient_id) }); toast(t('saved')); refresh(); }, close);
  }, { wide: true });
}

function receiveForm(p) {
  modal(`${t('receive_goods')} · PO #${p.id}`, (close) => { const inv = input({}); const qs = p.lines.map((l) => input({ type: 'number', min: 0, step: 'any', value: l.qty }));
    return form([field(t('invoice_no'), inv), ...p.lines.map((l, i) => field(`${nm(l)} (${t('ordered')} ${qf(l.qty)} ${l.unit})`, qs[i]))],
      async () => { await api('POST', `/api/po/${p.id}/receive`, { invoice_no: inv.value, lines: p.lines.map((l, i) => ({ ingredient_id: l.ingredient_id, received_qty: qs[i].value })) }); toast(t('saved')); refresh(); }, close, t('receive_goods')); });
}

window.addEventListener('hashchange', () => { const k = location.hash.slice(1); if (TABS.includes(k) && k !== tab) { tab = k; go(); } });
go();
