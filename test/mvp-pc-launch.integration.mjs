// OFFLINE: actual default Host plugin + official local RPC/browser module + HttpsMemberClient. Only remote peer and OS launch are fixtures.
import test from 'node:test';import assert from 'node:assert/strict';import {Context} from '@deepseek-ai/cordis';import {EventEmitter} from 'node:events';import {fileURLToPath} from 'node:url';
import React from 'react';import Renderer from 'react-test-renderer';import {createMountedMemberHost} from './helpers/member-host.mjs';import {installOfficialBrowserConnection} from './helpers/official-connection.mjs';import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';import {collaborationMeta} from '../src/protocol.mjs';
const root=process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url));
class LoginPeer extends EventEmitter{
 constructor(){super();this.closed=false;this.methods=[];}
 async request(method){this.methods.push(method);if(method==='initialize')return {protocolVersion:1,_meta:collaborationMeta(),authMethods:[{id:'dingtalk-device'}],serviceId:'fixture-mvp',agentCapabilities:{mvpHttps:true}};
  if(method==='collaboration/login/start'){const loginUrl='https://mvp.example/collaboration/pc-login#'+'a'.repeat(43),url=new URL('dingtalk://dingtalkclient/action/openapp');url.search=new URLSearchParams({corpid:'ding-test',container_type:'work_platform',app_id:'0_123',redirect_type:'jump',redirect_url:loginUrl}).toString();return {requestId:'synthetic-request',loginUrl,openUrl:url.href,pairingCode:'A'.repeat(16),expiresAt:Date.now()+300000};}
  if(method==='collaboration/login/claim')return {status:'pending'};throw Error('Unexpected remote operation '+method);
 }
 close(){this.closed=true;this.emit('disconnected');}
}
for(const failure of [false,true])test('one explicit login click automatically hands its exact pending URL to desktop opener; failure='+failure,async()=>{
 const fixture=await createMountedMemberHost({legacySsh:false,configureMvpFixture:true}),ctx=new Context(),peer=new LoginPeer(),opened=[],localMethods=[];let tree;
 try{
  fixture.entry.client.connect=async()=>peer;
  fixture.entry.client.openLogin=async target=>{opened.push(target);if(failure)throw Error('Synthetic launch failure containing URL must not be surfaced '+target.openUrl);return {status:'requested'};};
  installOfficialBrowserConnection(ctx,fixture.host,{observe:r=>localMethods.push(r.method)});const {browser}=await loadBrowserThroughDsh(root,{react:React});let row;browser.apply({connection:ctx.connection,slots:{inject:(_name,fn)=>fn(),register:(def,component)=>{row={def,component};return()=>{};}},inject:()=>{},on:()=>{}});
  await Renderer.act(async()=>{tree=Renderer.create(React.createElement(row.component,row.def.inject()));});assert.equal(opened.length,0);
  const button=label=>tree.root.findAllByType('button').find(b=>b.props.children===label);await Renderer.act(async()=>{await Promise.all([button('电脑钉钉登录').props.onClick(),button('电脑钉钉登录').props.onClick()]);});
  assert.equal(opened.length,1,'Screenshot regression: generating a link alone does not request desktop DingTalk to open');assert.equal(opened[0].origin,'https://mvp.example');assert.equal(opened[0].loginUrl,fixture.entry.client.pendingLogin.loginUrl);assert.equal(opened[0].openUrl,fixture.entry.client.pendingLogin.openUrl);
  assert.equal(peer.methods.filter(m=>m==='collaboration/login/start').length,1);assert.ok(JSON.stringify(tree.toJSON()).includes('核对码'));assert.equal(tree.root.findAllByType('a').length,0,'Electron denies custom scheme navigation: manual reopen also uses the Host, not a dingtalk href');
  if(failure){assert.match(JSON.stringify(tree.toJSON()),/未能自动打开电脑钉钉/);assert.ok(!JSON.stringify(tree.toJSON()).includes('Synthetic launch failure'));}
  else assert.match(JSON.stringify(tree.toJSON()),/已请求打开电脑钉钉/);
  await Renderer.act(async()=>button('刷新状态').props.onClick());assert.equal(opened.length,1,'Status polling never launches apps or starts a fresh request');
  await Renderer.act(async()=>button('重新打开电脑钉钉').props.onClick());assert.equal(opened.length,2);assert.equal(peer.methods.filter(m=>m==='collaboration/login/start').length,1,'Explicit reopen reuses the same pending request');assert.equal(localMethods.filter(m=>m==='login.open').length,1);assert.equal(fixture.remoteCalls,0);
  const injected=await ctx.connection.rpc.call('/api','collaboration/member',{method:'login.open',payload:{openUrl:'https://must-not-open.invalid'}});assert.equal(injected.ok,false);assert.equal(opened.length,2,'Browser cannot supply an open target');fixture.entry.client.pendingLogin.expiresAt=0;const expired=await ctx.connection.rpc.call('/api','collaboration/member',{method:'login.open',payload:{}});assert.equal(expired.ok,false);assert.equal(opened.length,2);assert.equal(peer.methods.filter(m=>m==='collaboration/login/start').length,1);
 }finally{if(tree)await Renderer.act(async()=>tree.unmount());await ctx.fiber.dispose();await fixture.close();}
});
