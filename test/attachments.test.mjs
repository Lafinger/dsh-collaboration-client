import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync,writeFileSync,mkdirSync,symlinkSync } from 'node:fs';
import {tmpdir}from'node:os';import{join}from'node:path';import{createHash}from'node:crypto';
import {AttachmentAuthorization,explicitPaths}from'../src/attachments.mjs';
import {validateAttachmentManifest,ATTACHMENT_CHUNK_BYTES}from'../src/attachment-protocol.mjs';
const projectId='a'.repeat(32),human=(text,id='human')=>({id,role:'user',source:{kind:'user'},content:[{type:'text',text:'附件操作: 上传并归档\n'+text}]});
test('one explicit current-human workspace path yields scoped opaque handle; cleanup revokes it',async()=>{
 const root=mkdtempSync(join(tmpdir(),'collab-file-authority-'));writeFileSync(join(root,'demo.txt'),'hello');
 const store=new AttachmentAuthorization({workspaceOf:()=>root});const entry=await store.capture({localId:'local',message:human(`上传并归档 @demo.txt project_id: ${projectId}`)});
 assert.equal(entry.items.length,1);assert.equal(entry.items[0].manifest.name,'demo.txt');assert.ok(!JSON.stringify(entry.items[0].manifest).includes(root));
 assert.equal(store.take('local','human'),entry);const release=store.bind('remote','request',entry),handle=entry.items[0].manifest.handle;
 assert.equal(Buffer.from(store.read({sessionId:'remote',requestId:'request',handle,offset:0,maxBytes:5}).data,'base64').toString(),'hello');
 for(const params of [{sessionId:'other',requestId:'request'},{sessionId:'remote',requestId:'other'},{sessionId:'remote',requestId:'request',offset:-1},{sessionId:'remote',requestId:'request',maxBytes:ATTACHMENT_CHUNK_BYTES+1}])assert.throws(()=>store.read({sessionId:'remote',requestId:'request',handle,offset:0,maxBytes:5,...params}));
 release();assert.throws(()=>store.read({sessionId:'remote',requestId:'request',handle,offset:0,maxBytes:5}));
});
test('path selection rejects ambiguous project, no upload instruction, directory, traversal, private-state and symlink escape',async()=>{
 const root=mkdtempSync(join(tmpdir(),'collab-selection-'));writeFileSync(join(root,'demo.txt'),'hello');mkdirSync(join(root,'.dsh'));writeFileSync(join(root,'.dsh','credentials.txt'),'fake-test-only');
 const store=new AttachmentAuthorization({workspaceOf:()=>root});
 for(const text of [`上传 @demo.txt`,`附件操作: 仅传输\n@demo.txt project_id: ${projectId}`,`上传 @.dsh/credentials.txt project_id: ${projectId}`,`上传 @.dsh/ project_id: ${projectId}`,`上传 @../demo.txt project_id: ${projectId}`])await assert.rejects(store.capture({localId:'l',message:human(text)}));
 await assert.rejects(store.capture({localId:'l',message:{...human('上传 @demo.txt project_id: '+projectId),source:{kind:'plugin'}}}));
 assert.deepEqual(explicitPaths('上传 @"path with spaces.txt" @测试.docx'),['path with spaces.txt','测试.docx']);
 if(process.platform!=='win32'){symlinkSync(join(root,'demo.txt'),join(root,'link.txt'));await assert.rejects(store.capture({localId:'l',message:human('上传 @link.txt project_id: '+projectId)}));}
});
test('native attachment verifies bytes from actual host reference, not textual file placeholders',async()=>{
 const data=Buffer.from('native'),attachmentId='sha256:'+createHash('sha256').update(data).digest('hex');
 const store=new AttachmentAuthorization({attachmentStore:{fileHostPath:()=>undefined,async*readFileStream(){yield data;}}});
 const message=human('上传并归档 project_id: '+projectId);message.content.push({type:'file',attachment:{attachmentId,name:'native.md',bytes:data.length}});
 const entry=await store.capture({localId:'l',message});assert.equal(entry.items[0].manifest.sourceKind,'file-attachment');
 message.content[1].attachment.attachmentId='sha256:'+'0'.repeat(64);await assert.rejects(store.capture({localId:'l',message}));
 assert.equal(await store.capture({localId:'l',message:human('[File "native.md": verbatim read-only copy saved at "/tmp/private"]')}),undefined);
 assert.throws(()=>validateAttachmentManifest([{...entry.items[0].manifest,server_path:'/etc/passwd'}]));
});
