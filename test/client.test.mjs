import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { MemberClient } from '../src/member-client.mjs';
import { FakeService } from './helpers/fake-service.mjs';
import { sshArguments } from '../src/ssh.mjs';

function setup(t, options = {}) {
  const service = new FakeService();
  const client = new MemberClient({ databasePath: ':memory:', serviceId: 'fixture-service', account: 'alice', connect: async () => service.connect(), ...options });
  t.after(() => client.close()); return { client, service };
}
test('SSH connection is key-only, strict-host-checked, shell-free, and fixed remote command', () => {
  const args = sshArguments({ host: 'server.example', account: 'alice', identityFile: join(tmpdir(), 'key'), knownHostsFile: join(tmpdir(), 'known_hosts') });
  for (const option of ['StrictHostKeyChecking=yes','BatchMode=yes','PasswordAuthentication=no','ForwardAgent=no','ClearAllForwardings=yes']) assert.ok(args.includes(option));
  assert.equal(args.at(-1), 'workbench-connect'); assert.throws(() => sshArguments({ host: 'x;command', account: 'alice' }), /Invalid/);
});
test('identity/service mismatch fails before creating remote conversation', async t => {
  const { client,service } = setup(t, { connect: async () => service.connect({ account: 'bob' }) });
  await assert.rejects(client.open('local'), /identity\/service differs/); assert.equal(service.opens, 0);
});
test('stable local message id blocks duplicate submission and retains original remote mapping', async t => {
  const { client,service } = setup(t); await client.prompt('local', { messageId: 'm1', text: 'one' });
  const id = client.mapping('local').remote_id;
  await assert.rejects(client.prompt('local', { messageId: 'm1', text: 'one' }), /already submitted/);
  await client.prompt('local', { messageId: 'm2', text: 'two' }); assert.equal(client.mapping('local').remote_id,id); assert.equal(service.prompts.length,2); assert.equal(service.opens,1);
});
test('failed restore retains mapping, does not newSession and does not replay history', async t => {
  const { client,service } = setup(t); client.db.prepare('INSERT INTO client_mapping VALUES(?,?,?,?,0)').run('local','fixture-service','alice','missing');
  await assert.rejects(client.prompt('local',{ messageId:'m1',text:'new' }),/not available/); assert.equal(service.opens,0); assert.equal(service.prompts.length,0); assert.equal(client.mapping('local').remote_id,'missing');
});
test('automatic reconnect attaches same remote session and displays missed record without prompt retry', {timeout:5000}, async t => {
  let receive; const recovered = new Promise(resolve=>{receive=resolve;});
  const {client,service}=setup(t,{onHistory:h=>receive(h)}); await client.prompt('local',{messageId:'m1',text:'one'});
  const id=client.mapping('local').remote_id; service.sessions.get(id).events.push({seq:2,update:{sessionUpdate:'agent_message_chunk',content:{type:'text',text:'missed'}}});
  client.disconnect(); const h=await recovered; assert.equal(h.sessionId,id); assert.equal(h.events[0].update.content.text,'missed'); assert.equal(service.prompts.length,1); assert.equal(service.opens,1);
});
test('concurrent recovery/preparation share one activation',async t=>{
  const {client,service}=setup(t); const [a,b]=await Promise.all([client.open('local'),client.open('local')]); assert.equal(a.row.remote_id,b.row.remote_id); assert.equal(service.opens,1);
});
test('persisted submissions remain non-replayable after client restart',async t=>{
  const service=new FakeService(); const file=join(mkdtempSync(join(tmpdir(),'collab-client-')),'client.sqlite');
  const options={databasePath:file,account:'alice',serviceId:'fixture-service',connect:async()=>service.connect()};
  const first=new MemberClient(options); await first.prompt('local',{messageId:'m1',text:'one'}); const id=first.mapping('local').remote_id; first.close();
  const second=new MemberClient(options);t.after(()=>second.close()); await second.open('local'); await assert.rejects(second.prompt('local',{messageId:'m1',text:'one'}),/already submitted/); assert.equal(second.mapping('local').remote_id,id); assert.equal(service.prompts.length,1);
});
