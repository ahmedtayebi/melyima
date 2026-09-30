/* eslint-disable @typescript-eslint/no-require-imports */
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),ts=require('typescript');
function load(file,mocks={},globals={}){const exports={};vm.runInNewContext(ts.transpileModule(fs.readFileSync(path.join(__dirname,'../..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX}}).outputText,{exports,require:key=>mocks[key]??require(key),console,setTimeout(){},...globals});return exports;}
const base={customer_name:'Customer',phone:'0555555555',phone2:null,status:'pending',created_at:'2026-09-30',total_price:5000};
(async()=>{
 let calls=[],results=[],failDraft=true;
 const helper=load('lib/bulk-orders.ts',{}, {fetch:async(url,options={})=>{
  const body=options.body?JSON.parse(options.body):{};calls.push({url,...options,body});
  if(!options.method)return {ok:true,json:async()=>({success:true,order:{...base,id:'a',status:'confirmed'}})};
  if(url==='/api/ecotrack/create')return {ok:!failDraft,json:async()=>failDraft?{success:false,error:'فشل البوليصة'}:{success:true,tracking:'TRACK'}};
  if(url==='/api/ecotrack/ship')return {ok:true,json:async()=>({success:true,pending_sync:true,tracking:'TRACK'})};
  return {ok:true,json:async()=>({success:true,status:'confirmed'})};
 }});
 const pending={...base,id:'a'};
 assert(helper.canBulkOrder(pending,'confirm'));
 const draft={...pending,status:'confirmed',ecotrack_status:'draft',ecotrack_tracking:'TRACK'};
 assert(helper.canBulkOrder(draft,'ship'));
 for(const change of [{deleted_at:'now'},{status:'cancelled'},{ecotrack_status:'shipped'},{ecotrack_tracking:null}])assert(!helper.canBulkOrder({...draft,...change},'ship'));
 await helper.runOrderBatch([pending], 'confirm',r=>results.push(r),()=>false);
 assert.equal(results[0].success,false);assert.equal(results[0].patch.status,'confirmed');assert.match(results[0].message,/تم تأكيد/);
 assert.deepEqual(calls.filter(c=>c.method).map(c=>c.url),['/api/orders/a','/api/ecotrack/create']);
 failDraft=false;results=[];calls=[];
 await helper.runOrderBatch([pending], 'confirm',r=>results.push(r),()=>false);
 assert.equal(results[0].success,true);assert.equal(results[0].patch.ecotrack_status,'draft');
 results=[];calls=[];
 await helper.runOrderBatch([draft], 'ship',r=>results.push(r),()=>false);
 assert.equal(calls.length,1);assert.equal(results[0].patch.ecotrack_status,'shipped');assert.match(results[0].message,/مزامنة/);
 let stop=false;results=[];calls=[];
 await helper.runOrderBatch([pending,{...pending,id:'b'}],'confirm',r=>{results.push(r);stop=true;},()=>stop);
 assert.equal(results.length,1);assert.equal(calls.filter(c=>c.method).length,2,'finish current confirmation and draft before stopping');
 const netFail=load('lib/bulk-orders.ts',{}, {fetch:async()=>{throw Error('network')}});results=[];
 await netFail.runOrderBatch([draft],'ship',r=>results.push(r),()=>false);assert.equal(results[0].success,false);assert.match(results[0].message,/تحققي/);
 // Shared server loader traverses the entire dataset, never a truncated success.
 let cursor=null,pages=0;
 const db={from(){return {select(){return this;},order(){return this;},limit(){return this;},gt(k,v){cursor=v;return this;},then(resolve){pages++;resolve({data:cursor?[{...base,id:'last'}]:Array.from({length:500},(_,i)=>({...base,id:`p${i}`})),error:null});}}}};
 const loader=load('lib/admin-orders.ts');assert.equal((await loader.loadAdminOrders(db)).length,501);assert.equal(pages,2);
 // Render the actual desktop/mobile controls with deterministic React state.
 let slots=[],index=0,submitted=[];
 const hooks={useState(initial){const i=index++;if(!(i in slots))slots[i]=typeof initial==='function'?initial():initial;return [slots[i],value=>{slots[i]=typeof value==='function'?value(slots[i]):value;}];},useRef(value){const i=index++;if(!(i in slots))slots[i]={current:value};return slots[i];},useMemo(fn){return fn();},useEffect(){}};
 const component=load('components/admin/OrdersClient.tsx',{
  react:{...hooks,default:{Fragment:Symbol.for('react.fragment')}},
  '@/lib/utils':{cn:()=>''},'@/components/ui/Modal':{default:()=>null},
  '@/components/admin/OrderEditForm':{default:()=>null},'@/components/admin/OrderRestoreForm':{default:()=>null},'@/components/admin/OrderLabelsTab':{default:()=>null},
  '@/lib/bulk-orders':{...helper,runOrderBatch:async(batch,action,onResult)=>{submitted.push({batch,action});for(const o of batch)onResult({id:o.id,name:o.customer_name,success:o.id!=='p2',message:'result',patch:o.id==='p2'?{}:{status:'confirmed',ecotrack_status:'draft',ecotrack_tracking:'TRACK'}});}},
 }).default;
 const orders=[...Array.from({length:21},(_,i)=>({...base,id:`p${i}`})),{...draft,id:'ready'}, {...draft,id:'not-ready',ecotrack_tracking:null},{...draft,id:'shipped',ecotrack_status:'shipped'}];
 const render=()=>{index=0;return component({initialOrders:orders,products:[]});};
 const walk=n=>!n||typeof n!=='object'?[]:Array.isArray(n)?n.flatMap(walk):[n,...walk(n.props?.children)];
 const button=text=>walk(render()).find(n=>n.type==='button'&&n.props.children===text);
 button('قيد الانتظار').props.onClick();
 let checks=walk(render()).filter(n=>n.type==='input'&&n.props.type==='checkbox');assert.equal(checks.length,41,'20 rows on each layout plus select-all');
 checks[0].props.onChange({target:{checked:true}});
 button('تأكيد الطلبات المحددة').props.onClick();assert.equal(submitted.length,0,'must wait for one explicit confirmation');
 await button('تأكيد').props.onClick();assert.equal(submitted[0].batch.length,21,'includes second page');assert.equal(submitted[0].action,'confirm');
 checks=walk(render()).filter(n=>n.type==='input'&&n.props.type==='checkbox');assert(checks.every(n=>n.props.checked),'failed pending order stays selected');
 button('إعادة محاولة الطلبات التي لم تكتمل فقط').props.onClick();await button('تأكيد').props.onClick();assert.equal(submitted[1].batch.length,1);assert.equal(submitted[1].batch[0].id,'p2');
 button('مؤكدة').props.onClick();checks=walk(render()).filter(n=>n.type==='input'&&n.props.type==='checkbox');assert(checks.every(n=>!n.props.checked),'changing tabs clears prior selection');
 assert(!walk(render()).some(n=>n.type==='input'&&n.props.checked&&n.props['aria-label']==='تحديد طلب Customer'));
 checks[0].props.onChange({target:{checked:true}});button('إرسال المحددة للشحن').props.onClick();await button('تأكيد').props.onClick();
 assert.equal(submitted[2].action,'ship');assert(!submitted[2].batch.some(o=>o.id==='not-ready'||o.id==='shipped'||o.id==='p2'));
 console.log('PASS: bulk confirmation/drafts, partial failures/retry, sequential shipping, stop between orders, server pagination, cross-page/mobile selection and confirmation dialog');
})().catch(error=>{console.error(error);process.exitCode=1});
