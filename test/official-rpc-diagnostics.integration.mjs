import test from'node:test';import assert from'node:assert/strict';import{Context}from'@deepseek-ai/cordis';import{fileURLToPath}from'node:url';
import React from'react';import Renderer from'react-test-renderer';import{loadBrowserThroughDsh}from'./helpers/browser-host.mjs';
import{installMemberRpc}from'../src/member-rpc.mjs';import{createOfficialHostConnection,installOfficialBrowserConnection}from'./helpers/official-connection.mjs';

for(const failure of ['legacy-envelope','missing-host-route'])test('loaded settings reports '+failure+' explicitly without leaving a false loading state',async()=>{
 const host=createOfficialHostConnection(),ctx=new Context();let tree;try{
  const cfg={state:'configured',message:'fixture'},client={verifyAuthStatus:async()=>({authenticated:false})};
  if(failure==='legacy-envelope')installMemberRpc(host,{client,status:cfg});
  installOfficialBrowserConnection(ctx,host,{decorateResponse:failure==='legacy-envelope'?async response=>{const body=await response.json();return Response.json({...body,result:{ok:true,data:body.result.value}});}:undefined});
  const {browser}=await loadBrowserThroughDsh(process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url)),{react:React});let row;browser.apply({connection:ctx.connection,slots:{inject:(_name,fn)=>fn(),register:(def,component)=>{row={def,component};return()=>{};}},inject:()=>{},on:()=>{}});
  await Renderer.act(async()=>{tree=Renderer.create(React.createElement(row.component,row.def.inject()));});const alerts=tree.root.findAll(node=>node.props.role==='alert');assert.equal(alerts.length,1);const text=JSON.stringify(tree.toJSON());
  assert.ok(!text.includes('正在读取本机配置'),'A failed request must not still look like loading');assert.ok(text.includes(failure==='legacy-envelope'?'格式不兼容':'HTTP 404'));assert.equal(tree.root.findAllByType('button').find(button=>button.props.children==='电脑钉钉登录').props.disabled,true);assert.equal(tree.root.findAllByType('button').find(button=>button.props.children==='退出当前设备').props.disabled,false,'Explicit logout must remain available when status cannot be read');
 }finally{if(tree)await Renderer.act(async()=>tree.unmount());await ctx.fiber.dispose();await host.fiber.dispose();}
});
