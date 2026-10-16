import test from'node:test';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';
import{Context}from'@deepseek-ai/cordis';import{Loader}from'@deepseek-ai/cordis-plugin-loader';import{createSnapshotStore}from'@deepseek-ai/dsh-client-store';
import React,{act}from'react';import{createRoot}from'react-dom/client';import{JSDOM}from'jsdom';
import{loadOfficialUi}from'./helpers/official-ui.mjs';import{loadBrowserThroughDsh}from'./helpers/browser-host.mjs';
import{installOfficialBrowserConnection}from'./helpers/official-connection.mjs';import{createMountedMemberHost}from'./helpers/member-host.mjs';

// Real Host member plugin + official browser codec/Host routing + settings shell/slots/loader. No listening server or real SSH.
test('official Host→module→entry-start→settings shell renders the sidebar and identity-only content, then removes and re-adds it',{timeout:5000},async()=>{
 const dom=new JSDOM('<!doctype html><html><head></head><body><div id="app"></div></body></html>',{url:'http://127.0.0.1:19999'});
 const previous={};for(const[key,value]of Object.entries({window:dom.window,document:dom.window.document,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true})){previous[key]=Object.getOwnPropertyDescriptor(globalThis,key);Object.defineProperty(globalThis,key,{value,writable:true,configurable:true});}
 const ctx=new Context();let root,fixture;const calls=[],slotErrors=[];
 try{
  const globals={document:dom.window.document,window:dom.window};
  const renderer=loadOfficialUi('@deepseek-ai/dsh-client-ui-renderer',{globals});const shell=loadOfficialUi('@deepseek-ai/dsh-client-ui-settings-general',{globals});
  const rendererFiber=ctx.plugin(renderer);await rendererFiber.await();ctx.slots.onEntryError((key,_entry,error)=>slotErrors.push({key,message:String(error)}));
  const localeSnapshot={revision:0},dictionaries=new Map();const locale={getSnapshot:()=>localeSnapshot,subscribe:()=>()=>{},register:(ns,dict)=>{dictionaries.set(ns,dict.zh);return()=>dictionaries.delete(ns);},bind:ns=>key=>dictionaries.get(ns)?.[key]??key};
  ctx.provide('locale',locale);ctx.slots.installLocale(locale);
  fixture=await createMountedMemberHost({legacySsh:false,configureMvpFixture:true});installOfficialBrowserConnection(ctx,fixture.host,{observe:row=>calls.push(row.method)});
  const remote={$host:{isLoopback:false},$on:()=>()=>{},settings:{}};ctx.provide('remote',remote);ctx.provide('remote.settings',remote.settings);
  ctx.provide('configForms',{developerTools:{enabled:createSnapshotStore(false),setEnabled:async()=>{}},describe:()=>createSnapshotStore({})});ctx.provide('shortcuts',{catalog:createSnapshotStore([]),register:()=>()=>{}});
  ctx.slots.provideRoot({hooks:{sessions:createSnapshotStore({phase:'ready',byId:{}})}});
  const absent=createSnapshotStore({key:undefined,hooks:{},keyedHooks:{},props:{}});ctx.slots.installScope('session',{current:absent,bindingSource:()=>absent});
  const frame=ctx.plugin({inject:['slots'],apply(active){active.slots.register({name:'root',children:{'sidebar.settings':{kind:'single',scope:'root'}}},({renderSlot})=>renderSlot('sidebar.settings',{wide:true}));}});await frame.await();
  const {modules,graph}=await loadBrowserThroughDsh(process.env.DSH_COLLABORATION_PACKAGE_ROOT??fileURLToPath(new URL('..',import.meta.url)),{react:React});
  const loaderFiber=ctx.plugin(Loader);await loaderFiber.await();ctx.loader.internal=modules;
  await modules.entries.start(ctx.loader,modules.manifest);await ctx.loader.await();assert.equal([...ctx.loader.entries()][0].fiber.state,2);
  const shellFiber=ctx.plugin(shell);await shellFiber.await();
  root=createRoot(dom.window.document.getElementById('app'));await act(async()=>{root.render(ctx.slots.renderSlot('root',{}));});
  const click=async text=>{const target=[...dom.window.document.querySelectorAll('button')].find(b=>b.textContent.trim()===text);assert.ok(target,'Missing rendered button '+text);await act(async()=>{target.dispatchEvent(new dom.window.MouseEvent('click',{bubbles:true}));});};
  await click('设置');assert.ok([...dom.window.document.querySelectorAll('[role="dialog"] nav button')].some(b=>b.textContent.trim()==='协作服务'));
  await click('协作服务');const section=dom.window.document.querySelector('section[aria-label="协作服务"]');assert.ok(section);assert.ok(section.textContent.includes('服务连接'));assert.ok(section.textContent.includes('钉钉扫码登录'));assert.ok(!section.querySelector('[aria-label="当前会话项目"]'));assert.ok(!/绑定新会话项目|查看已保存历史|查看本人及公共项目通信/.test(section.textContent));
  assert.equal(Boolean(section.querySelector('[role="alert"]')),false,'Screenshot regression: local status must load through real official RPC');assert.ok(section.textContent.includes('钉钉扫码登录'),'MVP settings must render the PC login surface');assert.ok(section.querySelector('input[aria-label="HTTPS服务地址"]'));assert.equal(section.querySelector('input[type="file"]'),null);assert.equal(fixture.remoteCalls,0);
  assert.ok(calls.length>0);assert.ok(calls.every(method=>['status','configuration.list'].includes(method)));
  await act(async()=>{await modules.entries.sync({rev:'empty',entries:[],batches:[]});});assert.equal(dom.window.document.querySelector('section[aria-label="协作服务"]'),null);assert.ok(![...dom.window.document.querySelectorAll('nav button')].some(b=>b.textContent.trim()==='协作服务'));
  await act(async()=>{await modules.entries.sync(graph);});await click('协作服务');assert.ok(dom.window.document.querySelector('section[aria-label="协作服务"]'));assert.deepEqual(slotErrors,[]);
 }finally{
  if(root)await act(async()=>root.unmount());await ctx.fiber.dispose();await fixture?.close();dom.window.close();for(const[key,descriptor]of Object.entries(previous)){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}
 }
});
