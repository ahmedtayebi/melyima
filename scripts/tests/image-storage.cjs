/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const ts = require('typescript'), { NextResponse } = require('next/server');
const { File } = require('node:buffer');
const testEnv = {NEXT_PUBLIC_SUPABASE_URL:'https://test.supabase.co',CLOUDINARY_CLOUD_NAME:'test-cloud',CLOUDINARY_API_KEY:'test-key',CLOUDINARY_API_SECRET:'test-secret'};
function load(file, mocks={}, globals={}) {
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync(file,'utf8'), {
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,jsx:ts.JsxEmit.ReactJSX},
  }).outputText,{exports,require:key=>mocks[key]??require(key),console,URL,Uint8Array,File,Blob,FormData,AbortSignal,process:{env:testEnv},...globals});
  return exports;
}
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

  const sources=load('lib/product-image-sources.mjs');
  const uuid='11111111-1111-4111-8111-111111111111';
  const backup=`https://test.supabase.co/storage/v1/object/public/catalog-images/products/${uuid}/${uuid}/${uuid}.jpg`;
  const primary=url=>`https://res.cloudinary.com/test-cloud/image/upload/v123/${sources.cloudinaryBackupPublicId(url)}.jpg`;
  for(const extension of ['jpg','png','webp','gif']) {
    const original=backup.replace(/jpg$/,extension);
    assert.equal(sources.productImageBackupUrl(primary(original)),original);
    assert.equal(sources.productImageBackupUrl(primary(original).replace('/upload/','/upload/f_auto,q_auto:good,c_limit,w_1600/').replace(/jpg$/,'avif')),original);
  }
  for(const source of [backup,'/logo.png','blob:preview','https://res.cloudinary.com/cloud/image/upload/legacy.jpg',primary(backup).replace('https:','http:'),primary(backup).replace('res.cloudinary.com/','res.cloudinary.com.attacker.test/'),primary(backup).replace('/test.supabase.co/','/other.supabase.co/')]) assert.equal(sources.productImageBackupUrl(source),null);
  assert.throws(()=>sources.cloudinaryBackupPublicId(backup.replace('test.supabase.co','other.supabase.co')));
  assert.throws(()=>sources.cloudinaryBackupPublicId(backup+'?token=private'));

  let cloudRequests=[],cloudResponse=()=>Response.json({public_id:sources.cloudinaryBackupPublicId(backup),secure_url:primary(backup)});
  const cloud=load('lib/cloudinary-product-upload.mjs',{'./product-image-sources.mjs':sources},{fetch:async(url,options)=>{
    cloudRequests.push({url,options});return cloudResponse();
  }});
  const mirrored=await cloud.uploadCloudinaryProductImage(jpeg,'image/jpeg',backup);
  assert.equal(sources.productImageBackupUrl(mirrored),backup);assert.match(mirrored,/f_auto,q_auto:good,c_limit,w_1600/);
  const request=cloudRequests[0];assert.equal(request.url,'https://api.cloudinary.com/v1_1/test-cloud/image/upload');assert.equal(request.options.redirect,'error');assert(request.options.signal);
  const signed=request.options.body;
  assert.equal(signed.get('overwrite'),'false');assert.equal(signed.get('public_id'),sources.cloudinaryBackupPublicId(backup));assert.equal(signed.get('api_key'),'test-key');assert.equal(signed.get('api_secret'),null);
  assert.equal(signed.get('file').type,'image/jpeg');assert.equal(signed.get('file').size,jpeg.length);
  const expectedSignature=require('node:crypto').createHash('sha1').update(`overwrite=false&public_id=${signed.get('public_id')}&timestamp=${signed.get('timestamp')}test-secret`).digest('hex');
  assert.equal(signed.get('signature'),expectedSignature);
  for(const response of [()=>new Response('disabled',{status:401}),()=>new Response('rate limited',{status:429}),()=>new Response('broken json'),()=>Response.json({public_id:'wrong',secure_url:primary(backup)}),()=>Response.json({public_id:sources.cloudinaryBackupPublicId(backup),secure_url:primary(backup).replace('res.cloudinary.com','attacker.test')}),()=>{throw new Error('timeout')}]) {
    cloudResponse=response;await assert.rejects(()=>cloud.uploadCloudinaryProductImage(jpeg,'image/jpeg',backup));
  }
  const missingConfig=load('lib/cloudinary-product-upload.mjs',{'./product-image-sources.mjs':sources},{process:{env:{}},fetch:()=>{throw Error('must not fetch')}});
  await assert.rejects(()=>missingConfig.uploadCloudinaryProductImage(jpeg,'image/jpeg',backup),/configuration/);

  let creations=0, bucketError={statusCode:'404'}, bucket=null;
  const buckets={storage:{getBucket:async()=>({data:bucket,error:bucketError}),createBucket:async(name,options)=>{
    creations++;assert.equal(name,'catalog-images');assert(options.public);assert.equal(options.fileSizeLimit,storage.MAX_PRODUCT_IMAGE_BYTES);return {error:null};
  }}};
  await storage.ensureProductImageBucket(buckets);assert.equal(creations,1);
  bucketError={statusCode:'403'};await assert.rejects(()=>storage.ensureProductImageBucket(buckets));assert.equal(creations,1);
  bucketError=null;bucket={public:false};await assert.rejects(()=>storage.ensureProductImageBucket(buckets));
  bucket={public:true};await storage.ensureProductImageBucket(buckets);assert.equal(creations,1);

  let authorized=true, uploads=0, uploadError=null, ensureCalls=0, mirrorCalls=0, mirrorFails=false;
  const db={storage:{from(name){assert.equal(name,'catalog-images');return {
    upload:async(path,bytes,options)=>{uploads++;assert.match(path,/^products\/[a-f0-9-]+\/[a-f0-9-]+\/[a-f0-9-]+\.jpg$/);assert.equal(options.contentType,'image/jpeg');assert.equal(options.upsert,false);assert.equal(options.cacheControl,'31536000');assert.equal(bytes.length,jpeg.length);return {error:uploadError}},
    getPublicUrl:path=>({data:{publicUrl:`https://test.supabase.co/storage/v1/object/public/catalog-images/${path}`}}),
  }}}};
  const mocks={
    '@/app/api/ecotrack/_auth':{requireAdmin:async()=>authorized?{}:NextResponse.json({}, {status:401})},
    '@/lib/supabase/admin':{createAdminClient:()=>db},
    '@/lib/product-image-storage.mjs':{...storage,ensureProductImageBucket:async()=>{ensureCalls++}},
    '@/lib/cloudinary-product-upload.mjs':{uploadCloudinaryProductImage:async(bytes,mime,url)=>{
      mirrorCalls++;assert.equal(uploads,mirrorCalls);assert.equal(uploadError,null,'backup must be saved first');assert.equal(mime,'image/jpeg');assert.equal(bytes.length,jpeg.length);
      if(mirrorFails)throw Error('secret remote error');return primary(url);
    }},
  };
  const exports={};
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/admin/images/upload/route.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText,{exports,require:key=>mocks[key]??require(key),File,Uint8Array,console});
  const id='11111111-1111-4111-8111-111111111111';
  const req=(file=new File([jpeg],'fake.svg',{type:'image/svg+xml'}),product=id)=>({formData:async()=>new Map([['file',file],['product_id',product],['color_id',id]])});
  let res=await exports.POST(req());assert.equal(res.status,200);
  let result=await res.json();assert.equal(result.mirrored,true);assert.match(result.url,/res.cloudinary.com/);assert.equal(sources.productImageBackupUrl(result.url),result.backup_url);
  authorized=false;assert.equal((await exports.POST({formData(){throw Error('must authenticate first')}})).status,401);authorized=true;
  assert.equal((await exports.POST(req(undefined,'invalid'))).status,400);
  assert.equal((await exports.POST(req(new File(['<svg>'],'fake.jpg',{type:'image/jpeg'})))).status,400);
  assert.equal((await exports.POST(req(new File([],'empty.jpg')))).status,413);
  assert.equal((await exports.POST(req(new File([new Uint8Array(storage.MAX_PRODUCT_IMAGE_BYTES+1)],'large.jpg')))).status,413);
  assert.equal(uploads,1);assert.equal(ensureCalls,1);
  mirrorFails=true;res=await exports.POST(req());assert.equal(res.status,200);result=await res.json();assert.equal(result.mirrored,false);assert.equal(result.url,result.backup_url);assert.match(result.url,/test.supabase.co/);assert(result.warning);assert(!JSON.stringify(result).includes('secret'));assert.equal(mirrorCalls,2);
  uploadError={message:'secret database information'};res=await exports.POST(req());assert.equal(res.status,500);assert(!(await res.text()).includes('secret'));
  assert.equal(mirrorCalls,2,'a failed backup must never upload only to Cloudinary');

  // Run both actual React image variants through their failure handlers.
  let slots=[],slot=0;
  const hooks={useState(initial){const i=slot++;if(!(i in slots))slots[i]=initial;return [slots[i],value=>{slots[i]=value}];}};
  const ui=load('components/ui/ProductImage.tsx',{react:hooks,'next/image':{default:function NextImage(){}},'@/lib/product-image-sources.mjs':sources});
  for(const ImageComponent of [ui.ProductImg,ui.default]) {
    slots=[];slot=0;
    let source=primary(backup),previousKey;
    const render=()=>{
      const wrapper=ImageComponent({src:source,alt:'Dress',className:'image',width:100,height:100});
      if(wrapper.key!==previousKey){slots=[];previousKey=wrapper.key;}
      slot=0;return wrapper.type(wrapper.props);
    };
    let element=render();assert.equal(element.props.src,source);assert.equal(element.props.alt,'Dress');
    element.props.onLoad({currentTarget:{naturalWidth:1600,naturalHeight:1200}});assert.equal(render().props.src,source);
    element.props.onError();element=render();assert.equal(element.props.src,backup);
    element.props.onError();assert.equal(render().props.src,backup,'backup failure must not loop back to Cloudinary');
    source=primary(backup.replace(`${uuid}.jpg`,'22222222-2222-4222-8222-222222222222.jpg'));
    element=render();assert.equal(element.props.src,source,'changing the product image resets the fallback');
    element.props.onLoad({currentTarget:{naturalWidth:1,naturalHeight:1}});
    assert.equal(render().props.src,sources.productImageBackupUrl(source),'error GIF must trigger fallback too');
    source=primary(backup.replace(`${uuid}.jpg`,'33333333-3333-4333-8333-333333333333.jpg'));
    element=render();element.props.ref({complete:false,naturalWidth:0,naturalHeight:0});assert.equal(render().props.src,source);
    element.props.ref({complete:true,naturalWidth:0,naturalHeight:0});
    assert.equal(render().props.src,sources.productImageBackupUrl(source),'failure before hydration must trigger fallback');
    source='blob:local-preview';element=render();element.props.onError();assert.equal(render().props.src,source);
    source='https://res.cloudinary.com/test-cloud/image/upload/legacy.jpg';element=render();element.props.onError();assert.equal(render().props.src,source,'never invent backups for old images');
  }

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
  console.log('PASS: backup-first dual upload, signed Cloudinary requests, graceful CDN upload failure, fallback on image error/error GIF without loops, source changes, old images, Storage and migration safeguards');
})().catch(error=>{console.error(error);process.exitCode=1});
