import assert from'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from'node:fs';
import {join} from'node:path';import {tmpdir} from'node:os';import {fileURLToPath,pathToFileURL} from'node:url';
import {LlmRuntime} from'@deepseek-ai/dsh-llm';
import {createOfficialHostConnection} from'./official-connection.mjs';

/** Real plugin/Connection with only local files and admission credentials as fixtures. No actual SSH allowed. */
export async function createMountedMemberHost({sessions,setupHost,packageRoot=process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('../..',import.meta.url))}={}){
 const home=mkdtempSync(join(tmpdir(),'collaboration-rpc-host-')),base=join(home,'.dsh','dsh-collaboration-client');mkdirSync(base,{recursive:true});
 const env={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE,DSH_COLLABORATION_CLIENT_CONFIG:process.env.DSH_COLLABORATION_CLIENT_CONFIG};
 process.env.HOME=home;process.env.USERPROFILE=home;delete process.env.DSH_COLLABORATION_CLIENT_CONFIG;
 const config={serviceId:'fixture-service',loginOrigin:'https://login.example.test',databasePath:join(base,'client.sqlite'),ssh:{host:'example.test',port:19482,account:'alice',identityFile:join(base,'fixture-key'),knownHostsFile:join(base,'fixture-hosts')}};
 writeFileSync(config.ssh.identityFile,'fixture placeholder, not a private key');writeFileSync(config.ssh.knownHostsFile,'fixture placeholder');const configPath=join(base,'collaboration-client.json');writeFileSync(configPath,JSON.stringify(config));
 const host=createOfficialHostConnection();let remoteCalls=0;
 const close=async()=>{try{await host.fiber.dispose();}finally{for(const[key,value]of Object.entries(env)){if(value===undefined)delete process.env[key];else process.env[key]=value;}}};
 try{
  const llm=host.plugin(LlmRuntime);await llm.await();if(sessions)host.provide('sessions',sessions);if(setupHost)await setupHost(host);
  const plugin=await import(pathToFileURL(join(packageRoot,'src/member-plugin.mjs')).href);const fiber=host.plugin(plugin);await fiber.await();
  assert.equal(fiber.state,2);const entry=fiber.ctx.get('collaborationMemberConnection');assert.ok(entry.client);
  const guard=client=>{client.connect=async()=>{remoteCalls++;throw Error('Real transport forbidden in offline Host fixture');};return client;};guard(entry.client);const create=entry.createClient;entry.createClient=config=>guard(create(config));
  return {host,entry,fiber,config,configPath,close,get remoteCalls(){return remoteCalls;}};
 }catch(error){await close();throw error;}
}
