import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserMessage, BlockAssembler, LlmRuntime } from '@deepseek-ai/dsh-llm';
import { MemberAdapter, Config } from '../src/member-plugin.mjs';
import { MemberClient } from '../src/member-client.mjs';
import { FakeService } from './helpers/fake-service.mjs';
import { Context } from '@deepseek-ai/cordis';

test('DSH 0.2 registered route streams through real LLM service and refuses auxiliary business replay', async () => {
  const ctx = new Context();
  const fiber = ctx.plugin(LlmRuntime); await fiber.await();
  const service = new FakeService();
  const client = new MemberClient({ databasePath: ':memory:', serviceId: 'fixture-service', account: 'alice', connect: async () => service.connect() });
  const registration = ctx.llm.registerAdapter(['workbench-remote'], new MemberAdapter(client));
  try {
    const catalog = await ctx.llm.listModels('workbench-remote');
    assert.ok(catalog.some(model => model.id === 'server-agent'));
    const assembled = new BlockAssembler();
    for await (const chunk of ctx.llm.stream({ provider: 'workbench-remote', model: 'server-agent', sessionId: 'real-route', messages: [human('route')] })) assembled.push(chunk);
    assert.equal(assembled.finish.kind, 'stop'); assert.equal(assembled.blocks()[0].text, 'reply:route');
    const auxiliary = [];
    for await (const chunk of ctx.llm.stream({ provider: 'workbench-remote', model: 'server-agent', sessionId: 'real-route', messages: [human('compact')], purpose: 'compaction' })) auxiliary.push(chunk);
    assert.equal(auxiliary.at(-1).reason.kind, 'error'); assert.equal(service.prompts.length, 1);
  } finally { registration(); client.close(); await ctx.fiber.dispose(); }
});
function human(text){return createUserMessage({content:[{type:'text',text}],source:{kind:'user'}});}
test('adapter converts response chunks and submits latest human message only',async()=>{
 const service=new FakeService();const client=new MemberClient({databasePath:':memory:',account:'alice',serviceId:'fixture-service',connect:async()=>service.connect()});const adapter=new MemberAdapter(client);
 try{const first=human('first');const second=human('second');const assembler=new BlockAssembler();for await(const chunk of adapter.stream({provider:'workbench-remote',model:'server-agent',sessionId:'local',messages:[first,second],tools:[{name:'LOCAL_SENTINEL'}]}))assembler.push(chunk);
 assert.equal(service.prompts.length,1);assert.deepEqual(service.prompts[0].prompt,[{type:'text',text:'second'}]);assert.ok(!JSON.stringify(service.prompts).includes('LOCAL_SENTINEL'));assert.equal(assembler.blocks()[0].text,'reply:second');assert.equal(assembler.finish.kind,'stop');}finally{client.close();}
});
test('schema accepts initial empty state; connection validation happens before activation',async()=>{
 const empty=await Config['~standard'].validate({});assert.ok(!empty.issues);
 const valid=await Config['~standard'].validate({databasePath:':memory:',serviceId:'test',ssh:{account:'alice',host:'example.test',identityFile:'/key',knownHostsFile:'/known_hosts'}});assert.ok(!valid.issues);
});
