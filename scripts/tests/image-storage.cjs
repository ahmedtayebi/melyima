/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ts = require('typescript'), { NextResponse } = require('next/server');
const { File } = require('node:buffer');
(async () => {
  const storage = await import('../../lib/product-image-storage.mjs');
  const migration = await import('../migrate-cloudinary-images-to-supabase.mjs');
  const jpeg = new Uint8Array([255,216,255,224,0,16]);
  assert.equal(storage.imageFormat(jpeg).mime, 'image/jpeg');
  assert.equal(storage.imageFormat(Buffer.from('<svg onload="alert(1)">')), null);
  assert.equal(storage.imageFormat(new Uint8Array()), null);
  assert.equal(storage.imageFormat(Buffer.from('RIFFxxxxWEBP')).mime, 'image/webp');
  assert.equal(storage.imageFormat(new Uint8Array([137,80,78,71,13,10,26,10])).extension, 'png');
  assert.equal(storage.imageFormat(Buffer.from('GIF89a')).extension, 'gif');
  // HTTP error images are never accepted as product photos.
  await assert.rejects(() => migration.downloadImage('https://example.test', async () => new Response('GIF89a', {status:401})), /401/);
  await assert.rejects(() => migration.downloadImage('https://example.test', async () => new Response('<html>error</html>')), /raster/);
  await assert.rejects(() => migration.downloadImage('https://example.test', async () => new Response(jpeg, {headers:{'content-length':String(storage.MAX_PRODUCT_IMAGE_BYTES+1)}})), /4 MiB/);
  await assert.rejects(() => migration.downloadImage('https://example.test', async () => new Response(new Uint8Array(storage.MAX_PRODUCT_IMAGE_BYTES+1))), /4 MiB/);
  const downloaded = await migration.downloadImage('https://example.test', async (_, options) => {
    assert.equal(options.redirect,'error'); assert.equal(options.headers,undefined); return new Response(jpeg);
  });
  assert.equal(migration.digest(downloaded), migration.digest(jpeg));
  assert(!migration.isCloudinary('https://res.cloudinary.com.attacker.test/a'));

  let creations=0, bucketError={statusCode:'404'}, bucket=null;
  const buckets={storage:{getBucket:async()=>({data:bucket,error:bucketError}),createBucket:async(name,options)=>{
    creations++;assert.equal(name,'catalog-images');assert(options.public);assert.equal(options.fileSizeLimit,storage.MAX_PRODUCT_IMAGE_BYTES);return {error:null};
  }}};
  await storage.ensureProductImageBucket(buckets);assert.equal(creations,1);
  bucketError={statusCode:'403'};await assert.rejects(()=>storage.ensureProductImageBucket(buckets));assert.equal(creations,1);
  bucketError=null;bucket={public:false};await assert.rejects(()=>storage.ensureProductImageBucket(buckets));
  bucket={public:true};await storage.ensureProductImageBucket(buckets);assert.equal(creations,1);

  let authorized=true, uploads=0, uploadError=null, ensureCalls=0;
  const db={storage:{from(name){assert.equal(name,'catalog-images');return {
    upload:async(path,bytes,options)=>{uploads++;assert.match(path,/^products\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\.jpg$/);assert.equal(options.contentType,'image/jpeg');assert.equal(options.upsert,false);assert.equal(options.cacheControl,'31536000');assert.equal(bytes.length,jpeg.length);return {error:uploadError}},
    getPublicUrl:path=>({data:{publicUrl:`https://test.supabase.co/storage/v1/object/public/catalog-images/${path}`}}),
  }}}};
  const mocks={
    '@/app/api/ecotrack/_auth':{requireAdmin:async()=>authorized?{}:NextResponse.json({}, {status:401})},
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/product-image-storage.mjs':{...storage,ensureProductImageBucket:async()=>{ensureCalls++}},
  };
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/admin/images/upload/route.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText,{exports,require:key=>mocks[key]??require(key),File,Uint8Array,console});
  const id='11111111-1111-4111-8111-111111111111';
  const req=(file=new File([jpeg],'fake.svg',{type:'image/svg+xml'}),product=id)=>({formData:async()=>new Map([['file',file],['product_id',product],['color_id',id]])});
  let res=await exports.POST(req());assert.equal(res.status,200);assert.match((await res.json()).url,/catalog-images/);
  authorized=false;assert.equal((await exports.POST({formData(){throw Error('must authenticate first')}})).status,401);authorized=true;
  assert.equal((await exports.POST(req(undefined,'invalid'))).status,400);
  assert.equal((await exports.POST(req(new File(['<svg>'],'fake.jpg',{type:'image/jpeg'})))).status,400);
  assert.equal((await exports.POST(req(new File([],'empty.jpg')))).status,413);
  assert.equal((await exports.POST(req(new File([new Uint8Array(storage.MAX_PRODUCT_IMAGE_BYTES+1)],'large.jpg')))).status,413);
  assert.equal(uploads,1);assert.equal(ensureCalls,1);
  uploadError={message:'secret database information'};res=await exports.POST(req());assert.equal(res.status,500);assert(!(await res.text()).includes('secret'));

  const oldUrl='https://res.cloudinary.com/cloud/image/upload/a.jpg';
  const row={table:'product_color_images',field:'image_url',id,oldUrl};
  let current=oldUrl, filters={}, mutateError=false;
  const casDb={from(){return {
    update(data){this.patch=data;return this},eq(k,v){filters[k]=v;return this},select(){return this},
    then(resolve){assert.equal(filters.id,id);const matches=current===filters.image_url;if(matches&&!mutateError)current=this.patch.image_url;resolve({data:matches?[{id}]:[],error:mutateError?{}:null})},
    maybeSingle:async()=>({data:{image_url:current},error:null}),
  }}};
  assert.equal(await migration.replaceReference(casDb,row,oldUrl,'new'),'updated');
  assert.equal(await migration.replaceReference(casDb,row,oldUrl,'new'),'already_updated');
  current='concurrent-edit';await assert.rejects(()=>migration.replaceReference(casDb,row,oldUrl,'new'),/changed/);assert.equal(current,'concurrent-edit');
  current='new';assert.equal(await migration.replaceReference(casDb,row,'new',oldUrl),'updated');
  mutateError=true;await assert.rejects(()=>migration.replaceReference(casDb,row,oldUrl,'new'),/update failed/);
  await assert.rejects(()=>migration.replaceReference(casDb,{...row,table:'orders'},oldUrl,'new'),/column/);
  const plan={version:1,origin:'https://test.supabase.co',rows:[row],assets:{[oldUrl]:{hash:migration.digest(jpeg),extension:'jpg'}}};
  migration.validatePlan(plan,plan.origin);
  assert.throws(()=>migration.validatePlan(plan,'https://other.supabase.co'),/project/);
  assert.throws(()=>migration.validatePlan({...plan,assets:{[oldUrl]:{hash:'../../bad',extension:'jpg'}}},plan.origin),/asset/);
  let calls=0;
  const listDb={from(){return {select(){return this},not(){return this},order(){return this},limit(){return this},gt(){this.cursor=true;return this},then(resolve){calls++;resolve({data:this.cursor?[]:Array.from({length:500},(_,i)=>({id:String(i),image_url:oldUrl,color_image_url:oldUrl})),error:null})}}}};
  assert.equal((await migration.collectReferences(listDb)).length,1500);assert.equal(calls,6);
  console.log('PASS: image uploads auth/size/content/error handling, Storage bucket safety, migration error-image rejection, pagination, project guard, concurrent edits and rollback');
})().catch(error=>{console.error(error);process.exitCode=1});
