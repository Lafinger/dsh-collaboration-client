import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AttachmentAuthorization } from '../src/attachments.mjs';
import { validateAttachmentManifest, MAX_ATTACHMENT_BYTES, requireAttachmentCapability } from '../src/attachment-protocol.mjs';
const projectId='a'.repeat(32),text='上传并归档这份文件';
const human=content=>({id:'selected',role:'user',source:{kind:'user'},content});
test('normalized native image bytes preserved with honest source kind; cancellation revokes read; exact capability only',async()=>{
 const data=Buffer.from('sample-image-fixture-not-decoded-client-side'),ref={attachmentId:'sha256:'+createHash('sha256').update(data).digest('hex'),name:'image.png',mediaType:'image/png',bytes:data.length,width:1,height:1};
 const authority=new AttachmentAuthorization({attachmentStore:{imageHostPath:()=>undefined,readImage:async()=>({data,ref})}});
 const entry=await authority.capture({localId:'l',message:human([{type:'text',text},{type:'image',attachment:ref}]),admission:{projectId}});assert.equal(entry.items[0].manifest.sourceKind,'normalized-image');
 const controller=new AbortController(),release=authority.bind('remote','r',entry,controller.signal),handle=entry.items[0].manifest.handle;controller.abort();assert.throws(()=>authority.read({sessionId:'remote',requestId:'r',handle,offset:0,maxBytes:5}));release();
 for(const value of [undefined,{}, {version:0},{version:1},{version:'2'}])assert.throws(()=>requireAttachmentCapability(value));
 assert.doesNotThrow(()=>requireAttachmentCapability({version:2}));
 const manifest=entry.items[0].manifest;assert.throws(()=>validateAttachmentManifest([{...manifest,bytes:MAX_ATTACHMENT_BYTES+1}]));assert.throws(()=>validateAttachmentManifest([manifest,manifest]));
 assert.throws(()=>validateAttachmentManifest([{...manifest,archiveAuthorized:true}]),'Removed action field must be rejected as unexpected metadata');
});
test('capture fails closed without an admission project; text never substitutes for the bound project',async()=>{
 const data=Buffer.from('sample'),attachment={attachmentId:'sha256:'+createHash('sha256').update(data).digest('hex'),name:'x.txt',bytes:data.length};let reads=0;
 const authority=new AttachmentAuthorization({attachmentStore:{fileHostPath:()=>{reads++;return undefined;},async*readFileStream(){yield data;}}});
 for(const admission of [undefined,{}, {projectId:'not-a-project'}, {projectId:'b'.repeat(32)+' '}, {projectId:'b'.repeat(31)}])await assert.rejects(authority.capture({localId:'l',message:human([{type:'text',text},{type:'file',attachment}]),admission}));
 assert.equal(reads,0);
 const entry=await authority.capture({localId:'l',message:human([{type:'text',text},{type:'file',attachment}]),admission:{projectId:'b'.repeat(32)}});
 assert.equal(entry.items[0].manifest.projectId,'b'.repeat(32),'A valid admission scopes the manifest and reads the bytes');
});
