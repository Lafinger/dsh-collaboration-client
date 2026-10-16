import test from 'node:test';import assert from 'node:assert/strict';import {Context} from '@deepseek-ai/cordis';import {fileURLToPath} from 'node:url';import {mkdtempSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';
import React from 'react';import Renderer from 'react-test-renderer';import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';import {createOfficialHostConnection,installOfficialBrowserConnection} from './helpers/official-connection.mjs';import {installMemberRpc} from '../src/member-rpc.mjs';import {MemberConnection} from '../src/member-connection.mjs';import {HttpsConnection} from '../src/https-connection.mjs';
const root=process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url));
// Actual legacy Connection + official local Host route and browser codec reproduce the live upgraded-UI/old-Host seam. No network/login/model.
for(const legacyAuthenticated of [false,true])test('MVP UI refuses old in-memory Host status and gives restart-only recovery; legacy authenticated='+legacyAuthenticated,async()=>{
 const host=createOfficialHostConnection(),ctx=new Context(),methods=[];let tree,entry;
 try{
  entry=new MemberConnection({input:{configFile:join(mkdtempSync(join(tmpdir(),'mvp-old-host-')),'absent.json')},env:{},createClient:()=>{throw Error('Legacy client must not be created');}});
  assert.match(entry.status.message,/选择或导入成员连接配置/);
  if(legacyAuthenticated){entry.client={login:{},busy:new Set(),verifyAuthStatus:async()=>({authenticated:true,account:'legacy-alice'}),close(){}};entry.run=async method=>{assert.equal(method,'verifyAuthStatus');return entry.client.verifyAuthStatus();};}
  installMemberRpc(host,{entry});installOfficialBrowserConnection(ctx,host,{observe:row=>methods.push(row.method)});
  const {browser}=await loadBrowserThroughDsh(root,{react:React});let row;browser.apply({connection:ctx.connection,slots:{inject:(_name,fn)=>fn(),register:(def,component)=>{row={def,component};return()=>{};}},inject:()=>{},on:()=>{}});
  await Renderer.act(async()=>{tree=Renderer.create(React.createElement(row.component,row.def.inject()));});
  const text=JSON.stringify(tree.toJSON());assert.match(text,/完整退出DSH/);assert.match(text,/后台.*旧版/);assert.ok(!text.includes('选择或导入成员连接配置'));assert.ok(!text.includes('已登录：legacy-alice'));
  const button=label=>tree.root.findAllByType('button').find(b=>b.props.children===label);
  for(const label of ['保存并连接','电脑钉钉登录','退出当前设备'])assert.equal(button(label).props.disabled,true,'No incompatible operation is offered by '+label);
  await Renderer.act(async()=>button('保存并连接').props.onClick());assert.deepEqual(methods,['status'],'Even a stale queued click cannot send an address to old backend');
  assert.equal(button('刷新状态').props.disabled,false);assert.equal(tree.root.findAllByType('a').length,0);assert.equal(tree.root.findAllByType('select').length,0);
 }finally{if(tree)await Renderer.act(async()=>tree.unmount());entry?.close();await ctx.fiber.dispose();await host.fiber.dispose();}
});

test('unconfigured real HTTPS Host remains usable even without a selected origin; only explicit user save performs discovery',async()=>{
 const host=createOfficialHostConnection(),ctx=new Context(),methods=[];let tree,entry,discoveries=0;
 try{
  entry=new HttpsConnection({base:mkdtempSync(join(tmpdir(),'mvp-new-host-')),createClient:()=>{throw Error('This test does not save address or create login');}});entry.readInfo=async()=>{discoveries++;throw Error('No discovery on rendering');};
  installMemberRpc(host,{entry});installOfficialBrowserConnection(ctx,host,{observe:row=>methods.push(row.method)});const {browser}=await loadBrowserThroughDsh(root,{react:React});let row;browser.apply({connection:ctx.connection,slots:{inject:(_name,fn)=>fn(),register:(def,component)=>{row={def,component};return()=>{};}},inject:()=>{},on:()=>{}});
  await Renderer.act(async()=>{tree=Renderer.create(React.createElement(row.component,row.def.inject()));});assert.ok(!JSON.stringify(tree.toJSON()).includes('后台仍是旧版'));assert.equal(tree.root.findAllByType('button').find(b=>b.props.children==='保存并连接').props.disabled,false);assert.equal(tree.root.findAllByType('button').find(b=>b.props.children==='电脑钉钉登录').props.disabled,true);assert.equal(discoveries,0);assert.deepEqual(methods,['status']);
  const result=await ctx.connection.rpc.call('/api','collaboration/member',{method:'login.start',payload:{}});assert.equal(result.ok,false);assert.match(result.error.message,/HTTPS服务地址/);assert.ok(!/导入|成员连接配置/.test(result.error.message));assert.equal(discoveries,0);
 }finally{if(tree)await Renderer.act(async()=>tree.unmount());entry?.close();await ctx.fiber.dispose();await host.fiber.dispose();}
});
