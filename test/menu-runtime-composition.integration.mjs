import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {Context,Service} from '@deepseek-ai/cordis';
import {Loader} from '@deepseek-ai/cordis-plugin-loader';
import React,{act} from 'react';
import {JSDOM} from 'jsdom';
import {createSnapshotStore} from '@deepseek-ai/dsh-client-store';
import {loadOfficialUi} from './helpers/official-ui.mjs';
import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';

test('official Loader and traced Remote services render project rows without abdicating the model slot',async()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>',{url:'http://127.0.0.1:19999'}),prior={};
 for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,Node:dom.window.Node,HTMLInputElement:dom.window.HTMLInputElement,HTMLButtonElement:dom.window.HTMLButtonElement,IS_REACT_ACT_ENVIRONMENT:true})){prior[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const ctx=new Context(),errors=[],calls=[];let root;
 try{
  const renderer=loadOfficialUi('@deepseek-ai/dsh-client-ui-renderer',{globals:{window:dom.window,document:dom.window.document}});await ctx.plugin(renderer).await();ctx.slots.onEntryError((key,_entry,error)=>errors.push({key,message:String(error)}));
  const {modules,graph}=await loadBrowserThroughDsh(process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url)),{react:React});
  const configuration={state:'configured',provider:'collaboration-remote',model:'server-agent',serviceId:'s',account:'alice'};
  ctx.provide('connection',{rpc:{call:async(_path,_endpoint,{method,payload})=>{calls.push(method);return{ok:true,value:{configuration,localId:payload.localId,scopeId:'scope',authenticated:true,mapped:false,busy:false,uncertain:false,projectId:null,provider:configuration.provider,model:configuration.model,...method==='project.menu'?{projects:[{id:'p',key:'P',name:'项目甲'}]}:{}}};}}});
  await ctx.plugin(Loader).await();ctx.loader.internal=modules;await modules.entries.start(ctx.loader,modules.manifest);await ctx.loader.await();
  const sessionId='local',projection=createSnapshotStore({lastUsed:null,next:null}),sessionState=createSnapshotStore({blank:true}),scope=ctx.extend({});
  const binding={key:sessionId,ctx:scope,hooks:{},keyedHooks:{},props:{sessionId},session:{projections:{faceOf:()=>projection},getSnapshot:sessionState.getSnapshot}},source=createSnapshotStore(binding);
  ctx.slots.installScope('session',{current:source,bindingSource:()=>source,renderArea:(current,props)=>typeof props.children==='function'?props.children(current):props.children});
  ctx.provide('sessions',{scope:()=>scope,binding:()=>binding,subagentAddress:()=>undefined});ctx.provide('commandUi',{register:()=>()=>{}});
  const dictionaries=new Map(),localeSource=createSnapshotStore({revision:0}),locale={...localeSource,register:(ns,dicts)=>{dictionaries.set(ns,dicts.zh);return()=>dictionaries.delete(ns);},bind:ns=>(key,params={})=>(dictionaries.get(ns)?.[key]??key).replace(/\{(\w+)\}/g,(_m,name)=>params[name]??'')};ctx.provide('locale',locale);ctx.slots.installLocale(locale);
  const catalog={default:{provider:'collaboration-remote',model:'server-agent'},groups:[{id:'ordinary',name:'普通提供商',models:[{id:'normal',name:'普通模型'}]},{id:'collaboration-remote',name:'Collaboration',models:[{id:'server-agent',name:'项目选择'}]}],failures:[]};
  // Service tracing routes remote.session through the caller's inject declaration.
  // Plain ctx.provide('remote', {session}) bypassed this check in the previous regression.
  await ctx.plugin({apply(active){new class extends Service{$on(){return()=>{};}}(active,'remote');}}).await();
  await ctx.plugin({apply(active){new class extends Service{modelCatalog(){return Promise.resolve({ok:true,value:catalog});}selectModel(){throw Error('No model selection in rendering regression');}}(active,'remote.session');}}).await();
  const selection=loadOfficialUi('@deepseek-ai/dsh-client-ui-model-selection',{globals:{window:dom.window,document:dom.window.document},sourcePath:process.env.DSH_MENU_DIAGNOSIS_ARTIFACTS?resolve(process.env.DSH_MENU_DIAGNOSIS_ARTIFACTS,'installed-dsh-client-ui-model-selection-client.js'):undefined});await ctx.plugin(selection).await();
  await ctx.plugin({inject:['slots'],apply(active){active.slots.register({name:'root',children:{'conversation.input.model':{kind:'single',scope:'session'}}},({renderSlot})=>renderSlot('conversation.input.model',{locked:false}));}}).await();
  const {createRoot}=await import('react-dom/client');root=createRoot(dom.window.document.getElementById('app'));await act(async()=>root.render(ctx.slots.renderSlot('root',{})));
  assert.deepEqual(errors,[]);assert.ok(dom.window.document.querySelector('.dsh-collaboration-model'),'Real composition must not abdicate to the official 项目选择 row');
  const initialEntries=ctx.slots.entriesOfSlot('conversation.input.model');assert.equal(initialEntries.length,1);assert.equal(initialEntries[0].locale,'collaboration-model-menu');
  const click=async element=>{assert.ok(element);await act(async()=>element.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true})));};await click(dom.window.document.querySelector('button[aria-haspopup="menu"]'));await click([...dom.window.document.querySelectorAll('button')].find(button=>button.getAttribute('role')==='menuitem'&&button.textContent.startsWith('模型')));
  assert.ok([...dom.window.document.querySelectorAll('button')].some(button=>button.title==='P · 项目甲'));assert.ok(![...dom.window.document.querySelectorAll('button')].some(button=>button.textContent==='项目选择'));assert.deepEqual(errors,[]);assert.equal(calls.filter(method=>method==='project.menu').length,1);
  await act(async()=>modules.entries.sync({rev:'unloaded',entries:[],batches:[]}));assert.equal(dom.window.document.querySelector('.dsh-collaboration-model'),null);assert.equal(ctx.slots.entriesOfSlot('conversation.input.model').length,1);
  await act(async()=>modules.entries.sync(graph));assert.ok(dom.window.document.querySelector('.dsh-collaboration-model'));assert.deepEqual(errors,[]);
 }finally{if(root)await act(async()=>root.unmount());await ctx.fiber.dispose();dom.window.close();for(const[key,descriptor]of Object.entries(prior)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
