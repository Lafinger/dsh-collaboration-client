import test from'node:test';import assert from'node:assert/strict';import{EventEmitter}from'node:events';import{PassThrough}from'node:stream';import{join}from'node:path';import{tmpdir}from'node:os';import{openSsh}from'../src/ssh.mjs';
const config={host:'fixture.example.test',account:'alice',identityFile:join(tmpdir(),'fixture-key'),knownHostsFile:join(tmpdir(),'fixture-hosts')};
function processFixture(){const child=new EventEmitter();child.stdin=new PassThrough();child.stdout=new PassThrough();child.stderr=new PassThrough();child.exitCode=null;child.signalCode=null;child.kills=0;child.kill=()=>{child.kills++;return true;};return child;}
async function connector(child){return openSsh(config,{spawnProcess:(_exe,_args,options)=>{assert.deepEqual(options.stdio,['pipe','pipe','pipe']);assert.equal(options.shell,false);queueMicrotask(()=>child.emit('spawn'));return child;}});}
const cases=[
 ['publickey','alice@fixture.example.test: Permission denied (publickey).\r\n',255,'SSH公钥认证失败'],
 ['changed-host','@@@@@@@@@ WARNING: REMOTE HOST IDENTIFICATION HAS CHANGED! @@@@@@@\r\nHost key verification failed.\n',255,'主机指纹已改变'],
 ['unknown-host','No ED25519 host key is known for fixture.example.test and you have requested strict checking.\nHost key verification failed.\n',255,'主机指纹校验失败'],
 ['missing-key','Warning: Identity file C:\\private\\secret.key not accessible: No such file or directory.\n',255,'本机私钥文件不可用'],
 ['refused','ssh: connect to host fixture.example.test port 19482: Connection refused\n',255,'SSH连接被拒绝'],
 ['timeout','ssh: connect to host fixture.example.test port 19482: Connection timed out\n',255,'SSH网络连接超时'],
 ['resolve','ssh: Could not resolve hostname fixture.example.test: No such host is known.\n',255,'SSH服务器地址无法解析'],
 ['remote-command','sh: 1: collaboration-connect: not found\n',127,'远端固定接入命令启动失败'],
 ['remote-socket','collaboration connector: connect ENOENT /private/server.sock\n',1,'远端协作服务socket不可用'],
 ['remote-mode','collaboration connector: Connector credential must be root-owned, account-group-readable and mode 0440\n',1,'远端connector凭据权限'],
 ['remote-version','collaboration connector: Collaboration protocol version mismatch; install matching client and server releases. No downgrade or replay.\n',1,'远端协作协议版本不匹配'],
 ['unknown','token=fixture-sensitive-token\nproof=fixture-sensitive-proof\n<PRIVATE KEY BODY>\n',1,'SSH／远端连接提前结束']
];
for(const[name,stderr,exitCode,message]of cases)test('SSH diagnostic '+name+' survives stdout EOF before child close without leaking raw stderr',async()=>{
 const child=processFixture(),peer=await connector(child);const pending=peer.request('initialize',{});child.stderr.write(stderr.slice(0,Math.floor(stderr.length/2)));child.stderr.write(stderr.slice(Math.floor(stderr.length/2)));
 child.stdout.end();await new Promise(resolve=>setImmediate(resolve));assert.equal(child.kills,0,'stdout EOF must not kill before exit/diagnostics arrive');child.exitCode=exitCode;child.emit('exit',exitCode,null);child.stderr.end();child.emit('close',exitCode,null);
 await assert.rejects(pending,error=>{assert.equal(error.code,-32001);assert.ok(error.message.includes(message),error.message);assert.ok(error.message.includes('initialize'));assert.ok(error.message.includes(String(exitCode)));const text=JSON.stringify({message:error.message,data:error.data});assert.ok(!/fixture-sensitive|private|secret\.key|PRIVATE KEY BODY|alice@/.test(text));return true;});assert.equal(peer.closed,true);assert.equal(peer.pending.size,0);
});
test('spawn failure is an actionable SSH-program error, not raw executable/config details',async()=>{
 const child=processFixture();await assert.rejects(openSsh(config,{spawnProcess:()=>{queueMicrotask(()=>child.emit('error',Object.assign(Error('spawn secret-executable ENOENT'),{code:'ENOENT'})));return child;}}),error=>{assert.equal(error.code,-32001);assert.match(error.message,/未找到本机SSH程序/);assert.ok(!error.message.includes('secret-executable'));return true;});
});
test('explicit close is immediate; a later exit does not replace it with an authentication diagnosis',async()=>{
 const child=processFixture(),peer=await connector(child);const pending=peer.request('initialize',{});peer.close();await assert.rejects(pending,error=>error.code===-32001);assert.equal(peer.closed,true);assert.equal(child.kills,1);child.stderr.end('Permission denied (publickey).');child.emit('close',255,null);
});
test('EOF without a child close remains bounded and never retries the submitted request',{timeout:2000},async()=>{
 const child=processFixture(),peer=await connector(child);let sends=0;child.stdin.on('data',()=>sends++);const pending=peer.request('collaboration/login/start',{proof:'fixture-private-proof',deviceId:'fixture'});child.stdout.end();await assert.rejects(pending,error=>{assert.equal(error.code,-32001);assert.match(error.message,/login\/start/);assert.ok(!error.message.includes('fixture-private-proof'));return true;});assert.equal(child.kills,1);assert.equal(sends,1);
});
