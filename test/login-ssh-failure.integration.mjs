import test from'node:test';import assert from'node:assert/strict';import{Context}from'@deepseek-ai/cordis';import{EventEmitter}from'node:events';import{PassThrough}from'node:stream';import{fileURLToPath,pathToFileURL}from'node:url';import{join}from'node:path';
import React from'react';import Renderer from'react-test-renderer';import{collaborationMeta}from'../src/protocol.mjs';
const packageRoot=process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url));const{openSsh}=await import(pathToFileURL(join(packageRoot,'src/ssh.mjs')).href);
import{createMountedMemberHost}from'./helpers/member-host.mjs';import{installOfficialBrowserConnection}from'./helpers/official-connection.mjs';import{loadBrowserThroughDsh}from'./helpers/browser-host.mjs';

// Replay the OpenSSH failure stream, not a fake MemberClient.request rejection. No process/network is started.
const scenarios=[['publickey','alice@example.test: Permission denied (publickey).\r\n',255,'SSH公钥认证失败'],['remote-socket','collaboration connector: connect ECONNREFUSED /private/secret.sock\n',1,'远端协作服务socket不可用'],['remote-version','collaboration connector: Collaboration protocol version mismatch\n',1,'远端协作协议版本不匹配'],['login-start','fixture-private-token and proof must not be exposed\n',1,'SSH／远端连接提前结束']];
for(const[name,stderr,exitCode,expected]of scenarios)test('login click diagnoses '+name+' rather than the generic stdout EOF symptom',{timeout:3000},async()=>{
 const fixture=await createMountedMemberHost(),ctx=new Context();let tree,spawns=0,kills=0;const requests=[];
 try{
  fixture.entry.client.connect=()=>openSsh(fixture.config.ssh,{spawnProcess:(_command,args,options)=>{
   spawns++;assert.equal(args.at(-1),'collaboration-connect');const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.stderr=new PassThrough();child.kill=()=>{kills++;return true;};
   child.stdin.on('data',chunk=>{const message=JSON.parse(String(chunk));requests.push(message.method);queueMicrotask(()=>{if(name==='login-start'&&message.method==='initialize'){child.stdout.write(JSON.stringify({jsonrpc:'2.0',id:message.id,result:{protocolVersion:1,_meta:collaborationMeta(),authMethods:[{id:'dingtalk-device'}]}})+'\n');return;}child.stdout.end();setImmediate(()=>{child.stderr.write(stderr);child.exitCode=exitCode;child.emit('exit',exitCode,null);child.stderr.end();child.emit('close',exitCode,null);});});});
   queueMicrotask(()=>child.emit('spawn'));return child;
  }});
  installOfficialBrowserConnection(ctx,fixture.host);const {browser}=await loadBrowserThroughDsh(process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url)),{react:React});let row;
  browser.apply({connection:ctx.connection,slots:{inject:(_name,fn)=>fn(),register:(def,component)=>{row={def,component};return()=>{};}},inject:()=>{},on:()=>{}});
  await Renderer.act(async()=>{tree=Renderer.create(React.createElement(browser.LegacyCollaborationPanel,row.def.inject()));});assert.equal(tree.root.findAll(node=>node.props.role==='alert').length,0);
  const button=tree.root.findAllByType('button').find(button=>button.props.children==='发起钉钉扫码登录');await Renderer.act(async()=>button.props.onClick());const alert=tree.root.find(node=>node.props.role==='alert');
  assert.ok(String(alert.props.children).includes(expected),'Current symptom: '+String(alert.props.children));assert.ok(!String(alert.props.children).includes('Connection ended'));
  assert.equal(spawns,1);assert.equal(kills,0);assert.ok(String(alert.props.children).includes(String(exitCode)));assert.ok(!/private|secret\.sock/.test(String(alert.props.children)));assert.deepEqual(requests,name==='login-start'?['initialize','collaboration/login/start']:['initialize']);assert.ok(!String(alert.props.children).includes('fixture-private-token'));assert.ok(String(alert.props.children).includes(name==='login-start'?'collaboration/login/start':'initialize'));assert.equal(fixture.entry.client.pendingLogin,null);assert.equal(fixture.entry.client.login,null);assert.equal(fixture.entry.operations,0);assert.equal(tree.root.findAllByType('a').length,0);assert.equal(fixture.remoteCalls,0);
 }finally{if(tree)await Renderer.act(async()=>tree.unmount());await ctx.fiber.dispose();await fixture.close();}
});
