/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const assert = require('node:assert/strict'), ts = require('typescript');
const { NextResponse } = require('next/server');
const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: n => mocks[n] ?? require(n), console, Error });
  return exports;
}
const id = '11111111-1111-4111-8111-111111111111';
let authorized = true, invalidations = 0, dbError = null, writes = 0;
const auth = { requireAdmin: async () => authorized ? { userId: id } : NextResponse.json({}, { status: 401 }) };
const db = {
  rpc: async () => { writes++; return { data: { id }, error: dbError }; },
  from() {
    const query = { then(resolve) { writes++; return Promise.resolve({ data: { id }, error: dbError }).then(resolve); } };
    for (const key of ['update', 'upsert', 'insert', 'delete', 'eq', 'select', 'single']) query[key] = () => query;
    return query;
  },
};
const cache = { invalidateStoreCache() { invalidations++; } };
const catalog = load('app/api/admin/catalog/route.ts', {
  '@/app/api/ecotrack/_auth': auth, '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/store-cache': cache, '@/lib/catalog-validation': load('lib/catalog-validation.ts'),
});
const post = body => catalog.POST({ json: async () => body });

(async () => {
  const productSave = { action: 'product_save', expected_updated_at: null,
    product: { id, name: 'Dress', price: 1000, original_price: 0, description: null, is_visible: true, category_id: null },
    colors: [{ id, name: 'Black', hex_code: '#000000', is_visible: true, sort_order: 0, images: [] }],
    sizes: [{ id, label: 'M', is_visible: true, sort_order: 0 }], stock_changes: [],
  };
  for (const action of [productSave, { action: 'stock_save', product_id: id, color_id: id, size_id: id, expected_stock: 4, stock: null },
    { action: 'settings_save', policy: 'Policy' }, { action: 'category_create', name: 'New', sort_order: 0 },
    ...['category_delete', 'product_delete', 'review_delete'].map(action => ({ action, id })),
    { action: 'product_visibility', id, visible: false }, { action: 'review_status', id, status: 'approved' }]) {
    const before = invalidations;
    assert.equal((await post(action)).status, 200);
    assert.equal(invalidations, before + 1, `${action.action} did not refresh store cache`);
  }
  dbError = { message: 'rejected' };
  const before = invalidations;
  assert.equal((await post({ action: 'settings_save', policy: 'Must fail' })).status, 500);
  assert.equal(invalidations, before);
  dbError = { message: 'stock_conflict' };
  assert.equal((await post({ action: 'stock_save', product_id: id, color_id: id, size_id: id, expected_stock: 5, stock: 8 })).status, 409);
  dbError = null;
  const beforeWrites = writes;
  assert.equal((await post({ ...productSave, stock_changes: [{ color_id: id, size_id: id, stock: -1, expected_stock: null }] })).status, 400);
  assert.equal(writes, beforeWrites);
  authorized = false;
  assert.equal((await post(productSave)).status, 401);
  assert.equal(writes, beforeWrites);
  authorized = true;

  const locks = new Map();
  let lockFailure = false;
  const updated_at = '2026-09-28T12:00:00+00:00';
  const item = { product_id: id, color_id: id, size_id: id, quantity: 1 };
  const order = { id, status: 'confirmed', ecotrack_status: 'draft', ecotrack_tracking: 'TRACK', updated_at,
    customer_name: 'Customer', phone: '0555555555', wilaya: '16', delivery_type: 'home', delivery_price: 850,
    commune: 'Alger', address: 'Address', total_price: 1850, order_items: [{ ...item, product_name: 'Dress', color_name: 'Black', size_label: 'M' }] };
  const orderDb = {
    async rpc(name, args) {
      if (name === 'try_lock_order_operation') {
        if (lockFailure) return { data: null, error: { message: 'lock unavailable' } };
        if (locks.has(args.p_order_id)) return { data: false, error: null };
        locks.set(args.p_order_id, args.p_token); return { data: true, error: null };
      }
      if (name === 'release_order_operation') {
        if (locks.get(args.p_order_id) === args.p_token) locks.delete(args.p_order_id);
      }
      return { data: {}, error: null };
    },
    from(table) {
      const result = { data: table === 'orders' ? order : [{ id, price: 1000, name: 'Dress',
        product_colors: [{ id, name: 'Black' }], product_sizes: [{ id, label: 'M' }], product_variants: [{ color_id: id, size_id: id, stock: 5 }] }], error: null };
      const query = { then: resolve => Promise.resolve(result).then(resolve) };
      for (const key of ['select', 'eq', 'is', 'in', 'single']) query[key] = () => query;
      return query;
    },
  };
  let finishExternal, externalEntered, externalCalls = 0;
  const entered = new Promise(resolve => { externalEntered = resolve; });
  const external = new Promise(resolve => { finishExternal = resolve; });
  const common = {
    '@/app/api/ecotrack/_auth': auth, '../_auth': auth,
    '@/lib/supabase/admin': { createAdminClient: () => orderDb },
    '@/lib/store-cache': cache, '@/lib/order-operation': load('lib/order-operation.ts'),
    '@/lib/order-total': load('lib/order-total.ts'), '@/lib/delivery-prices': load('lib/delivery-prices.ts'),
    '@/lib/order-ecotrack': {},
    '@/lib/order-edit-state': load('lib/order-edit-state.ts'),
  '@/lib/order-restoration': load('lib/order-restoration.ts'),
    '@/lib/ecotrack': { WILAYA_CODE_BY_NUMBER: {}, ecotrackUpdateOrder: async () => {
      externalCalls++; externalEntered(); await external; return { success: true };
    }, ecotrackShipOrder: async () => { throw new Error('shipment overlapped edit'); } },
  };
  const orders = load('app/api/orders/[id]/route.ts', common);
  const ship = load('app/api/ecotrack/ship/route.ts', common);
  const req = { json: async () => ({ ...order, expected_updated_at: updated_at, items: [item] }) };
  const params = { params: Promise.resolve({ id }) };
  authorized = false;
  assert.equal((await orders.GET({}, params)).status, 401);
  authorized = true;
  const freshOrder = await orders.GET({}, params);
  assert.equal(freshOrder.status, 200);
  assert.equal(freshOrder.headers.get('Cache-Control'), 'no-store');
  assert.equal((await freshOrder.json()).order.updated_at, updated_at);
  const editing = orders.PUT(req, params);
  await entered;
  assert.equal((await orders.PUT(req, params)).status, 409);
  assert.equal((await orders.PATCH({ json: async () => ({ action: 'unconfirm' }) }, params)).status, 409);
  assert.equal((await ship.POST({ json: async () => ({ order_id: id }) })).status, 409);
  assert.equal(externalCalls, 1);
  finishExternal(); assert.equal((await editing).status, 200);
  assert.equal(locks.size, 0);
  assert.equal((await orders.PUT({ json: async () => ({ ...order, expected_updated_at: 'old' }) }, params)).status, 409);
  assert.equal(locks.size, 0, 'validation return leaked mutex');
  lockFailure = true;
  assert.equal((await orders.PUT(req, params)).status, 500);
  assert.equal(externalCalls, 1, 'lock failure must stop external mutation');
  console.log('PASS: catalog auth/validation/errors/cache, concurrent edit/ship rejection, stale edits and fail-closed mutex');
})().catch(error => { console.error(error); process.exitCode = 1; });
