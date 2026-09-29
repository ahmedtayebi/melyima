/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}, append = '') {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8') + append, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
  }).outputText;
  vm.runInNewContext(code, { exports, require: n => mocks[n] ?? require(n), console, Error, AbortController, fetch: mocks.$fetch, crypto: require('node:crypto').webcrypto, setTimeout() {} });
  return exports;
}
let slots = [], cursor = 0, effects = [], firstRender = true;
const hooks = {
  useState(initial) { const i = cursor++; if (!(i in slots)) slots[i] = typeof initial === 'function' ? initial() : initial;
    return [slots[i], value => { slots[i] = typeof value === 'function' ? value(slots[i]) : value; }]; },
  useRef(value) { const i = cursor++; if (!(i in slots)) slots[i] = { current: value }; return slots[i]; },
  useEffect(fn) { if (firstRender) effects.push(fn); },
  useCallback: fn => fn,
};
const walk = n => !n || typeof n !== 'object' ? [] : Array.isArray(n) ? n.flatMap(walk) : [n, ...walk(n.props?.children)];
let payloads = [], navigations = [], fail = false;
const mocks = {
  react: hooks,
  'next/navigation': { useRouter: () => ({ push: p => navigations.push(p), refresh() {} }) },
  '@/components/ui/Button': { default: function Button() {} },
  '@/lib/utils': { cn: (...values) => values.join(' ') },
  '@/lib/admin-catalog-client': { saveCatalog: async (action, payload) => {
    payloads.push({ action, payload }); if (fail) throw new Error('simulated rejection'); return null;
  } },
  '@/lib/supabase/client': { createClient: () => ({ from: () => ({ select: () => ({ eq: async () => ({
    data: [{ color_id: 'c', size_id: 's', stock: 5 }], error: null,
  }) }) }) }) },
};
const Form = load('components/admin/ProductForm.tsx', mocks).default;
const initialData = { name: 'Dress', price: 1000, updated_at: '2026-09-28T12:00:00Z',
  product_colors: [{ id: 'c', name: 'Black', hex_code: '#000000', sort_order: 0, images: [] }],
  product_sizes: [{ id: 's', label: 'M', sort_order: 0 }, { id: 'unlimited', label: 'L', sort_order: 1 }],
};
const render = () => { cursor = 0; const tree = Form({ productId: 'p', initialData }); firstRender = false; return tree; };
const save = tree => walk(tree).find(n => n.props?.children === 'حفظ التعديلات').props.onClick();

(async () => {
  render(); effects.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve));
  await save(render());
  assert.equal(payloads.at(-1).payload.stock_changes.length, 0, 'metadata edit sends no stock snapshot');
  const grid = () => walk(render()).find(n => n.type?.name === 'StockGrid');
  grid().props.onChange('c', 's', '');
  await save(render());
  assert.equal(payloads.at(-1).payload.stock_changes.length, 1);
  assert.equal(payloads.at(-1).payload.stock_changes[0].stock, null);
  assert.equal(payloads.at(-1).payload.stock_changes[0].expected_stock, 5);
  grid().props.onChange('c', 's', '0');
  await save(render());
  assert.equal(payloads.at(-1).payload.stock_changes[0].stock, 0);
  fail = true; navigations = [];
  await save(render());
  assert.equal(navigations.length, 0, 'failed atomic save must stay in the editor');
  assert(walk(render()).some(n => n.props?.children === 'simulated rejection'));

  slots = []; cursor = 0;
  const Settings = load('components/admin/SettingsClient.tsx', mocks).default;
  const settings = () => { cursor = 0; return Settings({ initialSettings: { store_policy: 'Original' } }); };
  await walk(settings()).find(n => n.type === 'button').props.onClick();
  assert.equal(slots[2], false, 'failed settings save cannot show success');
  assert.equal(slots[1], false, 'failed settings save must reset loading');
  assert(walk(settings()).some(n => n.props?.role === 'alert' && n.props.children === 'simulated rejection'));

  const memos = [];
  const stats = load('components/admin/StatsClient.tsx', {
    react: { useState: () => ['30d', () => {}], useMemo: fn => { const result = fn(); memos.push(result); return result; } },
    '@/lib/utils': mocks['@/lib/utils'],
  }, '\nexport { buildChartData };');
  const created_at = new Date().toISOString();
  stats.default({ orders: [
    { status: 'delivered', products_total: 1000, total_price: 1000, delivery_price: 0, created_at, order_items: [{ product_name: 'Sold', quantity: 1 }] },
    { status: 'cancelled', products_total: 9000, total_price: 9000, delivery_price: 0, created_at, order_items: [{ product_name: 'Cancelled', quantity: 9 }] },
    { status: 'pending', total_price: 6000, created_at, order_items: [{ product_name: 'Pending', quantity: 6 }] },
  ] });
  assert.equal(memos[1].totalOrders, 3);
  assert.equal(memos[1].totalSales, 1000);
  assert.equal(memos[1].avgOrder, 1000);
  assert.equal(memos[2].thisMonth, 1000);
  assert.equal(memos[6][0].name, 'Sold');
  assert.equal(memos[7][0].revenue, 1000);
  const old = new Date(); old.setDate(old.getDate() - 30);
  const chart = stats.buildChartData([{ created_at: old.toISOString() }, { created_at }], '30d');
  assert.equal(chart.length, 30);
  assert.equal(chart.reduce((sum, day) => sum + day.count, 0), 1);
  // A real conflict must keep the administrator's draft and require review,
  // without closing the form or silently replacing the saved order.
  slots = []; cursor = 0; firstRender = true; effects = [];
  const editState = load('lib/order-edit-state.ts');
  const editOrder = { id: 'o', status: 'pending', customer_name: 'Customer', phone: '0555555555',
    wilaya: '16', delivery_type: 'home', delivery_price: 0, total_price: 5900,
    address: 'Address', commune: 'Alger', notes: '', updated_at: 'old',
    order_items: [{ id: 'i', product_id: 'p', color_id: 'c', size_id: 's', quantity: 1 }] };
  const latest = editState.orderEditState({...editOrder, phone: '0666666666'});
  const requests = []; let saved = 0;
  const EditForm = load('components/admin/OrderEditForm.tsx', {
    react: {...hooks, useMemo: fn => fn()},
    '@/lib/delivery-prices': load('lib/delivery-prices.ts'),
    '@/lib/order-total': load('lib/order-total.ts'),
    '@/lib/order-edit-state': editState,
    $fetch: async (_url, init) => {
      requests.push(JSON.parse(init.body));
      return {ok: requests.length > 1, json: async () => requests.length === 1
        ? {success: false, code: 'order_edit_conflict', error: 'Review changes', current_state: latest,
          changes: [{key: 'phone', label: 'Phone', value: latest.phone}]}
        : {success: true}};
    },
  }).default;
  const editTree = () => { cursor = 0; const tree = EditForm({order: editOrder, products: [], onCancel() {}, onSaved() { saved++; }}); firstRender = false; return tree; };
  walk(editTree()).find(n => n.type === 'input' && n.props.value === '5900').props.onChange({target: {value: '5400'}});
  await editTree().props.onSubmit({preventDefault() {}});
  assert.equal(requests.length, 1, 'conflict must not auto-overwrite');
  assert(walk(editTree()).some(n => n.type === 'input' && n.props.value === '5400'), 'conflict lost the entered total');
  const review = walk(editTree()).find(n => n.type === 'button' && n.props.children === 'راجعت التغييرات، احفظ مدخلاتي');
  review.props.onClick({preventDefault() {}});
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.equal(requests[1].expected_state.phone, latest.phone);
  assert.equal(requests[1].total_price, 5400);
  assert.equal(saved, 1);
  console.log('PASS: order edit draft preserved through conflict and saved only after explicit review');
  slots = []; cursor = 0; firstRender = true; effects = [];
  let restoredOrder = null; const restoreRequests = [];
  const RestoreForm = load('components/admin/OrderRestoreForm.tsx', {
    react: hooks,
    $fetch: async (_url, init) => {
      if (init?.method !== 'PATCH') return {ok: true, json: async () => ({success: true, order: {...editOrder, updated_at: '2026-09-29T00:00:00Z'},
        products: [{id: 'p', name: 'Dress', product_colors: [{id: 'c', name: 'Black', is_visible: true}], product_sizes: [{id: 's', label: 'M', is_visible: true}]}]})};
      restoreRequests.push(JSON.parse(init.body));
      return {ok: true, json: async () => ({success: true, already_restored: true, order: {...editOrder, status: 'confirmed'}})};
    },
  }).default;
  const restoreTree = () => { cursor = 0; const tree = RestoreForm({order: editOrder,
    initialIssues: [{item_id: 'i', product_id: 'p', color_id: 'c', size_id: null, reason: 'missing_size', product_name: 'Dress', color_name: 'Black', size_label: 'Removed', quantity: 1}],
    onRestored: o => { restoredOrder = o; }, onCancel() {}}); firstRender = false; return tree; };
  restoreTree(); effects.forEach(fn => fn()); await new Promise(resolve => setImmediate(resolve));
  await restoreTree().props.onSubmit({preventDefault() {}});
  assert.equal(restoreRequests.length, 0, 'missing size must not be replaced without explicit selection');
  walk(restoreTree()).find(n => n.type === 'select' && n.props.value === '').props.onChange({target: {value: 's'}});
  await restoreTree().props.onSubmit({preventDefault() {}});
  assert.equal(restoreRequests.length, 1);
  assert.equal(restoreRequests[0].repairs[0].size_id, 's');
  assert.equal(restoreRequests[0].expected_updated_at, '2026-09-29T00:00:00Z');
  assert.equal(restoredOrder.status, 'confirmed');
  console.log('PASS: restore dialog requires explicit missing-option selection and preserves canonical server status');
  console.log('PASS: product dirty stock/null/zero, save failures, delivered-only revenue/rankings and chart boundaries');
})().catch(error => { console.error(error); process.exitCode = 1; });
