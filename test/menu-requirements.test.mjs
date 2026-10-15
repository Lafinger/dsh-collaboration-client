import test from 'node:test';import assert from 'node:assert/strict';import{fileURLToPath}from'node:url';import{loadBrowserThroughDsh}from'./helpers/browser-host.mjs';

test('collaboration plugin replaces only the official model seat, never mounts the removed project dock',async()=>{
 const {browser}=await loadBrowserThroughDsh(fileURLToPath(new URL('..',import.meta.url))),registrations=[],waits=[];
 const ctx={connection:{rpc:{call:async()=>({ok:true,value:{}})}},on:()=>()=>{},effect:()=>()=>{},slots:{inject:(name,fn)=>{waits.push(name);return fn();},register:(spec,component)=>{registrations.push({spec,component});return()=>{};}},locale:{register:()=>()=>{},bind:()=>key=>key},modelDirectories:{},sessions:{},inject:(_deps,fn)=>fn(ctx)};
 browser.apply(ctx);
 assert.ok(!waits.includes('conversation.composer.dock'),'Old independent project panel must be removed');
 const menu=registrations.find(row=>row.spec.name==='conversation.input.model');assert.ok(menu,'Model-menu single seat missing');assert.ok(menu.spec.priority<0);assert.equal(typeof menu.component,'function');
 assert.equal(registrations.filter(row=>row.spec.name==='settings.section').length,1);
});
