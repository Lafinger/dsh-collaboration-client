import test from 'node:test';
import assert from 'node:assert/strict';
import {MemberClient} from '../src/member-client.mjs';
import {installMemberRpc} from '../src/member-rpc.mjs';

function fixture(){
  const client=new MemberClient({connect:async()=>{throw Error('Real transport forbidden');},databasePath:':memory:',serviceId:'service',account:'alice',requireLogin:true});
  client.login={token:'fixture-only-secret',expiresAt:Date.now()+3600000};
  let projects=[{id:'p',key:'P',name:'项目甲'},{id:'q',key:'Q',name:'项目乙'}],queries=0,failAppend=false,registration;
  client.projects=async()=>{queries++;return projects;};
  const events=[],session={id:'local',header:{},snapshotEvents:()=>events,append:(type,data)=>{if(failAppend)throw Error('append unavailable');const row={seq:events.length,time:Date.now(),type,data};events.push(row);return row;}};
  const agent={id:'local',session,status:'idle',runMaintenance:async fn=>fn(new AbortController().signal)};
  const entry={client,status:{provider:'collaboration-remote',model:'server-agent',serviceId:'service',account:'alice'},operations:0,currentValid:()=>true};
  const ctx={connection:{fetch:{register:r=>{registration=r;return()=>{};}}},get:key=>({sessionController:{resolveAgent:async()=>({agent}),inspect:async id=>{if(id!=='local')throw Error('missing');return{meta:session.header,events};}},agents:{get:()=>agent},llm:{resolveCallConfig:async value=>value},collaborationProjectRouting:{ensure:()=>{}},sessionProjections:{stateOf:()=>({pending:events.at(-1)?.data??null,lastUsed:null})}}[key])};
  const sessions={get:id=>id==='local'?session:undefined,flush:async()=>true};installMemberRpc(ctx,{entry,sessions});
  const call=async(method,payload={})=>(await(await registration.fetch(new Request('http://127.0.0.1:19999/api/collaboration/member',{method:'POST',headers:{host:'127.0.0.1:19999',origin:'http://127.0.0.1:19999','content-type':'application/json'},body:JSON.stringify({type:'client-request',rpcId:'fixture',method:'collaboration/member',payload:{method,payload}})}))).json()).result;
  return{ctx,client,entry,agent,events,session,sessions,call,get queries(){return queries;},set projects(value){projects=value;},set failAppend(value){failAppend=value;}};
}

test('menu fetch is explicit and project activation records current-session route with no default/model/business call',async()=>{
 const f=fixture();try{assert.equal(f.queries,0);const menu=await f.call('project.menu',{localId:'local'});assert.equal(menu.ok,true);assert.equal(menu.value.projects.length,2);assert.equal(f.queries,1);
 const chosen=await f.call('project.activate',{localId:'local',projectId:'p',scopeId:menu.value.scopeId});assert.equal(chosen.ok,true);assert.equal(f.client.selectedProject('local'),'p');assert.deepEqual(f.events.map(e=>[e.type,e.data]),[['model/selection',{provider:'collaboration-remote',model:'server-agent'}]]);
 assert.equal(f.client.mapping('local'),undefined);assert.equal(f.queries,2);assert.ok(!JSON.stringify(chosen).includes('fixture-only-secret'));
 }finally{f.client.close();}
});
test('activation append failure keeps old project, reauthorization denies revoked/foreign scope, mapped session can only return to its project',async()=>{
 const f=fixture();try{f.client.selectProject('local','p');const menu=await f.call('project.menu',{localId:'local'});assert.equal(menu.ok,true);
 f.failAppend=true;assert.equal((await f.call('project.activate',{localId:'local',projectId:'q',scopeId:menu.value.scopeId})).ok,false);assert.equal(f.client.selectedProject('local'),'p');f.failAppend=false;
 assert.equal((await f.call('project.activate',{localId:'local',projectId:'q',scopeId:'foreign'})).ok,false);f.projects=[{id:'p',key:'P',name:'项目甲'}];assert.equal((await f.call('project.activate',{localId:'local',projectId:'q',scopeId:menu.value.scopeId})).ok,false);
 f.client.db.prepare('INSERT INTO client_mapping VALUES(?,?,?,?,0)').run('local','service','alice','remote');assert.equal((await f.call('project.activate',{localId:'local',projectId:'p',scopeId:menu.value.scopeId})).ok,true);assert.equal((await f.call('project.activate',{localId:'local',projectId:'q',scopeId:menu.value.scopeId})).ok,false);
 }finally{f.client.close();}
});
test('busy agents do not mutate projects',async()=>{
 const f=fixture();try{const menu=await f.call('project.menu',{localId:'local'});assert.equal(menu.ok,true);f.agent.status='running';assert.equal((await f.call('project.activate',{localId:'local',projectId:'p',scopeId:menu.value.scopeId})).ok,false);assert.equal(f.client.selectedProject('local'),null);
 }finally{f.client.close();}
});
test('selection journal blocks dependent business while durability is unknown and recovers only the logged intent',async()=>{
 const f=fixture();try{f.client.selectProject('local','p');const menu=await f.call('project.menu',{localId:'local'});f.sessions.flush=async()=>{throw Error('persistence unavailable');};
 const result=await f.call('project.activate',{localId:'local',projectId:'q',scopeId:menu.value.scopeId});assert.equal(result.ok,false);assert.equal(result.error.details.outcome,'unknown');assert.equal(f.client.selectedProject('local'),'p');assert.ok(f.client.pendingProjectSelection('local'));await assert.rejects(f.client.open('local'),/结果未确认/);
 assert.equal((await f.call('project.state',{localId:'local'})).ok,false);f.sessions.flush=async()=>true;const state=await f.call('project.state',{localId:'local'});assert.equal(state.ok,true);assert.equal(state.value.projectId,'q');assert.equal(state.value.uncertain,false);assert.equal(f.client.mapping('local'),undefined);
 }finally{f.client.close();}
});
test('concurrent selections do not queue, stale identity and changed session route reject before commit',async()=>{
 const f=fixture();try{const menu=await f.call('project.menu',{localId:'local'});let release,entered;const reached=new Promise(resolve=>{entered=resolve;});f.client.projects=()=>{entered();return new Promise(resolve=>{release=resolve;});};
 const first=f.call('project.activate',{localId:'local',projectId:'p',scopeId:menu.value.scopeId});await reached;assert.equal(f.entry.operations,1);assert.equal((await f.call('project.activate',{localId:'local',projectId:'q',scopeId:menu.value.scopeId})).ok,false);
 f.events.push({seq:0,type:'model/selection',data:{provider:'ordinary',model:'other'}});release([{id:'p',name:'P'}]);assert.equal((await first).ok,false);assert.equal(f.client.selectedProject('local'),null);assert.equal(f.entry.operations,0);
 f.client.projects=async()=>[{id:'p',name:'P'}];f.client.login={expiresAt:Date.now()+3600000};assert.equal((await f.call('project.activate',{localId:'local',projectId:'p',scopeId:menu.value.scopeId})).ok,false);
 }finally{f.client.close();}
});
test('uncommitted journal without a corresponding event retains the old project; malformed or duplicate project data rejects',async()=>{
 const f=fixture();try{f.client.selectProject('local','p');f.client.db.prepare('INSERT INTO client_project_commit VALUES(?,?,?,?,?,?,?,NULL)').run('local','service','alice','q','collaboration-remote','server-agent',0);assert.equal((await f.call('project.state',{localId:'local'})).value.projectId,'p');assert.equal(f.client.pendingProjectSelection('local'),undefined);
 f.projects=[{id:'x',name:'X'},{id:'x',name:'Another X'}];assert.equal((await f.call('project.menu',{localId:'local'})).ok,false);f.projects=[{name:'missing id'}];assert.equal((await f.call('project.menu',{localId:'local'})).ok,false);assert.equal((await f.call('project.menu',{localId:'unknown'})).ok,false);
 }finally{f.client.close();}
});
test('legacy project binding cannot race the new menu activation or start while the agent is busy',async()=>{
 const f=fixture();try{const menu=await f.call('project.menu',{localId:'local'});let release,entered;const reached=new Promise(resolve=>{entered=resolve;});let first=true;f.client.projects=()=>{if(!first)return Promise.resolve([{id:'q',name:'Q'}]);first=false;entered();return new Promise(resolve=>{release=resolve;});};
 const active=f.call('project.activate',{localId:'local',projectId:'p',scopeId:menu.value.scopeId});await reached;
 assert.equal((await f.call('project.select',{localId:'local',projectId:'q'})).ok,false);release([{id:'p',name:'P'}]);assert.equal((await active).ok,true);assert.equal(f.client.selectedProject('local'),'p');
 f.client.projects=async()=>[{id:'q',name:'Q'}];f.agent.status='running';assert.equal((await f.call('project.select',{localId:'local',projectId:'q'})).ok,false);assert.equal(f.client.selectedProject('local'),'p');
 }finally{f.client.close();}
});
test('missing durability capability never reports a successful project commit',async()=>{
 const f=fixture();try{delete f.sessions.flush;const menu=await f.call('project.menu',{localId:'local'});const result=await f.call('project.activate',{localId:'local',projectId:'p',scopeId:menu.value.scopeId});assert.equal(result.ok,false);assert.equal(f.client.selectedProject('local'),null);
 }finally{f.client.close();}
});
test('missing routing projection capability rejects before any logged selection or project mutation',async()=>{
 const f=fixture();try{const get=f.ctx.get;f.ctx.get=key=>key==='collaborationProjectRouting'?undefined:get(key);const menu=await f.call('project.menu',{localId:'local'});assert.equal((await f.call('project.activate',{localId:'local',projectId:'p',scopeId:menu.value.scopeId})).ok,false);assert.equal(f.client.selectedProject('local'),null);assert.equal(f.events.length,0);
 }finally{f.client.close();}
});
test('cold project-menu inspection does not activate an agent, and stable old mapping names do not authorize projects',async()=>{
 const f=fixture();try{f.sessions.get=()=>undefined;const menu=await f.call('project.menu',{localId:'local'});assert.equal(menu.ok,true);assert.equal(menu.value.projects.length,2);assert.equal(f.client.selectedProject('local'),null);assert.equal(f.events.length,0);assert.equal((await f.call('project.menu',{localId:'foreign'})).ok,false);
 }finally{f.client.close();}
});
test('journal time mismatch cannot adopt another same-route selection or permit business',async()=>{
 const f=fixture();try{f.client.selectProject('local','p');f.events.push({seq:0,time:10,type:'model/selection',data:{provider:'collaboration-remote',model:'server-agent'}});f.client.db.prepare('INSERT INTO client_project_commit VALUES(?,?,?,?,?,?,?,?)').run('local','service','alice','q','collaboration-remote','server-agent',0,11);
 const result=await f.call('project.state',{localId:'local'});assert.equal(result.ok,false);assert.equal(result.error.details.outcome,'unknown');assert.equal(f.client.selectedProject('local'),'p');await assert.rejects(f.client.open('local'),/结果未确认/);
 }finally{f.client.close();}
});
