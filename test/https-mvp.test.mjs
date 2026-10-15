import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {LoginVault,windowsCrypt} from '../src/login-vault.mjs';
import {HttpsMemberClient} from '../src/https-client.mjs';
import {trustedOrigin,readServiceInfo} from '../src/https-peer.mjs';
import {EventEmitter} from 'node:events';

const fakeCrypt=(action,input)=>action==='protect'?Buffer.from('encrypted:'+input).toString('base64'):Buffer.from(input,'base64').toString().slice('encrypted:'.length);
test('single service address rejects bare IP HTTP, credentials or callback paths; verifies exact remote origin and MVP version',async()=>{
 assert.equal(trustedOrigin('https://mvp.example/'),'https://mvp.example');
 for(const value of ['http://mvp.example','https://u:p@mvp.example','https://mvp.example/callback','https://mvp.example/#token'])assert.throws(()=>trustedOrigin(value));
 const info={serviceId:'one',origin:'https://mvp.example',mvpHttpsVersion:1,protocolVersion:3,loginMethod:'dingtalk-pc'};
 assert.deepEqual(await readServiceInfo(info.origin,{fetchImpl:async()=>Response.json(info)}),info);
 await assert.rejects(readServiceInfo(info.origin,{fetchImpl:async()=>Response.json({...info,origin:'https://other.example'})}));
});
test('login vault saves only protected bytes with explicit service binding and clears exact owned file',()=>{
 const root=mkdtempSync(join(tmpdir(),'mvp-vault-')),path=join(root,'login.dpapi'),vault=new LoginVault(path,{crypt:fakeCrypt});
 const value={token:'synthetic-private-token',account:'member',origin:'https://mvp.example',serviceId:'one'};vault.save(value);
 assert.ok(!readFileSync(path,'utf8').includes(value.token));assert.deepEqual(vault.load(),value);vault.clear();assert.equal(vault.load(),null);
});
test('Windows CurrentUser DPAPI roundtrip works using synthetic input and never stores plaintext', {skip:process.platform!=='win32'},()=>{
 const original=Buffer.from('synthetic-secret-for-dpapi-test').toString('base64');const encrypted=windowsCrypt('protect',original);
 assert.notEqual(encrypted,original);assert.equal(windowsCrypt('unprotect',encrypted),original);
});
class Peer extends EventEmitter{
 constructor(){super();this.closed=false;this.login=null;this.pending=false;this.confirmed=false;this.requests=[];}
 async request(method,p){this.requests.push(method);
  if(method==='initialize')return {protocolVersion:1,_meta:{collaborationProtocolVersion:3},authMethods:[{id:'dingtalk-device'}],serviceId:'one',agentCapabilities:{mvpHttps:true}};
  if(method==='collaboration/login/start'){this.pending=true;return {requestId:'request',loginUrl:'https://mvp.example/collaboration/pc-login#'+'a'.repeat(43),openUrl:'dingtalk://dingtalkclient/action/openapp?redirect_url='+encodeURIComponent('https://mvp.example/collaboration/pc-login#'+'a'.repeat(43)),pairingCode:'A'.repeat(16),expiresAt:Date.now()+300000};}
  if(method==='collaboration/login/claim'){if(!this.confirmed)return {status:'pending'};this.login={status:'authenticated',token:'a'.repeat(43),account:'official-member',name:'Official name',administrator:false,serviceId:'one',deviceId:p.deviceId,expiresAt:Date.now()+604800000};return this.login;}
  if(method==='collaboration/login/authenticate')return {authenticated:true,...this.login};
  if(method==='collaboration/whoami')return {account:'official-member',serviceId:'one'};
  if(method==='collaboration/login/logout')return {authenticated:false};
  if(method==='collaboration/projects')return {projects:[]};throw new Error(method);
 }
 close(){if(this.closed)return;this.closed=true;this.emit('disconnected');}
}
test('new client starts without preallocated account, polls once per status, saves official identity securely and restores without replay',async()=>{
 const root=mkdtempSync(join(tmpdir(),'mvp-client-')),vault=new LoginVault(join(root,'login.dpapi'),{crypt:fakeCrypt}),peer=new Peer();
 const options={origin:'https://mvp.example',databasePath:join(root,'mapping.sqlite'),serviceId:'one',vault,connect:async()=>peer};
 const client=new HttpsMemberClient(options);const started=await client.beginLogin();assert.ok(started.openUrl.startsWith('dingtalk:'));assert.equal(client.account,'pending-official-login');
 assert.equal((await client.verifyAuthStatus()).pending,true);peer.confirmed=true;
 const simultaneous=await Promise.all([client.verifyAuthStatus(),client.verifyAuthStatus()]);assert.ok(simultaneous.every(r=>r.authenticated));assert.equal(peer.requests.filter(m=>m==='collaboration/login/claim').length,2);assert.equal(client.account,'official-member');client.close();
 const otherPeer=new Peer();otherPeer.login=peer.login;const restored=new HttpsMemberClient({...options,connect:async()=>otherPeer});
 assert.equal((await restored.verifyAuthStatus()).authenticated,true);assert.equal(restored.account,'official-member');assert.ok(!otherPeer.requests.includes('session/prompt'));assert.ok(!otherPeer.requests.includes('collaboration/login/start'));
 await restored.logout();assert.equal(vault.load(),null);assert.equal(restored.account,'pending-official-login');restored.close();
});
