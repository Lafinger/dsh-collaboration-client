import test from'node:test';import assert from'node:assert/strict';import{fileURLToPath}from'node:url';
import React from'react';import Renderer from'react-test-renderer';import{loadBrowserThroughDsh}from'./helpers/browser-host.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));

test('settings identity panel selects/imports without hidden project/history calls, authenticates explicitly and requires logout to switch',async()=>{
 const {browser}=await loadBrowserThroughDsh(root,{react:React});let authenticated=false,pending=false;const calls=[];
 const configuration={state:'configured',source:'discovery',serviceId:'s',account:'alice',provider:'collaboration-remote',model:'server-agent',host:'example.test',port:19482,loginOrigin:'https://login.example.test',message:'完整'};
 const call=async(method,payload)=>{calls.push({method,payload});if(method==='status')return{configuration,authenticated,account:authenticated?'alice':null,expiresAt:Date.now()+3600000,switchRequiresLogout:authenticated||pending};
  if(method==='configuration.list')return{configuration,candidates:[{...configuration,id:'one/collaboration-client.json'}]};if(method==='configuration.select'||method==='configuration.auto'||method==='configuration.import'||method==='configuration.refresh')return configuration;
  if(method==='login.start'){pending=true;return{loginUrl:'https://login.example.test/collaboration/login/11111111-1111-1111-1111-111111111111'};}
  if(method==='login.claim'){authenticated=true;pending=false;return{authenticated:true};}if(method==='login.logout'){authenticated=false;pending=false;return{authenticated:false};}throw Error('Forbidden settings operation '+method);
 };
 let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(browser.CollaborationPanel,{call}));});
 const button=text=>tree.root.findAllByType('button').find(b=>b.props.children===text);
 await Renderer.act(async()=>tree.root.findByType('select').props.onChange({target:{value:'one/collaboration-client.json'}}));
 await Renderer.act(async()=>button('使用所选配置').props.onClick());assert.ok(calls.some(c=>c.method==='configuration.select'));
 const file={size:2,text:async()=>'{"fixture":true}'};await Renderer.act(async()=>tree.root.findByType('input').props.onChange({currentTarget:{files:[file],value:'chosen.json'}}));assert.ok(calls.some(c=>c.method==='configuration.import'));
 await Renderer.act(async()=>button('发起钉钉扫码登录').props.onClick());const link=tree.root.findByType('a');assert.match(link.props.href,/^https:\/\/login.example.test\//);assert.equal(link.props.rel,'noopener noreferrer');assert.equal(button('使用所选配置').props.disabled,true);
 await Renderer.act(async()=>button('我已扫码，完成登录').props.onClick());assert.ok(JSON.stringify(tree.toJSON()).includes('已登录：alice'));assert.equal(button('使用所选配置').props.disabled,true);
 assert.ok(!calls.some(c=>/project|history|communication|prompt/.test(c.method)));assert.equal(tree.root.findAllByType('pre').length,0);
 await Renderer.act(async()=>button('退出当前设备').props.onClick());assert.equal(button('恢复自动选择').props.disabled,false);
 await Renderer.act(async()=>tree.unmount());
});
test('identity panel serializes rapid double clicks before React state flush',async()=>{
 const {browser}=await loadBrowserThroughDsh(root,{react:React});let starts=0;const releases=[];const cfg={state:'configured'};
 const call=async method=>{if(method==='status')return{configuration:cfg,authenticated:false};if(method==='configuration.list')return{configuration:cfg,candidates:[]};if(method==='login.start'){starts++;return new Promise(resolve=>{releases.push(()=>resolve({loginUrl:'https://login.example.test/collaboration/login/11111111-1111-1111-1111-111111111111'}));});}throw Error(method);};
 let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(browser.CollaborationPanel,{call}));});const start=tree.root.findAllByType('button').find(b=>b.props.children==='发起钉钉扫码登录');
 await Renderer.act(async()=>{const first=start.props.onClick(),second=start.props.onClick();for(const release of releases)release();await first;await second;});assert.equal(starts,1);await Renderer.act(async()=>tree.unmount());
});
// Current-session project states are exercised at the actual model slot in official-model-project.integration.mjs.
