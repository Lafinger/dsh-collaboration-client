import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AttachmentAuthorization} from '../src/attachments.mjs';
const gif=Buffer.from('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==','base64');
const human=(block)=>({id:'gif-test',role:'user',source:{kind:'user'},content:[{type:'text',text:'传输这份图片'},block]});
const ref=(data,name,mediaType)=>({attachmentId:'sha256:'+createHash('sha256').update(data).digest('hex'),bytes:data.length,name,...mediaType?{mediaType}:{}});
test('GIF name, declared media type and disguised GIF bytes fail before any upload authority is published',async()=>{
 for(const [name,mediaType,data,type]of [['picture.gif','image/png',Buffer.from('not gif'),'image'],['picture.png','image/gif',gif,'image'],['renamed.png','image/png',gif,'image'],['renamed.txt',undefined,gif,'file']]){
  let reads=0;const store=new AttachmentAuthorization({attachmentStore:{imageHostPath:()=>undefined,fileHostPath:()=>undefined,readImage:async()=>{reads++;return {data};},async*readFileStream(){reads++;yield data;}}});
  await assert.rejects(store.capture({localId:'local',message:human({type,attachment:ref(data,name,mediaType)}),admission:{projectId:'a'.repeat(32)}}),/GIF.*not allowed/);
  assert.equal(store.pending.size,0);assert.equal(store.active.size,0);if(name.endsWith('.gif')||mediaType==='image/gif')assert.equal(reads,0);
 }
});
test('workspace GIF bytes renamed as another file are rejected without pending authority',async()=>{
 const root=mkdtempSync(join(tmpdir(),'gif-policy-'));writeFileSync(join(root,'renamed.txt'),gif);const store=new AttachmentAuthorization({workspaceOf:()=>root});const message=human({type:'text',text:'@renamed.txt'});
 await assert.rejects(store.capture({localId:'local',message,admission:{projectId:'a'.repeat(32)}}),/GIF.*not allowed/);assert.equal(store.pending.size,0);
});
