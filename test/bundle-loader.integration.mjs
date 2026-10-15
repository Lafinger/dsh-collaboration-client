import test from'node:test';import assert from'node:assert/strict';import{readFileSync,mkdtempSync,mkdirSync,writeFileSync,existsSync}from'node:fs';import{join}from'node:path';import{tmpdir}from'node:os';
import{Context}from'@deepseek-ai/cordis';import{Loader}from'@deepseek-ai/cordis-plugin-loader';import{applyEntryPatches}from'@deepseek-ai/cordis-plugin-include';import{LlmRuntime}from'@deepseek-ai/dsh-llm';import{ClientModuleRegistry}from'@deepseek-ai/dsh-client-modules';import yaml from'js-yaml';

import{installLegacyConnection}from'./helpers/legacy-connection.mjs';
// Same official patch semantics that boot/--dump-config use. No profile installation or endpoint connection.
test('fresh bundle really mounts Host component and advertises browser; later explicit disable stays authoritative',async()=>{
 const home=mkdtempSync(join(tmpdir(),'collab-bundle-home-')),base=join(home,'.dsh','dsh-collaboration-client');mkdirSync(base,{recursive:true});
 const oldEnv={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE,DSH_COLLABORATION_CLIENT_CONFIG:process.env.DSH_COLLABORATION_CLIENT_CONFIG};process.env.HOME=home;process.env.USERPROFILE=home;delete process.env.DSH_COLLABORATION_CLIENT_CONFIG;
 const patch=yaml.load(readFileSync(new URL('../cordis.patch.yml',import.meta.url),'utf8')),warnings=[];
 try{
  const fresh=applyEntryPatches([],patch,(...args)=>warnings.push(args));assert.equal(fresh[0].disabled,false);
  const key=join(base,'key'),known=join(base,'known_hosts'),databasePath=join(base,'client.sqlite');writeFileSync(key,'fixture placeholder');writeFileSync(known,'fixture');writeFileSync(join(base,'collaboration-client.json'),JSON.stringify({serviceId:'fixture',loginOrigin:'https://login.example.test',databasePath,ssh:{host:'example.test',account:'alice',identityFile:key,knownHostsFile:known}}));
  const ctx=new Context(),llm=ctx.plugin(LlmRuntime),loader=ctx.plugin(Loader,{baseUrl:new URL('../package.json',import.meta.url).href});await llm.await();await loader.await();
  try{
   installLegacyConnection(ctx);const registry=ctx.plugin(ClientModuleRegistry);await registry.await();await ctx.loader.root.update(fresh);await ctx.loader.await();const entry=ctx.loader.resolve('collaboration-client');assert.equal(entry.fiber.state,2);
   const client=entry.ctx.get('collaborationMemberClient');assert.ok(client);assert.equal(client.peer,null);assert.equal(client.login,null);assert.equal(client.connecting,null);assert.ok(existsSync(databasePath));assert.ok(ctx.clientModules.graph().entries.some(row=>row.id==='dsh-collaboration-client'));
   const disabled=applyEntryPatches([], [...patch,{id:'collaboration-client',disabled:true}],(...args)=>warnings.push(args));await ctx.loader.root.update(disabled);await ctx.loader.await();assert.equal(ctx.loader.resolve('collaboration-client').disabled,true);assert.equal(client.stopped,true);assert.ok(!ctx.llm.listProviders().some(row=>row.id==='collaboration-remote'));assert.ok(!ctx.clientModules.graph().entries.some(row=>row.id==='dsh-collaboration-client'));
   assert.equal(readFileSync(join(base,'collaboration-client.json'),'utf8').includes('fixture'),true);assert.deepEqual(warnings,[]);
  }finally{await ctx.fiber.dispose();}
 }finally{for(const[key,value]of Object.entries(oldEnv)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}
});
