import test from 'node:test';
import assert from 'node:assert/strict';
import {EventEmitter} from 'node:events';
import {MemberClient} from '../src/member-client.mjs';
import {collaborationMeta,AccessError} from '../src/protocol.mjs';
import {makeHumanAuthorization} from '../src/human-authorization.mjs';
const projectId='a'.repeat(32);

function fixture(t,{loginOrigin='https://login.example.test',serverLogin=true}={}){
  const calls=[],sessions=new Map();let authorized=false,revoke=false,sequence=0;
  const connect=async()=>new class extends EventEmitter{
    closed=false;
    async request(method,p){calls.push({method,p});
      if(method==='initialize')return {protocolVersion:1,_meta:collaborationMeta(),agentCapabilities:{humanAuthorization:{version:2}},authMethods:serverLogin?[{id:'dingtalk-device'}]:[]};
      if(method==='collaboration/login/start')return {requestId:'request',loginUrl:'https://login.example.test/collaboration/login/11111111-1111-1111-1111-111111111111',expiresAt:Date.now()+300000};
      if(method==='collaboration/login/claim')return {status:'authenticated',token:'private-device-token',account:'alice',serviceId:'s',deviceId:p.deviceId,expiresAt:Date.now()+43200000};
      if(method==='collaboration/login/authenticate'){if(revoke)throw new AccessError(-32003,'revoked');authorized=true;return {authenticated:true};}
      if(method==='collaboration/login/logout'){authorized=false;return {authenticated:false};}
      if(!authorized)throw new AccessError(-32003,'login required');
      if(method==='collaboration/whoami')return {account:'alice',serviceId:'s'};
      if(method==='collaboration/projects')return {projects:[{id:projectId,name:'A'}]};
      if(method==='session/new'){assert.equal(p.projectId,projectId);const sessionId=`remote-${++sequence}`;sessions.set(sessionId,p.projectId);return {sessionId};}
      if(method==='session/load')return {};
      if(method==='collaboration/history')return {events:[],status:null};
      if(method==='session/prompt')return {stopReason:'end_turn'};
      throw new Error(method);
    }
    close(){if(this.closed)return;this.closed=true;this.emit('disconnected');}
  }();
  const client=new MemberClient({connect,databasePath:':memory:',account:'alice',serviceId:'s',requireLogin:true,loginOrigin});t.after(()=>client.close());
  return {client,calls,revoke:()=>{revoke=true;}};
}

test('device login state is explicit and private; project selection required, rechecked on cached peer, logout not auto recovery',async t=>{
  const {client,calls,revoke}=fixture(t);
  await assert.rejects(client.prompt('local',{messageId:'one',text:'query'}),/扫码/);assert.equal(calls.some(c=>c.method==='session/new'),false);
  const started=await client.beginLogin();assert.equal(started.loginUrl.includes('private-device-token'),false);
  await client.completeLogin();assert.equal(client.authStatus().authenticated,true);
  assert.ok(!JSON.stringify(client.authStatus()).includes('token'));assert.ok(!JSON.stringify(client.db.prepare('SELECT * FROM client_device').all()).includes('private-device-token'));
  assert.equal((await client.projects())[0].id,projectId);await assert.rejects(client.open('local'),/模型菜单.*明确选择/);
  client.selectProject('local',projectId);await client.prompt('local',{messageId:'two',text:'query',attachmentEntry:{items:[],humanAuthorization:makeHumanAuthorization({messageId:'two',text:'query',projectId})}});
  assert.throws(()=>client.selectProject('local','other'),/新建/);
  revoke();assert.equal((await client.verifyAuthStatus()).authenticated,false);await assert.rejects(client.prompt('local',{messageId:'three',text:'must not run'}));assert.equal(client.authStatus().authenticated,false);
  await client.logout();assert.equal(client.pendingLogin,null);assert.equal(client.reconnectTimer,null);
});

test('device logout revokes the cached login through a fresh transport after disconnect without renewing authentication or affecting IM',async t=>{
  const {client,calls}=fixture(t);await client.beginLogin();await client.completeLogin();client.disconnect();await client.logout();
  const logout=calls.findLast(c=>c.method==='collaboration/login/logout');assert.equal(logout.p.token,'private-device-token');assert.equal(logout.p.deviceId,client.deviceId);assert.equal(client.authStatus().authenticated,false);assert.equal(client.reconnectTimer,null);
});

test('old SSH-only server and unexpected login origin are refused without downgrading',async t=>{
  const old=fixture(t,{serverLogin:false});await assert.rejects(old.client.beginLogin(),/no SSH-only fallback/);
  const wrong=fixture(t,{loginOrigin:'https://different.example.test'});await assert.rejects(wrong.client.beginLogin(),/Untrusted/);
  assert.equal(wrong.client.pendingLogin,null);
});
