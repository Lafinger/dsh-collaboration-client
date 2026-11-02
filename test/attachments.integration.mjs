import test from 'node:test';import assert from'node:assert/strict';import{Context}from'@deepseek-ai/cordis';
import{LlmRuntime,createUserMessage,BlockAssembler}from'@deepseek-ai/dsh-llm';import{SessionStore}from'@deepseek-ai/dsh-session';import{createHash}from'node:crypto';import{resolve}from'node:path';
import{installLegacyConnection}from'./helpers/legacy-connection.mjs';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {createNaturalAttachmentHost} from './helpers/natural-language-attachment-host.mjs';
import*as plugin from'../src/member-plugin.mjs';import{FakeService}from'./helpers/fake-service.mjs';
test('official LLM waterfall captures real native file before placeholder projection and never forwards host path',async()=>{
 const ctx=new Context();const llm=ctx.plugin(LlmRuntime),sessions=ctx.plugin(SessionStore);await llm.await();await sessions.await();
 const bytes=Buffer.from('non-sensitive sample'),ref={attachmentId:'sha256:'+createHash('sha256').update(bytes).digest('hex'),name:'requirements.md',bytes:bytes.length};
 ctx.provide('attachments',{fileHostPath:()=>undefined,async*readFileStream(){yield bytes;}});
 installLegacyConnection(ctx);const fiber=ctx.plugin(plugin,{loginOrigin:'https://login.example.test',databasePath:':memory:',serviceId:'fixture-service',ssh:{account:'alice',host:'example.test',identityFile:resolve('fixture-key'),knownHostsFile:resolve('fixture-known-hosts')}});await fiber.await();
 const client=fiber.ctx.get('collaborationMemberClient'),service=new FakeService();
 client.requireLogin=false; // Legacy attachment fixture; secure login has independent tests.
 client.connect=async()=>{const peer=service.connect(),request=peer.request.bind(peer);peer.request=async(method,params)=>method==='initialize'?{...(await request(method,params)),agentCapabilities:{attachmentTransfer:{version:2},humanAuthorization:{version:3}}}:request(method,params);return peer;};
 try{
  client.selectProject('local-file','a'.repeat(32)); // Menu-selected project is the only admission source.
  const message=createUserMessage({content:[{type:'text',text:'上传并归档这份文件'},{type:'file',attachment:ref}],source:{kind:'user'}});
  const assembler=new BlockAssembler();for await(const chunk of ctx.llm.stream({provider:'collaboration-remote',model:'server-agent',sessionId:'local-file',messages:[message]}))assembler.push(chunk);
  assert.equal(assembler.finish.kind,'stop');assert.equal(service.prompts.length,1);assert.equal(service.prompts[0]._meta.attachments[0].sha256,ref.attachmentId.slice(7));
  assert.equal(service.prompts[0].prompt[0].text,'上传并归档这份文件');assert.ok(!JSON.stringify(service.prompts).includes('read-only copy'));assert.equal(client.attachments.pending.size,0);assert.equal(client.attachments.active.size,0);
 }finally{await ctx.fiber.dispose();}
});
test('empty and missing path attachments show their cause, then a saved file uploads through the real hook',async()=>{
 const host=await createNaturalAttachmentHost();
 try{
  writeFileSync(join(host.root,'empty.md'),'');
  for(const [text,reason] of [['@empty.md 上传该文档','附件文件为空'],['@missing.md 上传该文档','附件文件不存在']]){
   const {state}=await host.run(text,{selection:'path'});
   const finish=state.chunks.findLast(chunk=>chunk.type==='finish');
   assert.equal(finish?.reason.kind,'error');
   assert.equal(finish.reason.failure.code,'COLLABORATION_NO_REPLAY');
   assert.ok(finish.reason.failure.message.includes(reason));
   assert.ok(!finish.reason.failure.message.includes(host.root));
   assert.equal(state.prompts.length,0);
   assert.equal(host.client.attachments.pending.size,0);
  }
  writeFileSync(join(host.root,'empty.md'),host.bytes);
  const {state}=await host.run('@empty.md 上传该文档',{selection:'path'});
  assert.equal(state.chunks.findLast(chunk=>chunk.type==='finish')?.reason.kind,'stop');
  assert.equal(state.prompts.length,1);
  assert.deepEqual(state.transfers[0].bytes,host.bytes);
 }finally{await host.close();}
});
test('empty native attachment reports its cause without reading or sending bytes',async()=>{
 const host=await createNaturalAttachmentHost();
 try{
  const message=createUserMessage({content:[{type:'text',text:'上传该文档'},{type:'file',attachment:{name:'empty.md',bytes:0,attachmentId:'sha256:'+createHash('sha256').update('').digest('hex')}}],source:{kind:'user'}});
  await assert.rejects(host.client.attachments.capture({localId:host.localId,message,admission:{projectId:'a'.repeat(32)}}),/附件文件为空/);
  assert.equal(host.state.hostReads,0);
  assert.equal(host.state.prompts.length,0);
 }finally{await host.close();}
});
test('old peer with no exact attachment extension fails before business submission, never text fallback',async()=>{
 const {AttachmentAuthorization}=await import('../src/attachments.mjs');const {MemberClient}=await import('../src/member-client.mjs');
 const attachmentStore={fileHostPath:()=>undefined,async*readFileStream(){yield Buffer.from('x');}},attachments=new AttachmentAuthorization({attachmentStore}),data=Buffer.from('x');
 const message=createUserMessage({content:[{type:'text',text:'仅传输这份文件'},{type:'file',attachment:{attachmentId:'sha256:'+createHash('sha256').update(data).digest('hex'),name:'x.txt',bytes:1}}],source:{kind:'user'}});
 const entry=await attachments.capture({localId:'l',message,admission:{projectId:'a'.repeat(32)}}),service=new FakeService(),client=new MemberClient({databasePath:':memory:',account:'alice',serviceId:'fixture-service',attachments,connect:async()=>service.connect()});
 try{await assert.rejects(client.prompt('l',{messageId:message.id,text:entry.text,attachmentEntry:entry}),/授权元数据版本|attachment-capable/);assert.equal(service.prompts.length,0);assert.equal(client.db.prepare('SELECT count(*) n FROM client_submissions').get().n,0);}finally{client.close();}
});
