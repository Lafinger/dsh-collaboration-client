import test from 'node:test';
import assert from 'node:assert/strict';
import { createUserMessage, BlockAssembler } from '@deepseek-ai/dsh-llm';
import { MemberAdapter, Config } from '../src/member-plugin.mjs';
import { MemberClient } from '../src/member-client.mjs';
import { FakeService } from './helpers/fake-service.mjs';
function human(text){return createUserMessage({content:[{type:'text',text}],source:{kind:'user'}});}
test('adapter converts response chunks and submits latest human message only',async()=>{
 const service=new FakeService();const client=new MemberClient({databasePath:':memory:',account:'alice',serviceId:'fixture-service',connect:async()=>service.connect()});const adapter=new MemberAdapter(client);
 try{const first=human('first');const second=human('second');const assembler=new BlockAssembler();for await(const chunk of adapter.stream({provider:'workbench-remote',model:'server-agent',sessionId:'local',messages:[first,second],tools:[{name:'LOCAL_SENTINEL'}]}))assembler.push(chunk);
 assert.equal(service.prompts.length,1);assert.deepEqual(service.prompts[0].prompt,[{type:'text',text:'second'}]);assert.ok(!JSON.stringify(service.prompts).includes('LOCAL_SENTINEL'));assert.equal(assembler.blocks()[0].text,'reply:second');assert.equal(assembler.finish.kind,'stop');}finally{client.close();}
});
test('plugin config schema requires provisioned connection, never defaults to a real service',async()=>{
 const empty=await Config['~standard'].validate({});assert.ok(empty.issues?.length);
 const valid=await Config['~standard'].validate({databasePath:':memory:',serviceId:'test',ssh:{account:'alice',host:'example.test',identityFile:'/key',knownHostsFile:'/known_hosts'}});assert.ok(!valid.issues);assert.equal(valid.value.provider,'workbench-remote');
});
