import test from 'node:test';import assert from'node:assert/strict';
import{Context}from'@deepseek-ai/cordis';import{LlmRuntime}from'@deepseek-ai/dsh-llm';import{MemberAdapter}from'../src/member-plugin.mjs';
test('the official provider/model catalog names Collaboration and 项目选择 without querying the remote or invoking a model',async()=>{
 const ctx=new Context();const fiber=ctx.plugin(LlmRuntime);await fiber.await();let remoteCalls=0;
 const client={projects(){remoteCalls++;throw Error('Listing the local model must not fetch projects');},prompt(){remoteCalls++;throw Error('No model call');}};
 const registration=ctx.llm.registerAdapter(['collaboration-remote'],new MemberAdapter(client));
 try{assert.deepEqual(ctx.llm.listProviders().find(p=>p.id==='collaboration-remote'),{id:'collaboration-remote',name:'Collaboration'});const models=await ctx.llm.listModels('collaboration-remote');assert.equal(models.length,1);assert.equal(models[0].id,'server-agent');assert.equal(models[0].name,'项目选择');assert.equal(remoteCalls,0);}finally{registration();await ctx.fiber.dispose();}
});
