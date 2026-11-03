import test from 'node:test';import assert from 'node:assert/strict';import {fileURLToPath} from 'node:url';import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';
test('same-account status name refresh does not change browser identity revision or project menu identity',async()=>{
 const root=fileURLToPath(new URL('..',import.meta.url)),{browser}=await loadBrowserThroughDsh(root);let call,menu,name='旧姓名';
 const directory={store:{},load:async()=>{},select:async()=>{}};
 browser.apply({connection:{rpc:{call:async()=>({ok:true,value:{configuration:{serviceId:'one',webQrLogin:1},authenticated:true,account:'member-a',name}})}},on:()=>{},slots:{inject:(_name,fn)=>fn(),register:options=>{call=options.inject().call;}},inject:(_names,fn)=>fn({effect:()=>{},slots:{inject:(_name,fn)=>fn(),register:options=>{menu=options;}},modelDirectories:{directoryFor:()=>directory},sessions:{subagentAddress:()=>undefined}})});
 await call('status',{});const store=menu.inject('local').hooks.entryConfiguration,first=store.getSnapshot(),revision=first.identityRevision;name='官方新姓名';await call('status',{});const second=store.getSnapshot();assert.equal(second.identityRevision,revision);assert.equal(second.account,first.account);assert.equal(second.authenticated,true);
});
