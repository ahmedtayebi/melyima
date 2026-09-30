/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ts = require('typescript'), { NextResponse } = require('next/server'), { PDFDocument } = require('pdf-lib');
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname, '../..', file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText, { exports, require: key => mocks[key] ?? require(key), console, URL, AbortSignal, TextDecoder, Uint8Array, ...globals });
  return exports;
}
const eligibility = load('lib/order-labels.ts');
const id = '11111111-1111-4111-8111-111111111111';
const ready = { id, customer_name: 'Test', created_at: '2026-09-30', status: 'confirmed', deleted_at: null, ecotrack_status: 'draft', ecotrack_tracking: 'TEST-TRACKING' };
(async () => {
  assert(eligibility.canPrintLabel(ready));
  for (const change of [{status:'pending'}, {status:'cancelled'}, {status:'delivered'}, {deleted_at:'today'}, {ecotrack_status:'shipped'}, {ecotrack_status:'none'}, {ecotrack_tracking:null}, {ecotrack_tracking:' '}]) {
    assert(!eligibility.canPrintLabel({...ready,...change}));
  }
  const source = await PDFDocument.create(); source.addPage([283,425]); source.addPage([400,600]);
  const pdf = await source.save();
  let requests = [], fetchImpl = async () => new Response(pdf);
  const ecotrack = load('lib/ecotrack-label.ts', {}, { process: { env: { ECOTRACK_API_URL:'https://world-express.ecotrack.dz', ECOTRACK_API_TOKEN:'secret-token' } }, fetch: async (url, options) => {
    requests.push({url: String(url), options}); return fetchImpl(url, options);
  } });
  assert.equal((await ecotrack.fetchEcotrackLabel('TRACK & #')).length, pdf.length);
  assert.equal(new URL(requests[0].url).searchParams.get('tracking'), 'TRACK & #');
  assert(!requests[0].url.includes('secret-token'));
  assert.equal(requests[0].options.headers.Authorization,'Bearer secret-token');
  assert.equal(requests[0].options.cache, 'no-store');
  requests = [];
  fetchImpl = async url => new URL(url).hostname === 'world-express.ecotrack.dz'
    ? new Response(null,{status:302,headers:{location:'https://storage.ecotrack.dz/world-express/test.pdf?signature=temporary'}})
    : new Response(pdf);
  assert.equal((await ecotrack.fetchEcotrackLabel('TRACK')).length,pdf.length);
  assert.equal(requests.length,2); assert.equal(requests[1].options.headers.Authorization,undefined,'never forward credentials to storage');
  fetchImpl = async () => new Response(null,{status:302,headers:{location:'https://attacker.example/file.pdf'}});
  requests=[]; await assert.rejects(()=>ecotrack.fetchEcotrackLabel('TRACK')); assert.equal(requests.length,1);
  fetchImpl = async () => new Response(null,{status:302,headers:{location:'https://storage.ecotrack.dz/loop'}});
  requests=[]; await assert.rejects(()=>ecotrack.fetchEcotrackLabel('TRACK')); assert.equal(requests.length,3);
  fetchImpl = async () => new Response('<html>Login</html>'); await assert.rejects(()=>ecotrack.fetchEcotrackLabel('TRACK'));
  fetchImpl = async () => new Response(pdf,{status:403}); await assert.rejects(()=>ecotrack.fetchEcotrackLabel('TRACK'));
  fetchImpl = async () => new Response(new Uint8Array(5*1024*1024+1)); await assert.rejects(()=>ecotrack.fetchEcotrackLabel('TRACK'));

  let authorized=true, busy=false, order=ready, dbError=null, releases=0, downloads=0, downloadFail=false;
  const db = { from() { return { select() { return this; }, eq() { return this; }, maybeSingle: async()=>({data:order,error:dbError}) }; } };
  const mocks = {
    '@/app/api/ecotrack/_auth': {},
    '../../_auth': {requireAdmin: async()=>authorized?{}:NextResponse.json({}, {status:401})},
    '@/lib/supabase/admin': {createAdminClient:()=>db},
    '@/lib/order-operation': {acquireOrderOperation:async()=>busy?null:async()=>{releases++;},orderBusyResponse:()=>NextResponse.json({}, {status:409})},
    '@/lib/order-labels': eligibility,
    '@/lib/ecotrack-label': {fetchEcotrackLabel:async tracking=>{downloads++;assert.equal(tracking,ready.ecotrack_tracking);if(downloadFail)throw Error('upstream secret');return pdf;}},
  };
  const route=load('app/api/ecotrack/labels/[id]/route.ts',mocks);
  const get=(oid=id)=>route.GET({}, {params:Promise.resolve({id:oid})});
  let res=await get();assert.equal(res.status,200);assert.equal(res.headers.get('content-type'),'application/pdf');assert.match(res.headers.get('cache-control'),/no-store/);assert.equal(releases,1);
  assert.equal((await get('bad')).status,400);
  authorized=false;assert.equal((await get()).status,401);authorized=true;
  busy=true;assert.equal((await get()).status,409);busy=false;
  for(const change of [{ecotrack_status:'shipped'},{deleted_at:'now'},{status:'cancelled'},{ecotrack_tracking:null}]){order={...ready,...change};assert.equal((await get()).status,409);}
  assert.equal(downloads,1,'ineligible orders must never reach Ecotrack');
  order=null;assert.equal((await get()).status,404);
  dbError={message:'db'};assert.equal((await get()).status,500);dbError=null;order=ready;
  downloadFail=true;const before=releases;res=await get();assert.equal(res.status,502);assert.equal(releases,before+1);assert(!(await res.text()).includes('secret'));

  let cursor=null,listCalls=0;
  const listDb={from(){return {select(){return this;},eq(){return this;},is(){return this;},not(){return this;},order(){return this;},limit(){return this;},gt(k,v){cursor=v;return this;},then(resolve){listCalls++;resolve({data:cursor?[{...ready,id:'last'}]:Array.from({length:500},(_,i)=>({...ready,id:`row-${i}`})),error:null});}}}};
  const list=load('app/api/ecotrack/labels/route.ts',{'../_auth':mocks['../../_auth'],'@/lib/supabase/admin':{createAdminClient:()=>listDb},'@/lib/order-labels':eligibility});
  const listing=await list.GET();assert.equal((await listing.json()).orders.length,501);assert.equal(listCalls,2);assert.equal(cursor,'row-499');

  const batchOrders=[{...ready,id:'one'},{...ready,id:'bad'},{...ready,id:'two'}];let fetched=[];
  const builder=load('lib/build-labels-pdf.ts',{}, {fetch:async url=>{fetched.push(url);return url.endsWith('/bad')?Response.json({error:'فشل تجريبي'},{status:502}):new Response(pdf);}});
  let result=await builder.buildLabelsPdf(batchOrders,new AbortController().signal,()=>{});
  assert.equal(result.included.length,2);assert.equal(result.failures.length,1);assert.equal(result.failures[0].id,'bad');
  const merged=await PDFDocument.load(result.bytes);assert.equal(merged.getPageCount(),4);assert.equal(merged.getPage(0).getWidth(),283);assert.equal(merged.getPage(3).getHeight(),600);
  const controller=new AbortController();fetched=[];
  result=await builder.buildLabelsPdf(batchOrders,controller.signal,()=>controller.abort());
  assert.equal(result.included.length,1);assert(result.cancelled);assert.equal(fetched.length,1);
  console.log('PASS: label eligibility, auth/current state/mutex, PDF validation and redirects without token leakage, complete pagination, multi-page merging, partial failures and cancellation');
})().catch(error=>{console.error(error);process.exitCode=1});
