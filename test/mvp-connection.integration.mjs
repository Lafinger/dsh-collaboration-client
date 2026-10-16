import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import {LlmRuntime} from '@deepseek-ai/dsh-llm';
import * as plugin from '../src/member-plugin.mjs';
import {HttpsConnection} from '../src/https-connection.mjs';
import {createOfficialHostConnection,installOfficialBrowserConnection} from './helpers/official-connection.mjs';

test('actual default plugin ignores personal SSH JSON and keeps settings ready; a single explicit HTTPS address mounts route without auth/model calls',async()=>{
 const home=mkdtempSync(join(tmpdir(),'mvp-default-')),base=join(home,'.dsh','dsh-collaboration-client');mkdirSync(base,{recursive:true});
 writeFileSync(join(base,'collaboration-client.json'),JSON.stringify({serviceId:'legacy',ssh:{account:'old-account'}}));
 const env={HOME:process.env.HOME,USERPROFILE:process.env.USERPROFILE};process.env.HOME=home;process.env.USERPROFILE=home;
 const host=createOfficialHostConnection(),browser=new Context();let connects=0;
 try{
  await host.plugin(LlmRuntime).await();const fiber=host.plugin(plugin,{legacySsh:true,ssh:{account:'old-account'}});await fiber.await();const entry=fiber.ctx.get('collaborationMemberConnection');
  assert.ok(entry instanceof HttpsConnection);assert.equal(entry.client,null);assert.equal(entry.status.state,'configuration-required');
  entry.readInfo=async origin=>({origin,serviceId:'mvp-server',mvpHttpsVersion:2,protocolVersion:3,loginMethod:'dingtalk-qr'});
  const create=entry.createClient;entry.createClient=config=>{const client=create(config);client.connect=async()=>{connects++;throw Error('No real remote requests in fixture');};return client;};
  installOfficialBrowserConnection(browser,host);const rpc=async(method,payload={})=>{const r=await browser.connection.rpc.call('/api','collaboration/member',{method,payload});assert.equal(r.ok,true,r.error?.message);return r.value;};
  const configured=await rpc('configuration.address',{origin:'https://mvp.example'});assert.equal(configured.mode,'mvp-qr');assert.equal(configured.serviceId,'mvp-server');
  assert.equal(entry.client.account,'pending-official-login');assert.equal(entry.client.peer,null);assert.equal((await rpc('status')).authenticated,false);assert.equal(connects,0);
  assert.ok((await host.llm.listModels('collaboration-remote')).some(m=>m.id==='server-agent'));
  await rpc('login.logout');assert.equal(connects,0);
 }finally{await browser.fiber.dispose();await host.fiber.dispose();for(const[k,v]of Object.entries(env)){if(v===undefined)delete process.env[k];else process.env[k]=v;}}
});

test('MVP restored encrypted login prevents address switch before any service discovery, malformed saved config stays actionable',async()=>{
 const base=mkdtempSync(join(tmpdir(),'mvp-change-'));writeFileSync(join(base,'service.json'),JSON.stringify({version:1,origin:'https://mvp.example',serviceId:'one'}));
 let discoveries=0;const client={login:null,busy:new Set(),opening:new Map(),async restoreLogin(){this.login={expiresAt:Date.now()+10000};},close(){}};
 const entry=new HttpsConnection({base,createClient:()=>client});entry.readInfo=async()=>{discoveries++;throw Error('Not reached');};
 await assert.rejects(entry.configure('https://other.example'),e=>e.code===-32003);assert.equal(discoveries,0);entry.close();
 const bad=mkdtempSync(join(tmpdir(),'mvp-bad-'));writeFileSync(join(bad,'service.json'),'{broken');const pending=new HttpsConnection({base:bad,createClient:()=>{throw Error('No client should be made');}});assert.equal(pending.client,null);assert.equal(pending.status.state,'configuration-required');assert.match(pending.status.message,/重新保存/);pending.close();
});
