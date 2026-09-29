/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), { NextResponse } = require('next/server');
const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: key => mocks[key] ?? require(key), console, Error });
  return exports;
}
const id = '11111111-1111-4111-8111-111111111111';
const order = { id, status: 'pending', deleted_at: null, updated_at: '2026-09-29T00:00:00Z', order_items: [] };
let result, calls = [], released = 0, busy = false, authorized = true;
const db = {
  rpc: async (name, args) => { calls.push({ name, args }); return result; },
  from() { throw new Error('Restoration escaped the atomic RPC'); },
};
const route = load('app/api/orders/[id]/route.ts', {
  '@/app/api/ecotrack/_auth': { requireAdmin: async () => authorized ? {} : NextResponse.json({}, { status: 401 }) },
  '@/lib/supabase/admin': { createAdminClient: () => db },
  '@/lib/order-operation': { acquireOrderOperation: async () => busy ? null : async () => { released++; },
    orderBusyResponse: () => NextResponse.json({code: 'order_operation_busy'}, {status: 409}) },
  '@/lib/order-restoration': load('lib/order-restoration.ts'),
  '@/lib/order-edit-state': load('lib/order-edit-state.ts'),
  '@/lib/order-total': load('lib/order-total.ts'),
  '@/lib/delivery-prices': load('lib/delivery-prices.ts'),
  '@/lib/ecotrack': {}, '@/lib/order-ecotrack': {}, '@/lib/store-cache': { invalidateStoreCache() {} },
});
const patch = (body = { action: 'restore' }) => route.PATCH({ json: async () => body }, { params: Promise.resolve({ id }) });
(async () => {
  result = { data: { success: true, order, repaired_items: 1 }, error: null };
  assert.equal((await patch()).status, 200);
  assert.equal(calls[0].name, 'restore_order_safely');
  assert.equal(calls[0].args.p_repairs.length, 0);
  assert.equal(released, 1);
  result = { data: { success: true, already_restored: true, order: { ...order, status: 'confirmed' } }, error: null };
  const repeated = await (await patch()).json();
  assert.equal(repeated.order.status, 'confirmed', 'retries must not reset actual status');
  result = { data: { success: false, code: 'restore_needs_repair', expected_updated_at: order.updated_at,
    issues: [{ item_id: id, reason: 'missing_size' }] }, error: null };
  const response = await patch();
  assert.equal(response.status, 409);
  assert.equal((await response.json()).issues[0].reason, 'missing_size');
  const count = calls.length;
  assert.equal((await patch({action: 'restore', repairs: [{ item_id: id }]})).status, 400);
  assert.equal(calls.length, count);
  const repair = { item_id: id, product_id: id, color_id: id, size_id: id };
  assert.equal((await patch({action: 'restore', repairs: [repair], expected_updated_at: order.updated_at})).status, 409);
  assert.equal(calls.at(-1).args.p_repairs[0].size_id, id);
  assert.equal(calls.at(-1).args.p_expected_updated_at, order.updated_at);
  result = { data: null, error: { code: 'PGRST202', message: 'Function missing' } };
  const missing = await patch(); assert.equal(missing.status, 503);
  assert.equal((await missing.json()).code, 'restore_migration_required');
  result = { data: null, error: { code: '42703', message: 'column missing' } };
  assert.equal((await patch()).status, 500, 'database errors must not be mislabeled stock conflicts');
  result = { data: null, error: { message: 'empty_order' } };
  assert.equal((await patch()).status, 409);
  const beforeBusy = calls.length;
  busy = true; assert.equal((await patch()).status, 409); assert.equal(calls.length, beforeBusy);
  authorized = false; assert.equal((await patch()).status, 401); assert.equal(calls.length, beforeBusy);
  console.log('PASS: atomic restore API, explicit repairs, canonical status, distinct errors, missing migration, mutex and auth');
})().catch(error => { console.error(error); process.exitCode = 1; });
