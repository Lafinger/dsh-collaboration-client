import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import React from 'react';import Renderer from 'react-test-renderer';
import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
test('MVP settings renders only address/browser QR identity for ordinary member and serializes rapid login clicks',async()=>{
 const {browser}=await loadBrowserThroughDsh(root,{react:React});const calls=[];let release,starts=0;
 const call=async(method,payload)=>{calls.push({method,payload});if(method==='status')return {configuration:{mode:'mvp-qr',webQrLogin:1,state:'configured',origin:'https://mvp.example',message:'MVP ready'},authenticated:false,busy:false};
  if(method==='login.start'){starts++;return new Promise(resolve=>release=()=>resolve({loginMethod:'dingtalk-qr',loginUrl:'https://mvp.example/collaboration/qr-login#'+'a'.repeat(43),expiresAt:Date.now()+300000}));}throw new Error('Unexpected method '+method);
 };
 let tree;await Renderer.act(async()=>{tree=Renderer.create(React.createElement(browser.CollaborationPanel,{call}));});
 const text=JSON.stringify(tree.toJSON());assert.ok(text.includes('钉钉扫码登录'));assert.ok(!text.includes('导入管理员'));assert.equal(tree.root.findAllByType('select').length,0);assert.ok(!text.includes('成员管理'));
 const button=tree.root.findAllByType('button').find(b=>b.props.children==='钉钉扫码登录');
 await Renderer.act(async()=>{const a=button.props.onClick(),b=button.props.onClick();release();await a;await b;});assert.equal(starts,1);assert.ok(!JSON.stringify(tree.toJSON()).includes('核对码：'));assert.ok(JSON.stringify(tree.toJSON()).includes('取消本次登录'));
 assert.ok(!calls.some(c=>c.method==='login.claim'||c.method==='administration'));await Renderer.act(async()=>tree.unmount());
});
test('MVP admin gets only create project and role controls, no member lifecycle or project ACL',async()=>{
 const {browser}=await loadBrowserThroughDsh(root,{react:React});let tree;
 const call=async method=>{if(method==='status')return {configuration:{mode:'mvp-qr',webQrLogin:1,state:'configured',origin:'https://mvp.example'},authenticated:true,name:'Admin',administrator:true,expiresAt:Date.now()+604800000};throw new Error(method);};
 await Renderer.act(async()=>{tree=Renderer.create(React.createElement(browser.CollaborationPanel,{call}));});const text=JSON.stringify(tree.toJSON());
 assert.ok(tree.root.findAllByType('button').some(b=>b.props.children==='创建项目'));assert.ok(!/停用成员|恢复成员|新增管理员|项目权限/.test(text));await Renderer.act(async()=>tree.unmount());
});
