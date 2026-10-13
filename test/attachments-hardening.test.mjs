import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AttachmentAuthorization } from '../src/attachments.mjs';
import { validateAttachmentManifest, MAX_ATTACHMENT_BYTES, requireAttachmentCapability } from '../src/attachment-protocol.mjs';
const projectId='a'.repeat(32),text='附件操作: 上传并归档\nproject_id: '+projectId;
const human=content=>({id:'selected',role:'user',source:{kind:'user'},content});
test('normalized native image bytes preserved with honest source kind; cancellation revokes read; exact capability only',async()=>{
 const data=Buffer.from('sample-image-fixture-not-decoded-client-side'),ref={attachmentId:'sha256:'+createHash('sha256').update(data).digest('hex'),name:'image.png',mediaType:'image/png',bytes:data.length,width:1,height:1};
 const authority=new AttachmentAuthorization({attachmentStore:{imageHostPath:()=>undefined,readImage:async()=>({data,ref})}});
 const entry=await authority.capture({localId:'l',message:human([{type:'text',text},{type:'image',attachment:ref}])});assert.equal(entry.items[0].manifest.sourceKind,'normalized-image');
 const controller=new AbortController(),release=authority.bind('remote','r',entry,controller.signal),handle=entry.items[0].manifest.handle;controller.abort();assert.throws(()=>authority.read({sessionId:'remote',requestId:'r',handle,offset:0,maxBytes:5}));release();
 for(const value of [undefined,{}, {version:0},{version:2},{version:'1'}])assert.throws(()=>requireAttachmentCapability(value));
 assert.doesNotThrow(()=>requireAttachmentCapability({version:1}));
 const manifest=entry.items[0].manifest;assert.throws(()=>validateAttachmentManifest([{...manifest,bytes:MAX_ATTACHMENT_BYTES+1}]));assert.throws(()=>validateAttachmentManifest([manifest,manifest]));
});
test('natural-language negation does not create upload authority without explicit operation and unique project',async()=>{
 const data=Buffer.from('sample'),attachment={attachmentId:'sha256:'+createHash('sha256').update(data).digest('hex'),name:'x.txt',bytes:data.length};let reads=0;
 const authority=new AttachmentAuthorization({attachmentStore:{fileHostPath:()=>{reads++;return undefined;},async*readFileStream(){yield data;}}});
 for(const text of ['不要上传或归档 project_id: '+projectId,'先阅读不要传输 project_id: '+projectId,'附件操作: 仅传输\n附件操作: 上传并归档\nproject_id: '+projectId,'附件操作: 上传并归档\nproject_id: '+projectId+'\nproject_id: '+'b'.repeat(32)])await assert.rejects(authority.capture({localId:'l',message:human([{type:'text',text},{type:'file',attachment}])}));
 assert.equal(reads,0);
});
