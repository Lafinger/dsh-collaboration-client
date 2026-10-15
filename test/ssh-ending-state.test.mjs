import test from'node:test';import assert from'node:assert/strict';import{EventEmitter}from'node:events';import{PassThrough}from'node:stream';import{tmpdir}from'node:os';import{join}from'node:path';import{openSsh}from'../src/ssh.mjs';import{SshDiagnostics}from'../src/ssh-diagnostics.mjs';
const config={host:'fixture.invalid',account:'fixture',identityFile:join(tmpdir(),'key'),knownHostsFile:join(tmpdir(),'hosts')};
function childFixture(){const child=new EventEmitter();child.stdout=new PassThrough();child.stdin=new PassThrough();child.stderr=new PassThrough();child.kill=()=>true;return child;}
test('child already closed before openSsh returns preserves the actual termination reason',async()=>{
 const child=childFixture();const peer=await openSsh(config,{spawnProcess:()=>{queueMicrotask(()=>{child.emit('spawn');child.stderr.write('Permission denied (publickey).');child.stdout.end();child.emit('close',255,null);});return child;}});
 await assert.rejects(peer.request('initialize',{}),error=>{assert.match(error.message,/SSH公钥认证失败/);assert.ok(error.message.includes('255'));return true;});
});
test('no new RPC is sent after process exit while stderr is still draining',async()=>{
 const child=childFixture(),peer=await openSsh(config,{spawnProcess:()=>{queueMicrotask(()=>child.emit('spawn'));return child;}});let sends=0;child.stdin.on('data',()=>sends++);child.emit('exit',1,null);
 const pending=peer.request('collaboration/login/start',{proof:'fixture-sensitive-proof'});child.stderr.write('collaboration connector: connect ECONNREFUSED /private/service.sock');child.emit('close',1,null);
 await assert.rejects(pending,error=>{assert.match(error.message,/远端协作服务socket不可用/);assert.ok(!error.message.includes('fixture-sensitive-proof'));return true;});assert.equal(sends,0);
});
for(const stream of['stdout','stdin'])test(stream+' EPIPE waits for bounded SSH diagnostics without an unhandled error',async()=>{
 const child=childFixture(),peer=await openSsh(config,{spawnProcess:()=>{queueMicrotask(()=>child.emit('spawn'));return child;}});const pending=peer.request('initialize',{});child[stream].emit('error',Object.assign(Error('fixture-sensitive-error'),{code:'EPIPE'}));child.stderr.write('Permission denied (publickey).');child.emit('close',255,null);
 await assert.rejects(pending,error=>{assert.match(error.message,/SSH公钥认证失败/);assert.ok(!error.message.includes('fixture-sensitive-error'));return true;});assert.equal(peer.closed,true);
});
test('bounded classifier retains recognized failure without retaining raw credentials',()=>{
 const diagnostics=new SshDiagnostics();diagnostics.push('Permission denied (publickey).');diagnostics.push('token=fixture-sensitive-token '+ 'x'.repeat(65536));assert.ok(diagnostics.tail.length<=8192);const error=diagnostics.error({exitCode:255,signal:'SIG_BAD <secret>'});assert.match(error.message,/SSH公钥认证失败/);assert.ok(!JSON.stringify(error).includes('fixture-sensitive-token'));diagnostics.clear();assert.equal(diagnostics.tail,'');
});
