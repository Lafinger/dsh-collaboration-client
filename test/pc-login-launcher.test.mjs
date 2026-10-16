import test from 'node:test';import assert from 'node:assert/strict';import {EventEmitter} from 'node:events';import {Writable} from 'node:stream';import {fileURLToPath} from 'node:url';import {spawnSync} from 'node:child_process';import {join} from 'node:path';
import {validatePcLoginTarget,openPcDingTalk} from '../src/pc-login-launcher.mjs';import {HttpsMemberClient} from '../src/https-client.mjs';
const target=()=>{const origin='https://mvp.example',loginUrl=origin+'/collaboration/pc-login#'+'a'.repeat(43),u=new URL('dingtalk://dingtalkclient/action/openapp');u.search=new URLSearchParams({corpid:'ding-test',container_type:'work_platform',app_id:'0_123',redirect_type:'jump',redirect_url:loginUrl}).toString();return {origin,loginUrl,openUrl:u.href};};

test('only current same-origin work-platform login URL is allowed; no arbitrary desktop or browser opener',async()=>{
 const good=target();assert.equal(validatePcLoginTarget(good),good.openUrl);const mutate=fn=>{const next=target(),u=new URL(next.openUrl);fn(u);next.openUrl=u.href;return next;};
 const bad=[{...good,origin:'https://other.example'},{...good,loginUrl:good.loginUrl+'b'},...['file:///C:/Windows/notepad.exe','https://evil.example','ms-settings:','dingtalk://dingtalkclient/page/link?url=https://evil.example','dingtalk://dingtalkclient/action/openapp?'].map(openUrl=>({...good,openUrl})),mutate(u=>u.username='other'),mutate(u=>u.port='99'),mutate(u=>u.hash='extra'),mutate(u=>u.searchParams.set('container_type','browser')),mutate(u=>u.searchParams.set('app_id','evil')),mutate(u=>u.searchParams.set('redirect_type','other')),mutate(u=>u.searchParams.set('redirect_url','https://other.example/collaboration/pc-login#'+'a'.repeat(43))),mutate(u=>u.searchParams.set('redirect_url',good.loginUrl.replace('/pc-login','/oauth/callback'))),mutate(u=>u.searchParams.append('redirect_url',good.loginUrl)),mutate(u=>u.searchParams.set('extra','true'))];
 let spawns=0;for(const value of bad){assert.throws(()=>validatePcLoginTarget(value),e=>e.code===-32003);await assert.rejects(openPcDingTalk(value,{platform:'win32',spawnProcess:()=>{spawns++;throw Error('Must not spawn');}}),e=>e.code===-32003);}assert.equal(spawns,0);await assert.rejects(openPcDingTalk(good,{platform:'linux',spawnProcess:()=>{spawns++;}}),e=>e.code===-32011);assert.equal(spawns,0);
});

for(const outcome of ['success','nonzero','spawn-error','stdin-error','throw'])test('Windows launch '+outcome+' passes exact URL only on stdin and sanitizes failure',async()=>{
 const value=target(),records=[];
 const spawnProcess=(exe,args,opts)=>{records.push({exe,args,opts});if(outcome==='throw')throw Error('raw sensitive '+value.openUrl);const child=new EventEmitter();let input='';child.kill=()=>{};child.stdin=new Writable({write(chunk,_enc,next){input+=chunk.toString();next();},final(next){records[0].input=input;queueMicrotask(()=>{if(outcome==='spawn-error')child.emit('error',Error(value.openUrl));else if(outcome==='stdin-error')child.stdin.emit('error',Error(value.openUrl));else child.emit('close',outcome==='success'?0:2);});next();}});return child;};
 const result=openPcDingTalk(value,{platform:'win32',spawnProcess});if(outcome==='success')assert.deepEqual(await result,{status:'requested'});else await assert.rejects(result,e=>e.code===-32001&&!e.message.includes(value.openUrl)&&!e.message.includes('raw sensitive'));
 assert.equal(records.length,1);const r=records[0];assert.ok(r.exe.endsWith('powershell.exe'));assert.equal(r.args.at(-1),fileURLToPath(new URL('../src/windows-open-dingtalk.ps1',import.meta.url)));assert.ok(!JSON.stringify(r.args).includes('dingtalk://'));assert.equal(r.opts.shell,undefined);assert.deepEqual(r.opts.stdio,['pipe','ignore','ignore']);if(outcome!=='throw')assert.equal(r.input,value.openUrl);
});

test('pending reopen validates locally, serializes calls, refuses expired/logout and never starts another remote login',async()=>{
 const client=Object.create(HttpsMemberClient.prototype);Object.assign(client,{origin:'https://mvp.example',pendingLogin:{...target(),expiresAt:Date.now()+300000},login:null,stopped:false,launchTask:null});let count=0,finish;
 client.openLogin=()=>{count++;return new Promise(resolve=>finish=()=>resolve({status:'requested'}));};client.ensureTransport=()=>{throw Error('Reopen must not contact remote or issue another login');};
 const a=client.openPendingLogin(),b=client.openPendingLogin();assert.equal(a,b);await Promise.resolve();assert.equal(count,1);finish();assert.equal((await a).status,'requested');assert.equal(client.launchTask,null);
 client.pendingLogin.expiresAt=0;await assert.rejects(client.openPendingLogin(),e=>e.code===-32003);assert.equal(client.launchTask,null);assert.equal(count,1);client.pendingLogin=null;await assert.rejects(client.openPendingLogin(),e=>e.code===-32003);assert.equal(count,1);
});

test('actual Windows PowerShell helper rejects a non-DingTalk URL without launching or logging it',{skip:process.platform!=='win32'},()=>{
 const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),script=fileURLToPath(new URL('../src/windows-open-dingtalk.ps1',import.meta.url));
 const r=spawnSync(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{input:'https://offline.invalid/must-not-open',encoding:'utf8',windowsHide:true,timeout:10000});assert.equal(r.error,undefined);assert.equal(r.status,3);assert.equal(r.stdout,'');assert.equal(r.stderr,'');
});
