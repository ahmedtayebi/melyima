import assert from 'node:assert/strict'
import { collectMirrorReferences, replaceMirrorReference } from '../image-mirror-references.mjs'
import { mirrorImages, validateJournal } from '../mirror-supabase-images-to-cloudinary.mjs'
import { cloudinaryBackupPublicId, productImageBackupUrl } from '../../lib/product-image-sources.mjs'

const origin='https://test.supabase.co', cloud='test-cloud'
const source=origin+'/storage/v1/object/public/review-images/1728000000000-review.jpg'
const primary=`https://res.cloudinary.com/${cloud}/image/upload/f_auto,q_auto:good,c_limit,w_1600/${cloudinaryBackupPublicId(source,origin)}.jpg`
const jpeg=Buffer.from([255,216,255,224,0,16])
let images=[source,source,'https://res.cloudinary.com/old/image/upload/keep.jpg'], race=false, uploads=0, writes=0, saved
const literal=value=>`{${value.map(x=>JSON.stringify(x)).join(',')}}`
const db={from(table){let patch,filters={};return {
  select(){return this},not(){return this},order(){return this},limit(){return this},gt(){return this},
  eq(key,value){filters[key]=value;return this},update(value){patch=value;return this},
  maybeSingle(){return Promise.resolve({data:images?{images:[...images]}:null,error:null})},
  then(resolve){
    if(table!=='reviews'){resolve({data:[],error:null});return}
    if(patch){
      if(race)images[2]='concurrent change'
      if(!images||filters.images!==literal(images)){resolve({data:[],error:null});return}
      assert.equal(filters.id,'review');images=[...patch.images];writes++;resolve({data:[{id:'review'}],error:null});return
    }
    resolve({data:images?[{id:'review',images:[...images]}]:[],error:null})
  },
}}}
const rows=await collectMirrorReferences(db)
assert.equal(rows.length,3);assert.equal(rows[1].index,1)
const options={db,origin,cloud,log(){},persist:async journal=>{saved=structuredClone(journal)},
  download:async()=>jpeg,upload:async()=>{uploads++;return primary}}
const dry=await mirrorImages(options)
assert.equal(dry.references,2);assert.equal(dry.images,1);assert.equal(uploads,0);assert.equal(writes,0)
await mirrorImages({...options,mode:'apply'})
assert.equal(uploads,1);assert.equal(writes,2);assert.deepEqual(images.slice(0,2),[primary,primary])
assert.equal(productImageBackupUrl(primary,origin),source)
validateJournal(saved,origin,cloud)
await mirrorImages({...options,mode:'apply',journal:saved})
assert.equal(uploads,1);assert.equal(writes,2,'retries do not rewrite completed references')
await mirrorImages({...options,mode:'rollback',journal:saved})
assert.deepEqual(images.slice(0,2),[source,source])
assert.equal(images[2],'https://res.cloudinary.com/old/image/upload/keep.jpg')
race=true
await assert.rejects(()=>replaceMirrorReference(db,rows[0],source,primary),/changed/)
assert.equal(images[0],source);assert.equal(images[2],'concurrent change')
race=false;images[0]='replaced image'
await assert.rejects(()=>replaceMirrorReference(db,rows[0],source,primary),/changed or moved/)
images=null
await assert.rejects(()=>replaceMirrorReference(db,rows[0],source,primary),/deleted/)
const invalid=structuredClone(saved);invalid.rows[0].index=-1
assert.throws(()=>validateJournal(invalid,origin,cloud),/reference/)
console.log('PASS: review inventory, duplicate array references, verified mirror, resume, rollback, deleted/reordered rows and compare-and-swap against concurrent edits')
