import test from'node:test';import assert from'node:assert/strict';import{spawn}from'node:child_process';import{fileURLToPath,pathToFileURL}from'node:url';import{join}from'node:path';import{tmpdir}from'node:os';
import{MemberClient}from'../src/member-client.mjs';
const packageRoot=process.env.DSH_COLLABORATION_PACKAGE_ROOT||fileURLToPath(new URL('..',import.meta.url));const{openSsh}=await import(pathToFileURL(join(packageRoot,'src/ssh.mjs')).href);
const script=fileURLToPath(new URL('fixtures/ssh-process.mjs',import.meta.url)),config={host:'offline.invalid',account:'fixture',identityFile:join(tmpdir(),'fixture-key'),knownHostsFile:join(tmpdir(),'fixture-hosts')};
for(const mode of['publickey','invalid-protocol','success'])test('actual local child-process stdio lifecycle '+mode+' is safe without SSH/network',{timeout:4000},async()=>{
 let child,closed,spawns=0;const client=new MemberClient({databasePath:':memory:',serviceId:'fixture',account:'fixture',requireLogin:true,loginOrigin:'https://login.example.test',connect:()=>openSsh(config,{spawnProcess:(_exe,args,options)=>{spawns++;assert.equal(args.at(-1),'collaboration-connect');child=spawn(process.execPath,[script,mode],options);closed=new Promise(resolve=>child.once('close',resolve));return child;}})});
 try{if(mode==='success'){const started=await client.beginLogin();assert.match(started.loginUrl,/^https:\/\/login.example.test\//);assert.equal(client.authStatus().authenticated,false);assert.ok(client.pendingLogin);}
 else await assert.rejects(client.beginLogin(),error=>{assert.equal(error.code,-32001);assert.ok(error.message.includes(mode==='publickey'?'SSH公钥认证失败':'非预期或超限协议内容'),error.message);assert.ok(!error.message.includes('fixture-sensitive-secret'));return true;});assert.equal(spawns,1);
 }finally{client.close();await closed;}
});
