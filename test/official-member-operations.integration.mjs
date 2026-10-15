import test from'node:test';import assert from'node:assert/strict';import{Context}from'@deepseek-ai/cordis';
import{EventEmitter}from'node:events';import{readFileSync}from'node:fs';import{dirname,join}from'node:path';
import{createMountedMemberHost}from'./helpers/member-host.mjs';import{installOfficialBrowserConnection}from'./helpers/official-connection.mjs';import{collaborationMeta,AccessError}from'../src/protocol.mjs';

// Login authority is a protocol fixture, not real SSH/DingTalk. Official browser/Host RPC and MemberClient are real.
test('configuration choice/import/reset and device login/project/logout values cross the official codec without secrets or hidden business',async()=>{
 const local={id:'local'},fixture=await createMountedMemberHost({sessions:{get:id=>id==='local'?local:undefined}}),browser=new Context(),peerCalls=[],results=[];
 try{
  const original=readFileSync(fixture.configPath,'utf8'),connection=installOfficialBrowserConnection(browser,fixture.host);
  const rpc=async(method,payload={})=>{const result=await connection.rpc.call('/api','collaboration/member',{method,payload});results.push(result);return result;};
  const call=async(method,payload={})=>{const result=await rpc(method,payload);assert.equal(result.ok,true,'failed '+method);assert.ok(result.value,'missing '+method+' value');return result.value;};
  assert.equal((await call('status')).configuration.serviceId,'fixture-service');assert.equal((await call('configuration.list')).candidates[0].id,'collaboration-client.json');
  assert.equal((await call('configuration.select',{id:'collaboration-client.json'})).source,'saved-selection');assert.equal((await call('configuration.refresh')).state,'configured');assert.equal((await call('configuration.auto')).source,'discovery');
  const imported=await call('configuration.import',{json:original});assert.match(imported.configPath,/import-/);assert.equal(imported.source,'saved-selection');assert.equal(readFileSync(fixture.configPath,'utf8'),original);assert.equal(fixture.remoteCalls,0);
  const client=fixture.entry.client;client.connect=async()=>new class extends EventEmitter{
   closed=false;async request(method,payload){peerCalls.push({method,payload});
    if(method==='initialize')return{protocolVersion:1,_meta:collaborationMeta(),authMethods:[{id:'dingtalk-device'}]};
    if(method==='collaboration/login/start')return{requestId:'request',loginUrl:'https://login.example.test/collaboration/login/11111111-1111-1111-1111-111111111111',expiresAt:Date.now()+300000};
    if(method==='collaboration/login/claim')return{status:'authenticated',token:'fixture-private-token',account:'alice',serviceId:'fixture-service',deviceId:payload.deviceId,expiresAt:Date.now()+3600000};
    if(method==='collaboration/login/authenticate')return{authenticated:true};if(method==='collaboration/whoami')return{account:'alice',serviceId:'fixture-service'};
    if(method==='collaboration/projects')return{projects:[{id:'p',key:'P',name:'Project'}]};if(method==='collaboration/login/logout')return{authenticated:false};throw new AccessError(-32601,'Unexpected fixture method');
   }
   close(){if(this.closed)return;this.closed=true;this.emit('disconnected');}
  }();
  assert.equal((await rpc('project.list')).ok,false);const started=await call('login.start');assert.match(started.loginUrl,/^https:\/\/login.example.test\//);
  assert.equal((await rpc('configuration.auto')).ok,false);assert.equal((await call('status')).switchRequiresLogout,true);assert.equal((await call('login.claim')).authenticated,true);
  assert.equal((await call('project.list')).projects[0].id,'p');assert.equal((await call('project.state',{localId:'local'})).mapped,false);assert.equal((await call('project.select',{localId:'local',projectId:'p'})).projectId,'p');assert.equal(client.selectedProject('local'),'p');
  assert.equal((await rpc('project.select',{localId:'local',projectId:'unauthorized'})).ok,false);assert.equal((await rpc('login.claim',{token:'caller-secret'})).ok,false);
  assert.equal((await call('login.logout')).authenticated,false);assert.equal((await call('status')).switchRequiresLogout,false);
  const encoded=JSON.stringify(results);assert.ok(!encoded.includes('fixture-private-token'));assert.ok(!encoded.includes('caller-secret'));assert.ok(!encoded.includes('proof'));
  assert.ok(!readFileSync(join(dirname(fixture.configPath),'.member-selection.json'),'utf8').includes('fixture-private-token'));assert.ok(!peerCalls.some(row=>/^session\//.test(row.method)));assert.equal(fixture.remoteCalls,0);
 }finally{await browser.fiber.dispose();await fixture.close();}
});
