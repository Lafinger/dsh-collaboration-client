import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';
import React from 'react';import Renderer from 'react-test-renderer';import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';

test('actual admin form selects project before roles, confirms create/assignment with version and never exposes member lifecycle',async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),prior=globalThis.confirm;globalThis.confirm=()=>true;let tree;const calls=[];
 try{
  const {browser}=await loadBrowserThroughDsh(root,{react:React});let roles=[{role:'frontend',label:'前端',member:null}];
  const call=async(method,payload)=>{calls.push({method,payload});if(method==='status')return {configuration:{mode:'mvp-qr',webQrLogin:1,state:'configured',origin:'https://mvp.example'},authenticated:true,administrator:true,name:'Admin',account:'admin',expiresAt:Date.now()+100000};
   if(method==='administration'){if(payload.action==='create')return {project:{id:'p'}};if(payload.action==='role'){roles=[{...roles[0],member:payload.account}];return {ok:true};}return {projects:[{id:'p',key:'P',name:'Project'},{id:'q',key:'Q',name:'Other'}],members:[{account:'member',name:'Member'}],...payload.projectId?{project:{id:payload.projectId,roles},revision:'current-revision'}:{}};}throw Error(method);};
  await Renderer.act(async()=>{tree=Renderer.create(React.createElement(browser.CollaborationPanel,{call}));});
  const input=name=>tree.root.find(n=>n.props['aria-label']===name),button=text=>tree.root.findAllByType('button').find(n=>n.props.children===text);
  await Renderer.act(async()=>{input('项目标识').props.onChange({target:{value:'P'}});input('项目名称').props.onChange({target:{value:'Project'}});});
  await Renderer.act(async()=>button('创建项目').props.onClick());assert.equal(calls.filter(c=>c.payload?.action==='create').length,1);assert.ok(calls.find(c=>c.payload?.action==='create').payload.commandId);
  await Renderer.act(async()=>{input('职责').props.onChange({target:{value:'frontend'}});input('角色成员').props.onChange({target:{value:'member'}});});
  await Renderer.act(async()=>button('确认角色分配').props.onClick());const assigned=calls.find(c=>c.payload?.action==='role').payload;assert.equal(assigned.account,'member');assert.equal(assigned.revision,'current-revision');assert.equal(assigned.projectId,'p');
  await Renderer.act(async()=>input('管理项目').props.onChange({target:{value:'q'}}));assert.equal(tree.root.findAll(n=>n.props['aria-label']==='职责').length,0,'Old project role form must disappear until selected project loads');
  await Renderer.act(async()=>button('读取所选项目').props.onClick());assert.equal(input('职责').props.value,'');assert.ok(!calls.some(c=>['disable','enable','invite','administrator'].includes(c.payload?.action)));
 }finally{if(tree)await Renderer.act(async()=>tree.unmount());if(prior===undefined)delete globalThis.confirm;else globalThis.confirm=prior;}
});
