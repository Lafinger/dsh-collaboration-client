// OFFLINE: real bundled React panel, synthetic authority snapshots, no running DSH changes.
import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import React from 'react';import Renderer from 'react-test-renderer';import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
const member=(account,name,qualification='verified',extra={})=>({account,name,qualification,assignable:qualification==='verified',lastVerifiedAt:1000,lastCheckedAt:2000,verifiedUntil:3000,disambiguator:'成员-'+account,...extra});
async function fixture(t,{legacy=false}={}){
 const previous=globalThis.confirm;globalThis.confirm=()=>true;const calls=[];let tree,fail=false,wait=null,profileName='旧姓名';
 const members=[member('a','同名'),member('b','同名'),member('c','待核验','unknown'),member('d','失效成员','revoked'),member('e','需重登','relogin-required'),member('f','停用成员','disabled')];
 const role={role:'frontend',label:'前端',member:'sensitive-official-raw-id',memberProfile:member('sensitive-official-raw-id','原职责成员','revoked'),roleNeedsReassignment:true};
 const call=async(method,payload)=>{calls.push({method,payload});if(method==='status')return {configuration:{webQrLogin:1,state:'configured'},authenticated:true,administrator:true,account:'admin',name:profileName,expiresAt:Date.now()+60000};
  if(payload.action==='role')return {ok:true};assert.equal(payload.action,'view');if(wait)await wait;if(fail)throw Error('核验上游故障');
  return {projects:[{id:'p',key:'P',name:'项目'}],members:legacy?members.map(({account,name})=>({account,name})):members,...legacy?{}:{sync:{status:'partial',checkedAt:2000}},...payload.projectId?{project:{id:'p',roles:[legacy?{role:'frontend',label:'前端',member:'a'}:role]},revision:'rev'}:{}};
 };
 const {browser}=await loadBrowserThroughDsh(root,{react:React});await Renderer.act(async()=>{tree=Renderer.create(React.createElement(browser.CollaborationPanel,{call}));});
 t.after(async()=>{await Renderer.act(async()=>tree.unmount());if(previous===undefined)delete globalThis.confirm;else globalThis.confirm=previous;});
 const input=label=>tree.root.find(node=>node.props['aria-label']===label),button=text=>tree.root.findAllByType('button').find(node=>node.props.children===text);
 const click=text=>Renderer.act(async()=>button(text).props.onClick()),change=(label,value)=>Renderer.act(async()=>input(label).props.onChange({target:{value}}));
 const text=()=>JSON.stringify(tree.toJSON());
 await click('刷新项目和角色候选');await change('管理项目','p');await click('读取所选项目');await change('职责','frontend');await change('角色成员','a');
 return {input,button,click,change,text,calls,setFail:value=>fail=value,setWait:value=>wait=value,setName:value=>profileName=value};
}
test('qualification UI preserves real namesakes, explains disabled candidates, and renders invalid role profile without raw identity',async t=>{
 const f=await fixture(t),options=f.input('角色成员').findAllByType('option');
 assert.equal(options.length,7);assert.equal(options.find(node=>node.props.value==='a').props.disabled,false);assert.equal(options.find(node=>node.props.value==='b').props.disabled,false);
 assert.notEqual(options.find(node=>node.props.value==='a').props.children,options.find(node=>node.props.value==='b').props.children);
 for(const value of ['c','d','e','f'])assert.equal(options.find(node=>node.props.value===value).props.disabled,true);
 assert.match(f.text(),/部分不可核验/);assert.match(f.text(),/原职责成员/);assert.match(f.text(),/待重新分配/);assert.match(f.text(),/最近成功核验/);assert.ok(!f.text().includes('sensitive-official-raw-id'));
 await f.change('角色成员','c');assert.equal(f.button('确认角色分配').props.disabled,true);await f.click('确认角色分配');assert.equal(f.calls.filter(call=>call.payload?.action==='role').length,0,'Even a programmatic disabled-option change must not submit');
});
test('manual authority refresh retains old snapshot but blocks during loading and after failure, discards stale selected candidate',async t=>{
 const f=await fixture(t);assert.equal(f.button('确认角色分配').props.disabled,false);let finish;f.setWait(new Promise(resolve=>finish=resolve));let pending;
 await Renderer.act(async()=>{pending=f.button('刷新项目和角色候选').props.onClick();});assert.equal(f.button('确认角色分配').props.disabled,true);assert.match(f.text(),/正在权威核验/);assert.match(f.text(),/原职责成员/);
 f.setFail(true);await Renderer.act(async()=>{finish();await pending;});assert.equal(f.button('确认角色分配').props.disabled,true);assert.equal(f.input('角色成员').props.value,'');assert.match(f.text(),/旧快照/);
 await f.change('角色成员','a');await f.click('确认角色分配');assert.equal(f.calls.filter(call=>call.payload?.action==='role').length,0);
 f.setWait(null);f.setFail(false);await f.click('刷新项目和角色候选');assert.equal(f.button('确认角色分配').props.disabled,false);
});
test('legacy v4 snapshot remains usable and explicitly does not claim qualification synchronization success',async t=>{
 const f=await fixture(t,{legacy:true});assert.match(f.text(),/旧服务无法同步组织资格/);assert.equal(f.button('确认角色分配').props.disabled,false);await f.click('确认角色分配');assert.equal(f.calls.filter(call=>call.payload?.action==='role').length,1);
});
test('refresh status updates signed-in name at the top without another login',async t=>{
 const f=await fixture(t);assert.match(f.text(),/已登录：旧姓名/);f.setName('官方新姓名');await f.click('刷新状态');assert.match(f.text(),/已登录：官方新姓名/);assert.ok(!f.text().includes('已登录：旧姓名'));assert.equal(f.calls.filter(call=>call.method==='login.start').length,0);
});
