/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript');
const { NextResponse } = require('next/server');
const root = path.resolve(__dirname, '../..');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  vm.runInNewContext(code, { exports, require: key => mocks[key] ?? require(key), console, ...globals });
  return exports;
}
const id = '11111111-1111-4111-8111-111111111111';
let paths = [];
const cache = load('lib/store-cache.ts', {'next/cache': {
  revalidatePath: (...args) => paths.push(args),
}});
const reset = () => { paths = []; };
const contains = target => paths.some(([p]) => p === target);

(async () => {
  cache.invalidateStoreCache({kind:'stock', productIds:[id, null, id]});
  assert.deepEqual(paths, [
    [`/products/${id}`], ['/'], ['/new-arrivals'], ['/best-sellers'], ['/discounts'],
    ['/(store)/category/[id]', 'page'],
  ]);
  assert(!contains('/sitemap.xml'));
  assert(!paths.some(([,type]) => type === 'layout'));
  reset(); cache.invalidateStoreCache({kind:'stock', productIds:[]});
  assert.equal(paths.length, 0);
  cache.invalidateStoreCache({kind:'products', productIds:[id]});
  assert(contains(`/products/${id}`)); assert(contains('/sitemap.xml'));
  assert(contains('/(store)/category/[id]'), 'category moves must refresh old and new lists');
  reset(); cache.invalidateStoreCache({kind:'reviews'});
  assert.deepEqual(paths, [['/']]);
  reset(); cache.invalidateStoreCache({kind:'policy'});
  assert.deepEqual(paths, [['/(store)/products/[id]', 'page']]);
  for (const kind of ['categories', 'all']) {
    reset(); cache.invalidateStoreCache({kind});
    assert.deepEqual(paths, [['/(store)', 'layout'], ['/sitemap.xml']]);
  }

  let created = true, failed = false, notifications = 0;
  const create = load('app/api/orders/route.ts', {
    'next/server': {NextResponse, after: () => { notifications++; }},
    '@supabase/supabase-js': {createClient: () => ({rpc: async () => ({
      data: {order_id:id, created}, error: failed ? {message:'insufficient_stock'} : null,
    })})},
    '@/lib/delivery-prices': load('lib/delivery-prices.ts'),
    '@/lib/order-notification-email': {}, '@/lib/store-cache': cache,
  }, {process:{env:{SUPABASE_SERVICE_ROLE_KEY:'test-only'}}});
  const body = {customer_name:'Customer', phone:'0555555555', wilaya:'16', commune:'Alger',
    delivery_type:'home', address:'Address', request_id:id,
    items:[{product_id:id, color_id:id, size_id:id, quantity:1}]};
  reset(); assert.equal((await create.POST({json:async () => body})).status, 200);
  assert(contains(`/products/${id}`)); assert.equal(notifications, 1);
  created = false; reset();
  assert.equal((await create.POST({json:async () => body})).status, 200);
  assert.equal(paths.length, 0, 'idempotent checkout retry must not invalidate cache');
  assert.equal(notifications, 1);
  failed = true;
  assert.equal((await create.POST({json:async () => body})).status, 400);
  assert.equal(paths.length, 0);

  let restored = 1, rpcError = null, releases = 0;
  const order = {id, status:'pending', deleted_at:null, ecotrack_tracking:null,
    ecotrack_status:'none', order_items:[{product_id:id}]};
  const db = {
    rpc: async () => ({data:restored, error:rpcError}),
    from() {
      const q = {then: resolve => Promise.resolve({data:order, error:null}).then(resolve)};
      for (const method of ['select','eq','single','maybeSingle','update','is']) q[method] = () => q;
      return q;
    },
  };
  const orders = load('app/api/orders/[id]/route.ts', {
    '@/app/api/ecotrack/_auth': {requireAdmin:async () => ({})},
    '@/lib/supabase/admin': {createAdminClient:() => db},
    '@/lib/order-operation': {acquireOrderOperation:async () => async () => {releases++;}},
    '@/lib/order-edit-state': load('lib/order-edit-state.ts'),
    '@/lib/order-restoration': load('lib/order-restoration.ts'),
    '@/lib/order-total': load('lib/order-total.ts'),
    '@/lib/delivery-prices': load('lib/delivery-prices.ts'),
    '@/lib/ecotrack': {}, '@/lib/order-ecotrack': {}, '@/lib/store-cache':cache,
  });
  const remove = permanent => orders.DELETE({nextUrl:{searchParams:new URLSearchParams(permanent ? 'permanent=1' : '')}},
    {params:Promise.resolve({id})});
  reset(); assert.equal((await remove(false)).status, 200);
  assert(contains(`/products/${id}`)); assert.equal(releases, 1);
  restored = 0; reset(); assert.equal((await remove(false)).status, 200);
  assert.equal(paths.length, 0, 'unlimited stock deletion requires no refresh');
  restored = 1; assert.equal((await remove(true)).status, 200);
  assert.equal(paths.length, 0, 'permanent removal of archived order does not release stock again');
  rpcError = {message:'order_locked'};
  assert.equal((await remove(false)).status, 409);
  assert.equal(paths.length, 0);
  rpcError = null;
  assert.equal((await orders.PATCH({json:async () => ({action:'confirm'})}, {params:Promise.resolve({id})})).status, 200);
  assert.equal(paths.length, 0, 'confirmation does not change inventory');

  // Identical source data must produce identical sitemap content across rebuilds.
  let now = 1000, sorts = 0;
  class Clock extends Date { constructor(...args) { super(...(args.length ? args : [now])); } }
  const sitemap = load('app/sitemap.ts', {'@/lib/supabase/static':{createStaticClient:() => ({
    from() {
      const q = {then:resolve => Promise.resolve({data:[{id,updated_at:'2026-01-01T00:00:00Z'}]}).then(resolve)};
      q.select = q.eq = () => q;
      q.order = key => {assert.equal(key, 'id'); sorts++; return q;};
      return q;
    },
  })}}, {Date:Clock});
  const first = JSON.stringify(await sitemap.default()); now += 3600000;
  assert.equal(JSON.stringify(await sitemap.default()), first);
  assert.equal(sorts, 4);
  console.log('PASS: scoped cache refresh, checkout retries, stock deletion, confirmation, unlimited stock and deterministic sitemap');
})().catch(error => {console.error(error); process.exitCode = 1;});
