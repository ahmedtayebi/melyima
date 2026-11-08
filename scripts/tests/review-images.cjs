/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),ts=require('typescript');
const {NextResponse}=require('next/server');
(async()=>{
  const {isReviewImageSource,mirrorReviewImages,MAX_REVIEW_IMAGE_BYTES}=await import('../../lib/review-image-mirror.mjs');
  const origin='https://test.supabase.co';
  const source=origin+'/storage/v1/object/public/review-images/1728000000000-review.jpg';
  const primary='https://res.cloudinary.com/test/image/upload/review.jpg';
  const jpeg=new Uint8Array([255,216,255,224,0,16]);
  assert(isReviewImageSource(source,origin));
  for(const url of [source+'?token=x',source.replace('test.supabase.co','attacker.test'),source.replace('review-images','private-files'),source.replace('.jpg','.svg'),source.replace('https:','http:'),source.replace('1728000000000-review.jpg','../private.jpg')]){
    assert(!isReviewImageSource(url,origin));
  }
  let downloads=0,uploads=0;
  const options={origin,fetcher:async(url,init)=>{
    downloads++;assert.equal(url,source);assert.equal(init.redirect,'error');assert(init.signal);return new Response(jpeg);
  },upload:async(bytes,mime,url)=>{uploads++;assert.deepEqual(bytes,jpeg);assert.equal(mime,'image/jpeg');assert.equal(url,source);return primary;}};
  assert.deepEqual(await mirrorReviewImages([source,source],options),[primary,primary]);
  assert.equal(downloads,1);assert.equal(uploads,1);
  assert.deepEqual(await mirrorReviewImages([],options),[]);
  await assert.rejects(()=>mirrorReviewImages([source,source,source,source],options));
  for(const response of [()=>new Response('denied',{status:403}),()=>new Response('<html>not an image</html>'),
    ()=>new Response(jpeg,{headers:{'content-length':String(MAX_REVIEW_IMAGE_BYTES+1)}}),
    ()=>new Response(new Uint8Array(MAX_REVIEW_IMAGE_BYTES+1))]){
    await assert.rejects(()=>mirrorReviewImages([source],{...options,fetcher:async()=>response()}));
  }
  assert.equal(uploads,1,'invalid or oversized backups must not be uploaded');
  await assert.rejects(()=>mirrorReviewImages([source],{...options,upload:async()=>{throw Error('Cloudinary unavailable')}}));

  let mirrorFails=false,dbFails=false,copies=0;const inserts=[];
  const exports={};
  const mocks={
    'next/server':{NextResponse},
    '@/lib/review-image-mirror.mjs':{
      isReviewImageSource:url=>isReviewImageSource(url,origin),
      mirrorReviewImages:async urls=>{copies++;if(mirrorFails)throw Error('secret error');return urls.map(()=>primary);},
    },
    '@supabase/supabase-js':{createClient:()=>({from:table=>({insert:async data=>{
      assert.equal(table,'reviews');inserts.push(data);return {error:dbFails?{message:'secret'}:null};
    }})})},
  };
  vm.runInNewContext(ts.transpileModule(fs.readFileSync('app/api/reviews/route.ts','utf8'),{
    compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020},
  }).outputText,{exports,require:key=>mocks[key]??require(key),process:{env:{NEXT_PUBLIC_SUPABASE_URL:origin}}});
  const body={customer_name:'Customer',rating:5,comment:'A useful review',images:[source]};
  const send=data=>exports.POST({json:async()=>data});
  let res=await send(body);assert.equal(res.status,200);assert.equal(inserts[0].images[0],primary);assert.equal(inserts[0].status,'pending');
  for(const patch of [{rating:1.5},{rating:'5'},{customer_name:{}},{images:'wrong'},{images:[source,source,source,source]},{images:['https://attacker.test/a.jpg']},{images:[null]}]){
    assert.equal((await send({...body,...patch})).status,400);
  }
  assert.equal(copies,1,'invalid requests must fail before any downloads or uploads');
  mirrorFails=true;res=await send(body);assert.equal(res.status,502);assert.equal(inserts.length,1);assert(!(await res.text()).includes('secret'));
  mirrorFails=false;res=await send(body);assert.equal(res.status,200);assert.equal(inserts.length,2);
  dbFails=true;res=await send(body);assert.equal(res.status,500);assert(!(await res.text()).includes('secret'));
  console.log('PASS: review backup URL restrictions, byte/size checks, duplicate copies, Cloudinary primary persistence, failures before insert and retries');
})().catch(error=>{console.error(error);process.exitCode=1});
