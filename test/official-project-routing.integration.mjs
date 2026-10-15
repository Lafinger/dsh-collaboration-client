import test from 'node:test';import assert from 'node:assert/strict';import {createRequire} from 'node:module';
import {SessionStore} from '@deepseek-ai/dsh-session';import {SessionController} from '@deepseek-ai/dsh-api-session-controller';import {LlmAdapter,createUserMessage} from '@deepseek-ai/dsh-llm';
import {createMountedMemberHost} from './helpers/member-host.mjs';
const require=createRequire(import.meta.url),official=createRequire(require.resolve('@deepseek-ai/dsh-api-session-controller/package.json'));
const {default:ProjectionRegistry}=official('@deepseek-ai/dsh-session-projection');
const {default:AgentRegistry,agentEvents}=official('@deepseek-ai/dsh-agent');
const {createScope}=official('@deepseek-ai/dsh-scope');

test('logged project route overrides actual official selection cache, ordinary switches still work and default is untouched',async()=>{
 let defaultsSaved=0;
 const f=await createMountedMemberHost({setupHost:async ctx=>{
  await ctx.plugin(SessionStore).await();await ctx.plugin(ProjectionRegistry).await();await ctx.plugin(AgentRegistry).await();
  ctx.provide('typert',{lookups:{configure:()=>()=>{}},contexts:{configureHost:()=>()=>{}}});
  ctx.provide('agentDefaultModel',{currentSelection:()=>({provider:'ordinary',model:'old-model',reasoningEffort:'high'}),saveSelection:async()=>{defaultsSaved++;}});
  ctx.provide('fileUploads',{registerAgentResolver:()=>()=>{}});ctx.provide('attachments',{imageLimits:{maxImageBytes:100}});
  ctx.provide('sessionQuery',{observeSession:async()=>{throw Error('No cold resume');}});
  ctx.on('session/flush',()=>{});new SessionController(ctx,{nativeOpen:false});
 }});
 try{
  const ctx=f.host,session=ctx.sessions.create('local-routing');
  const agent={id:session.id,session,status:'idle',ctx:null,options:{provider:'ordinary',model:'old-model'},inbox:{nextTurn:[],nextStep:[]},runMaintenance:async fn=>fn(new AbortController().signal)};
  agent.ctx=createScope(ctx,agent).ctx;await ctx.agents.register(agent);
  // Public resolver installs the official selection listeners when resuming; this existing agent
  // receives the same installation when selectModel below validates an ordinary model.
  ctx.llm.registerAdapter(['ordinary'],new class extends LlmAdapter{
    async listModels(){return[{provider:'ordinary',id:'old-model',name:'Old'}];}
    async resolveModel(provider,id){return{provider,id,name:'Old',reasoning:{efforts:[{id:'high',name:'High'}],defaultEffort:'high'}};}
    async *stream(){throw Error('Model calls forbidden');}
  }());
  await ctx.sessionController.selectModel({sessionId:session.id,provider:'ordinary',model:'old-model',reasoningEffort:'high'});
  assert.equal(defaultsSaved,1);defaultsSaved=0;
  const client=f.entry.client;client.login={expiresAt:Date.now()+3600000};client.projects=async()=>[{id:'p',key:'P',name:'Project'}];
  const shared=ctx.connection.createSharedFetchHandler('/api');
  const call=async(method,payload)=>(await(await shared.fetch(new Request('http://127.0.0.1:19999/api/collaboration/member',{method:'POST',headers:{host:'127.0.0.1:19999','content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'x',method:'collaboration/member',payload:{method,payload}})}))).json()).result;
  const menu=await call('project.menu',{localId:session.id});assert.equal(menu.ok,true);
  const selected=await call('project.activate',{localId:session.id,projectId:'p',scopeId:menu.value.scopeId});assert.equal(selected.ok,true);assert.equal(defaultsSaved,0);
  const events=agentEvents(ctx,agent),signal=new AbortController().signal;
  const assembly=await events.waterfall('system-prompt/assemble',{}, {agent},async()=>({variables:{provider:'ordinary',model:'old-model'},text:''}));assert.equal(assembly.variables.provider,'collaboration-remote');
  const request=await events.waterfall('agent/request',{agent,turn:1,step:1,signal},async()=>({provider:'ordinary',model:'old-model',reasoningEffort:'high'}));assert.deepEqual(request,{provider:'collaboration-remote',model:'server-agent'});
  const staleNotice=createUserMessage({content:[{type:'text',text:'obsolete model notice'}],source:{kind:'model-selection',form:'notice',summary:'obsolete'}}),preStep={agent,turn:1,step:2,signal,messages:[]};
  const decision=await events.waterfall('agent/pre-step',preStep,async()=>({kind:'enter',messages:[staleNotice]}));assert.ok(!decision.messages.some(message=>message.content.some(block=>block.text==='obsolete model notice')),'Logged route removes a stale ordinary-model notice');
  const empty=await events.waterfall('agent/pre-step',{...preStep,step:1},async()=>({kind:'enter',messages:[]}));assert.equal(empty.messages.length,0,'Route metadata must not make an empty first step executable');
  const clientDb=client.db;clientDb.prepare('INSERT INTO client_project_commit VALUES(?,?,?,?,?,?,?,?)').run(session.id,'fixture-service','alice','p','collaboration-remote','server-agent',session.snapshotEvents().length,1);
  await assert.rejects(events.waterfall('agent/pre-step',preStep,async()=>({kind:'enter',messages:[]})),/未发送业务/);clientDb.prepare('DELETE FROM client_project_commit WHERE local_id=?').run(session.id);
  await ctx.sessionController.selectModel({sessionId:session.id,provider:'ordinary',model:'old-model',reasoningEffort:'high'});
  await events.waterfall('system-prompt/assemble',{}, {agent},async()=>({variables:{},text:''}));const ordinary=await events.waterfall('agent/request',{agent,turn:1,step:1,signal},async()=>({provider:'fallback',model:'fallback'}));assert.equal(ordinary.provider,'ordinary');assert.equal(ordinary.reasoningEffort,'high');
  assert.equal(f.remoteCalls,0);assert.equal(client.mapping(session.id),undefined);assert.ok(!session.snapshotEvents().some(event=>/request\/header|turn\/start/.test(event.type)));
  // Unload must release agent-scoped routing, not leave a hidden route override behind.
  await f.fiber.dispose();assert.equal(ctx.get('collaborationProjectRouting'),undefined);
  await events.waterfall('system-prompt/assemble',{}, {agent},async()=>({variables:{},text:''}));const afterUnload=await events.waterfall('agent/request',{agent,turn:1,step:1,signal},async()=>({provider:'fallback',model:'fallback'}));assert.equal(afterUnload.provider,'ordinary');
 }finally{await f.close();}
});
