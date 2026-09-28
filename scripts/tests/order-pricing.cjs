/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const { createRequire } = require('node:module');
const root = require('node:path').resolve(__dirname, '../..');
const localRequire = createRequire(root + '/package.json');
const ts = localRequire('typescript');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(root + '/' + file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: name => mocks[name] ?? localRequire(name), console });
  return exports;
}
const pricing = load('lib/order-total.ts');
const delivery = load('lib/delivery-prices.ts');
const id = '11111111-1111-4111-8111-111111111111';
const item = { product_id: id, color_id: id, size_id: id, quantity: 2 };
const body = { expected_updated_at: '2026-09-28T12:00:00+00:00', customer_name: 'Customer', phone: '0555555555', wilaya: '16', delivery_type: 'home', commune: 'Alger', address: 'Address', notes: '', items: [item], total_price: 2400 };
let order, calls, rpcError;
function reset(status = 'pending', ecotrack = 'none') {
  order = { ...body, updated_at: body.expected_updated_at, id, status, deleted_at: null, delivery_price: 850, ecotrack_status: ecotrack, ecotrack_tracking: ecotrack === 'none' ? null : 'TRACK', total_price: 2850, order_items: [{ ...item, product_name: 'Dress', color_name: 'Black', size_label: 'M' }] };
  calls = [];
  rpcError = null;
}
const db = {
  from(table) {
    const result = { data: table === 'orders' ? order : [{ id, name: 'Dress', price: 1000, product_colors: [{id, name: 'Black'}], product_sizes: [{id, label: 'M'}], product_variants: [{color_id: id, size_id: id, stock: 5}] }], error: null };
    const query = { then(resolve) { return Promise.resolve(result).then(resolve); }, single: async () => result };
    for (const method of ['select', 'eq', 'in', 'is']) query[method] = () => query;
    query.update = value => { calls.push(['update', value]); return query; };
    return query;
  },
  async rpc(name, args) { calls.push(['rpc', args]); return { data: {}, error: rpcError }; },
};
const route = load('app/api/orders/[id]/route.ts', {
  '@/app/api/ecotrack/_auth': { requireAdmin: async () => ({userId: id}) },
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/ecotrack': { WILAYA_CODE_BY_NUMBER: {}, ecotrackUpdateOrder: async (tracking, data) => { calls.push(['ecotrack', data]); return {success: true}; } },
  '@/lib/order-ecotrack': {},
  '@/lib/order-operation': { acquireOrderOperation: async () => async () => {} },
  '@/lib/store-cache': { invalidateStoreCache() {} },
  '@/lib/delivery-prices': delivery,
  '@/lib/order-total': pricing,
});
const put = payload => route.PUT({ json: async () => payload }, { params: Promise.resolve({ id }) });
(async () => {
  reset('confirmed', 'draft');
  assert.equal((await put({...body, expected_updated_at: 'old'})).status, 409);
  assert.equal(calls.length, 0, 'stale edit must not call Ecotrack');
  for (const value of [null, '', '2400', -1, 849, NaN, Infinity, 2400.001, Number.MAX_SAFE_INTEGER]) {
    reset();
    assert.equal((await put({...body, total_price: value})).status, 400);
    assert.equal(calls.length, 0);
  }
  for (const value of [850, 2400, 2400.25, 4000]) {
    reset();
    assert.equal((await put({...body, total_price: value})).status, 200);
    assert.equal(calls[0][1].p_total_price, value);
  }
  reset('confirmed', 'draft');
  assert.equal((await put(body)).status, 200);
  assert.equal(calls[0][0], 'ecotrack');
  assert.equal(calls[0][1].montant, 2400);
  assert.equal(calls[1][1].p_total_price, 2400);
  reset('confirmed', 'draft');
  rpcError = { message: 'insufficient_stock' };
  assert.equal((await put(body)).status, 409);
  assert.equal(calls.at(-1)[0], 'ecotrack');
  assert.equal(calls.at(-1)[1].montant, 2850);
  for (const [status, shipping] of [['confirmed', 'shipped'], ['delivered', 'shipped'], ['cancelled', 'none']]) {
    reset(status, shipping);
    assert.equal((await put(body)).status, 409);
    assert.equal(calls.length, 0);
    const notesOnly = {...body}; delete notesOnly.total_price;
    assert.equal((await put(notesOnly)).status, 200);
    assert.equal(calls[0][0], 'update');
  }
  reset('confirmed', 'draft');
  const automatic = {...body}; delete automatic.total_price;
  assert.equal((await put(automatic)).status, 200);
  assert.equal(calls[0][1].montant, 2850);
  assert.equal(calls[1][1].p_total_price, null);
  for (const flag of [null, 'true', 'false', 0, 1, {}]) {
    reset();
    assert.equal((await put({...body, free_delivery: flag})).status, 400);
    assert.equal(calls.length, 0);
  }
  reset('confirmed', 'draft');
  assert.equal((await put({...body, free_delivery: true, total_price: 2000})).status, 200);
  assert.equal(calls[0][1].montant, 2000);
  assert.equal(calls[1][1].p_delivery_price, 0);
  assert.equal(calls[1][1].p_total_price, 2000);
  reset();
  order.delivery_price = 0;
  assert.equal((await put({...body, total_price: 2000})).status, 200);
  assert.equal(calls[0][1].p_delivery_price, 0);
  reset();
  order.delivery_price = 0;
  assert.equal((await put({...body, total_price: 2850, free_delivery: false})).status, 200);
  assert.equal(calls[0][1].p_delivery_price, 850);
  reset();
  assert.equal((await put({...body, total_price: 2000, free_delivery: true, wilaya: '01'})).status, 200);
  assert.equal(calls[0][1].p_delivery_price, 0);
  reset();
  assert.equal((await put({...body, total_price: 0, free_delivery: true, delivery_type: 'office'})).status, 200);
  assert.equal(calls[0][1].p_delivery_price, 0);
  reset('confirmed', 'draft');
  rpcError = { message: 'insufficient_stock' };
  assert.equal((await put({...body, free_delivery: true, total_price: 2000})).status, 409);
  assert.equal(calls.at(-1)[1].montant, 2850);
  for (const [status, shipping] of [['confirmed', 'shipped'], ['delivered', 'shipped'], ['cancelled', 'none']]) {
    reset(status, shipping);
    assert.equal((await put({...body, total_price: 2850, free_delivery: true})).status, 409);
    assert.equal(calls.length, 0);
  }
  reset('confirmed', 'draft');
  assert.equal((await put({...automatic, free_delivery: true})).status, 200);
  assert.equal(calls[0][1].montant, 2000);
  assert.equal(calls[1][1].p_delivery_price, 0);
  console.log('PASS: total validation, paid/free delivery, persistence, restored fees, changed destination, Ecotrack amount/rollback, locked orders and automatic pricing');
})().catch(error => { console.error(error); process.exitCode = 1; });
