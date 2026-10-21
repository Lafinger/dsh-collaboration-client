import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';
import Renderer from 'react-test-renderer';
import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';

const root=fileURLToPath(new URL('..',import.meta.url));
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
async function fixture(t,{assign,read}={}){
 const original=globalThis.confirm;globalThis.confirm=()=>true;
 const calls=[];let saved=null,revision=1,tree;
 const {browser}=await loadBrowserThroughDsh(root,{react:React});
 const call=async(method,payload)=>{
  calls.push({method,payload});
  if(method==='status')return {configuration:{webQrLogin:1,state:'configured'},authenticated:true,administrator:true,account:'fixture-admin',expiresAt:Date.now()+60000};
  assert.equal(method,'administration');
  if(payload.action==='role'){
   const commit=()=>{saved=payload.account;revision++;return {ok:true};};
   return assign?assign(payload,commit):commit();
  }
  assert.equal(payload.action,'view');
  if(read)await read(payload,calls);
  return {projects:[{id:'p',key:'P',name:'Project'},{id:'q',key:'Q',name:'Other'}],members:[{account:'member-a',name:'Member A'},{account:'member-b',name:'Member B'}],...(payload.projectId?{project:{id:payload.projectId,roles:[{role:'frontend',label:'前端',member:payload.projectId==='p'?saved:null}]},revision:'revision-'+revision}:{})};
 };
 await Renderer.act(async()=>{tree=Renderer.create(React.createElement(browser.CollaborationPanel,{call}));});
 t.after(async()=>{await Renderer.act(async()=>tree.unmount());if(original===undefined)delete globalThis.confirm;else globalThis.confirm=original;});
 const input=name=>tree.root.find(n=>n.props['aria-label']===name);
 const button=text=>tree.root.findAllByType('button').find(n=>n.props.children===text);
 const click=async text=>{const node=button(text);assert.ok(node,'Missing button '+text);await Renderer.act(async()=>node.props.onClick());};
 const change=async(name,value)=>Renderer.act(async()=>input(name).props.onChange({target:{value}}));
 const message=()=>tree.root.findAll(n=>n.props.role==='alert'||n.props.role==='status').map(n=>n.children.filter(c=>typeof c==='string').join('')).join('\n');
 const enabled=()=>{for(const name of ['管理项目','职责','角色成员'])assert.equal(input(name).props.disabled,false,name+' must recover after the request settles');};
 await click('刷新项目和角色候选');await change('管理项目','p');await click('读取所选项目');await change('职责','frontend');await change('角色成员','member-a');
 return {calls,input,button,click,change,message,enabled};
}

test('saved role assignment followed by failed read is reported as saved, not replayable failed write',async t=>{
 let failRead=false;
 const f=await fixture(t,{assign:(_payload,commit)=>{const result=commit();failRead=true;return result;},read:()=>{if(failRead)throw Error('fixture read unavailable');}});
 await f.click('确认角色分配');f.enabled();
 assert.match(f.message(),/已保存.*(?:读取|刷新).*失败/);
 assert.equal(f.button('确认角色分配').props.disabled,true,'Must refresh the revision before another assignment');
 assert.equal(f.calls.filter(c=>c.payload?.action==='role').length,1);
 await f.click('刷新项目和角色候选');
 assert.equal(f.calls.filter(c=>c.payload?.action==='role').length,1,'Read failure must never replay assignment');
 assert.equal(f.button('确认角色分配').props.disabled,true);
 failRead=false;await f.click('刷新项目和角色候选');f.enabled();
 assert.equal(f.button('确认角色分配').props.disabled,false);
 assert.equal(f.calls.filter(c=>c.payload?.action==='role').length,1);
});

test('unknown assignment unlocks selectors but blocks another write until its own project is read',async t=>{
 const f=await fixture(t,{assign:(_payload,commit)=>{commit();throw Object.assign(Error('fixture response lost'),{outcome:'unknown'});}});
 await f.click('确认角色分配');f.enabled();
 assert.match(f.message(),/未确认|未知|核对/);
 assert.equal(f.button('确认角色分配').props.disabled,true);
 await f.change('管理项目','q');await f.click('读取所选项目');await f.change('职责','frontend');
 assert.equal(f.button('确认角色分配').props.disabled,true,'Reading a different project cannot clear uncertain write');
 await f.change('管理项目','p');await f.click('读取所选项目');await f.change('职责','frontend');f.enabled();
 assert.equal(f.button('确认角色分配').props.disabled,false);
 assert.equal(f.calls.filter(c=>c.payload?.action==='role').length,1,'Recovery is read-only');
});

test('definitive rejection releases all selectors and preserves the draft without any automatic retry',async t=>{
 const f=await fixture(t,{assign:()=>{throw Object.assign(Error('fixture definitive rejection'),{outcome:'rejected'});}});
 await f.click('确认角色分配');f.enabled();assert.match(f.message(),/definitive rejection/);
 assert.equal(f.input('职责').props.value,'frontend');assert.equal(f.input('角色成员').props.value,'member-a');
 assert.equal(f.button('确认角色分配').props.disabled,false);assert.equal(f.calls.filter(c=>c.payload?.action==='role').length,1);
});

test('assignment and follow-up read keep the form busy only while actually pending',async t=>{
 const write=deferred(),read=deferred();let committed=false;
 const f=await fixture(t,{assign:async(_payload,commit)=>{await write.promise;const result=commit();committed=true;return result;},read:()=>committed?read.promise:undefined});
 let pending;await Renderer.act(async()=>{pending=f.button('确认角色分配').props.onClick();});
 for(const name of ['管理项目','职责','角色成员'])assert.equal(f.input(name).props.disabled,true);
 await Renderer.act(async()=>write.resolve());assert.equal(f.input('管理项目').props.disabled,true);
 await Renderer.act(async()=>{read.resolve();await pending;});f.enabled();assert.equal(f.button('确认角色分配').props.disabled,false);
});

test('two explicit assignments work without remount and cross-project reads discard drafts, never save',async t=>{
 const f=await fixture(t);await f.click('确认角色分配');f.enabled();await f.change('角色成员','member-b');await f.click('确认角色分配');f.enabled();
 assert.equal(f.calls.filter(c=>c.payload?.action==='role').length,2);
 const writes=f.calls.filter(c=>c.payload?.action==='role');assert.notEqual(writes[0].payload.commandId,writes[1].payload.commandId);assert.notEqual(writes[0].payload.revision,writes[1].payload.revision);
 await f.change('管理项目','q');await f.click('读取所选项目');assert.equal(f.input('职责').props.value,'');assert.equal(f.input('角色成员').props.value,'');
 await f.change('管理项目','p');await f.click('读取所选项目');assert.equal(f.input('职责').props.value,'');assert.equal(f.input('角色成员').props.value,'');assert.equal(f.calls.filter(c=>c.payload?.action==='role').length,2);
});
