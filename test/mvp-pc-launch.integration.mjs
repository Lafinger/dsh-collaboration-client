// OFFLINE migration regression: actual default Host plugin + official RPC/codec/browser module. Only official remote and OS launch are fixtures.
import test from 'node:test';import assert from 'node:assert/strict';import {Context} from '@deepseek-ai/cordis';import {EventEmitter} from 'node:events';import {fileURLToPath} from 'node:url';
import React from 'react';import Renderer from 'react-test-renderer';import {createMountedMemberHost} from './helpers/member-host.mjs';import {installOfficialBrowserConnection} from './helpers/official-connection.mjs';import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';import {collaborationMeta} from '../src/protocol.mjs';
const root=process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url));
class LoginPeer extends EventEmitter{
 constructor(){super();this.closed=false;this.methods=[];this.started=null;this.cancelled=false;}
 async request(method,p){this.methods.push(method);if(method==='initialize'){assert.equal(p.clientCapabilities.webQrLogin,1);return {protocolVersion:1,_meta:collaborationMeta(),authMethods:[{id:'dingtalk-device'}],serviceId:'fixture-mvp',agentCapabilities:{mvpHttps:true,mvpHttpsVersion:2,loginMethod:'dingtalk-qr'}};}
 if(method==='collaboration/login/start'){const loginUrl='https://mvp.example/collaboration/qr-login#'+'a'.repeat(43);return this.started??={requestId:'synthetic-request',loginUrl,openUrl:loginUrl,loginMethod:'dingtalk-qr',expiresAt:Date.now()+300000};}
 if(method==='collaboration/login/claim')return {status:'pending'};if(method==='collaboration/login/cancel'){this.cancelled=true;return {status:'cancelled'};}throw Error('Unexpected remote operation '+method);}
 close(){this.closed=true;this.emit('disconnected');}
}
for(const failure of [false,true])test('PC entry replaced: one explicit QR click opens exact trusted browser request; OS failure='+failure,async()=>{
 const fixture=await createMountedMemberHost({legacySsh:false,configureMvpFixture:true}),ctx=new Context(),peer=new LoginPeer(),opened=[],localMethods=[];let tree;
 try{
 fixture.entry.client.connect=async()=>peer;
 // Protect-only fixture avoids system DPAPI in Linux CI; actual Windows synthetic DPAPI is separately exercised.
 let protectedValue;fixture.entry.client.vault={load:()=>protectedValue??null,save:value=>protectedValue=structuredClone(value),clear:()=>protectedValue=null};
 fixture.entry.client.openLogin=async target=>{opened.push(target);if(failure)throw Error('Synthetic launch failure '+target.openUrl);return {status:'requested'};};
 installOfficialBrowserConnection(ctx,fixture.host,{observe:r=>localMethods.push(r.method)});const {browser}=await loadBrowserThroughDsh(root,{react:React});let row;browser.apply({connection:ctx.connection,slots:{inject:(_name,fn)=>fn(),register:(def,component)=>{row={def,component};return()=>{};}},inject:()=>{},on:()=>{}});
 await Renderer.act(async()=>{tree=Renderer.create(React.createElement(row.component,row.def.inject()));});assert.equal(opened.length,0);
 const button=label=>tree.root.findAllByType('button').find(b=>b.props.children===label);await Renderer.act(async()=>{await Promise.all([button('钉钉扫码登录').props.onClick(),button('钉钉扫码登录').props.onClick()]);});
 assert.equal(opened.length,1,'Generating a link alone must not count as opening the system browser');assert.equal(opened[0].origin,'https://mvp.example');assert.equal(opened[0].loginUrl,fixture.entry.client.pendingLogin.loginUrl);assert.equal(opened[0].openUrl,opened[0].loginUrl);assert.equal(peer.methods.filter(m=>m==='collaboration/login/start').length,1);assert.equal(tree.root.findAllByType('a').length,0);assert.ok(!JSON.stringify(tree.toJSON()).includes('核对码：'));assert.equal(button('我已扫码，完成登录'),undefined);assert.equal(button('电脑钉钉登录'),undefined);
 assert.match(JSON.stringify(tree.toJSON()),failure?/未能自动打开默认浏览器/:/已请求打开默认浏览器/);assert.ok(!JSON.stringify(tree.toJSON()).includes('Synthetic launch failure'));
 await Renderer.act(async()=>button('刷新状态').props.onClick());assert.equal(opened.length,1);
 await Renderer.act(async()=>button('重新打开扫码页面').props.onClick());assert.equal(opened.length,2);assert.equal(peer.methods.filter(m=>m==='collaboration/login/start').length,1);assert.equal(localMethods.filter(m=>m==='login.open').length,1);assert.equal(fixture.remoteCalls,0);
 const injection=await ctx.connection.rpc.call('/api','collaboration/member',{method:'login.open',payload:{openUrl:'https://must-not-open.invalid'}});assert.equal(injection.ok,false);assert.equal(opened.length,2);
 await Renderer.act(async()=>button('取消本次登录').props.onClick());assert.equal(peer.cancelled,true);assert.equal(fixture.entry.client.pendingLogin,null);assert.equal(button('重新打开扫码页面'),undefined);assert.equal(opened.length,2);
 }finally{if(tree)await Renderer.act(async()=>tree.unmount());await ctx.fiber.dispose();await fixture.close();}
});
