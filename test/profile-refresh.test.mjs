// OFFLINE: encrypted synthetic credentials and real durable client SQLite, never contacts DingTalk.
import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import {HttpsMemberClient} from '../src/https-client.mjs';import {QrMemberClient} from '../src/qr-client.mjs';import {LoginVault} from '../src/login-vault.mjs';import {AccessError} from '../src/protocol.mjs';
const crypt=(op,input)=>op==='protect'?Buffer.from('protected:'+input).toString('base64'):Buffer.from(input,'base64').toString().slice(10);
function fixture(Client){
 const root=mkdtempSync(join(tmpdir(),'profile-refresh-')),vault=new LoginVault(join(root,'login.dpapi'),{crypt});
 const saved={origin:'https://mvp.example',serviceId:'one',account:'account-a',name:'旧姓名',deviceId:'device-a',token:'a'.repeat(43),expiresAt:Date.now()+60000,epoch:7,administrator:false,loginMethod:'dingtalk-qr'};vault.save(saved);
 class Peer extends EventEmitter{
  constructor(){super();this.closed=false;this.methods=[];this.error=null;this.identity={account:saved.account,serviceId:saved.serviceId,name:'官方新姓名',token:'evil-token',deviceId:'evil-device',expiresAt:Date.now()+604800000,epoch:999,administrator:true};}
  async request(method){this.methods.push(method);if(method==='initialize')return {protocolVersion:1,_meta:{collaborationProtocolVersion:4},serviceId:'one',agentCapabilities:{mvpHttps:true,mvpHttpsVersion:2,loginMethod:'dingtalk-qr'},authMethods:[{id:'dingtalk-device'}]};
   if(method==='collaboration/login/authenticate'){if(this.error)throw this.error;return this.identity;}if(method==='collaboration/whoami')return this.identity;throw Error(method);}
  close(){this.closed=true;this.emit('disconnected');}
 }
 const peer=new Peer(),client=new Client({origin:saved.origin,serviceId:saved.serviceId,databasePath:join(root,'mapping.sqlite'),vault,connect:async()=>peer});return {saved,vault,peer,client};
}
for(const Client of [HttpsMemberClient,QrMemberClient]){
 test(Client.name+' refreshes only authenticated same-identity name and persists without extending expiry or changing credentials',async()=>{
  const {saved,vault,peer,client}=fixture(Client);try{
   const status=await client.verifyAuthStatus();assert.equal(status.authenticated,true);assert.equal(status.name,'官方新姓名');assert.equal(status.expiresAt,saved.expiresAt);assert.equal(status.administrator,false);
   assert.deepEqual(vault.load(),{...saved,name:'官方新姓名'});assert.deepEqual(client.login,{...saved,name:'官方新姓名'});assert.ok(!peer.methods.some(method=>method.startsWith('session/')));assert.ok(!peer.methods.some(method=>['collaboration/login/start','collaboration/login/claim'].includes(method)));
   // Old v4 servers lacking name leave the label and credentials untouched.
   delete peer.identity.name;assert.equal((await client.verifyAuthStatus()).name,'官方新姓名');assert.deepEqual(vault.load(),{...saved,name:'官方新姓名'});
  }finally{client.close();}
 });
 test(Client.name+' concurrent authenticated name refresh cannot shield a later definitive revocation',async()=>{
  const {vault,peer,client}=fixture(Client);await client.restoreLogin();const old=peer.request.bind(peer);let rejectAuthentication,entered;const authenticating=new Promise(resolve=>entered=resolve);let count=0;
  peer.request=async method=>{if(method==='collaboration/login/authenticate'&&++count===1)return new Promise((_resolve,reject)=>{rejectAuthentication=reject;entered();});return old(method);};
  try{const delayed=client.ensureConnected();await authenticating;await client.ensureConnected();assert.equal(client.login.name,'官方新姓名');rejectAuthentication(new AccessError(-32003,'已撤权'));await assert.rejects(delayed);assert.equal(client.login,null);assert.equal(vault.load(),null);}finally{client.close();}
 });
 for(const mismatch of [{account:'different-account'},{serviceId:'different-service'}])test(Client.name+' rejects profile identity mismatch '+Object.keys(mismatch)[0],async()=>{
  const {saved,vault,peer,client}=fixture(Client);Object.assign(peer.identity,mismatch);try{await assert.rejects(client.verifyAuthStatus(),error=>error.code===-32003);assert.deepEqual(vault.load(),saved);assert.equal(client.login.name,saved.name);}finally{client.close();}
 });
 test(Client.name+' temporary -32014 retains login, does not extend it or refresh name, and later recovers in place',async()=>{
  const {saved,vault,peer,client}=fixture(Client);peer.error=new AccessError(-32014,'上游暂不可核验');try{
   const status=await client.verifyAuthStatus();assert.equal(status.authenticated,true);assert.equal(status.qualificationUnavailable,true);assert.match(status.error,/暂不可核验/);assert.deepEqual(vault.load(),saved);assert.deepEqual(client.login,saved);assert.equal(status.expiresAt,saved.expiresAt);assert.ok(!peer.methods.includes('collaboration/whoami'));
   peer.error=null;const recovered=await client.verifyAuthStatus();assert.equal(recovered.name,'官方新姓名');assert.equal(recovered.expiresAt,saved.expiresAt);assert.equal(recovered.qualificationUnavailable,undefined);assert.ok(!peer.methods.includes('session/prompt'));
  }finally{client.close();}
 });
}
