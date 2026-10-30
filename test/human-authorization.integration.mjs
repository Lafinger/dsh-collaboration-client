import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AccessError } from '../src/protocol.mjs';
import { makeHumanAuthorization } from '../src/human-authorization.mjs';
import { createNaturalAttachmentHost, assertStoppedWithoutTechnicalTemplate, ARCHIVE_REQUEST, PROJECT_ID, PROJECT_NAME } from './helpers/natural-language-attachment-host.mjs';
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const visible = state => state.chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('');

test('real MemberClient wire preserves original human text and emits the exact negotiated v3 metadata', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  const { message } = await f.run(ARCHIVE_REQUEST);
  assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1);
  const sent = f.state.wirePrompts[0], grant = sent._meta.humanAuthorization;
  assert.equal(f.state.initialize._meta.collaborationProtocolVersion, 4);
  assert.deepEqual(f.state.initialize.clientCapabilities.attachmentTransfer, { version: 2 });
  assert.deepEqual(f.state.initialize.clientCapabilities.humanAuthorization, { version: 3 });
  assert.equal(sent.prompt[0].text, ARCHIVE_REQUEST);
  assert.deepEqual(Object.keys(grant).sort(), ['messageId', 'projectId', 'textSha256', 'version']);
  assert.equal(grant.version, 3);
  assert.equal(grant.messageId, message.id); assert.equal(grant.textSha256, hash(ARCHIVE_REQUEST)); assert.equal(grant.projectId, PROJECT_ID);
  assert.equal(sent._meta.attachments.length, 1);
  assert.equal('archiveAuthorized' in sent._meta.attachments[0], false, 'Manifests carry no action authorization');
  assert.equal(f.state.transfers.length, 1); assert.equal(f.state.connections, 0);
});

test('attachment turn without a bound project fails closed before any journal, byte read, or prompt', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, preselected: false }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  const finish = f.state.chunks.findLast(chunk => chunk.type === 'finish');
  assert.equal(finish?.reason.kind, 'error', 'No project binding means no silent forwarding of attachments');
  assert.ok(/项目/.test(finish?.reason.failure?.message ?? ''));
  assert.deepEqual(f.state.flushes, []);
  assert.equal(f.client.selectedProject(f.localId), null);
  assert.equal(f.state.hostReads, 0); assert.equal(f.state.wirePrompts.length, 0);
});

test('old peer without v3 capability cannot carry an attachment turn', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, humanCapability: null }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  const finish = f.state.chunks.findLast(chunk => chunk.type === 'finish');
  assert.equal(finish?.reason.kind, 'error', 'v3 capability is hard-paired; no attachment bytes without it');
  assert.equal(f.state.hostReads, 0); assert.equal(f.state.wirePrompts.length, 0); assert.equal(f.state.newSessionProject, undefined);
  assert.ok(/尚未绑定项目|授权元数据版本|版本/.test(finish?.reason.failure?.message ?? ''));
});
test('ambiguous fresh project names keep no selection; unprojected attachment turn fails closed', async t => {
  const projects = [{ id: PROJECT_ID, name: PROJECT_NAME }, { id: 'b'.repeat(32), name: PROJECT_NAME }];
  const f = await createNaturalAttachmentHost({ wire: true, preselected: false, projects }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  const finish = f.state.chunks.findLast(chunk => chunk.type === 'finish');
  assert.equal(finish?.reason.kind, 'error');
  assert.equal(f.state.flushes.length, 0); assert.equal(f.state.hostReads, 0); assert.equal(f.state.wirePrompts.length, 0);
});

test('prompt text never drives project binding; menu-selected project is the only source', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, preselected: false }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  const finish = f.state.chunks.findLast(chunk => chunk.type === 'finish');
  assert.equal(finish?.reason.kind, 'error');
  assert.equal(f.client.selectedProject(f.localId), null, 'Natural-language project mentions never create a binding');
  assert.equal(f.state.hostReads, 0); assert.equal(f.state.wirePrompts.length, 0);
});

test('text-only turn without a bound project cannot open an unbound remote session', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, preselected: false }); t.after(() => f.close());
  await f.run('帮我做个方案', { selection: 'none' });
  const finish = f.state.chunks.findLast(chunk => chunk.type === 'finish');
  assert.equal(finish?.reason.kind, 'error', 'login-required clients need a menu-selected project before any remote session');
  assert.ok(/项目/.test(finish?.reason.failure?.message ?? ''));
  assert.equal(f.state.wirePrompts.length, 0);
  assert.equal(f.state.hostReads, 0);
});

test('bare selected attachment then natural purpose answer forwards both turns untouched', async t => {
  const f = await createNaturalAttachmentHost(); t.after(() => f.close());
  await f.run('处理一下');
  assert.equal(f.state.hostReads, 1); assert.equal(f.state.prompts.length, 1);
  await f.run('归档刚才那份', { selection: 'none' });
  assert.equal(f.state.prompts.length, 2); assert.equal(f.state.prompts[1].text, '归档刚才那份');
  assert.equal(f.state.prompts[1].entry, undefined, 'No new selection means no attachment entry at all');
});

test('draft positive uses actual synthetic document contents and makes no formal business registration', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请分析这份需求并整理草稿，暂时不要归档。'); assertStoppedWithoutTechnicalTemplate(f.state);
  const fact = f.bytes.toString('utf8').split('\n').find(line => line.startsWith('合成目标：')).slice('合成目标：'.length);
  assert.ok(visible(f.state).includes(fact)); assert.ok(visible(f.state).includes('未正式登记'));
  assert.equal(f.state.transfers[0].manifest.projectId, PROJECT_ID);
  assert.equal(f.state.businessWrites, 0);
});

for (const [label, proof, expected] of [
  ['matching typed admission rejection', requestId => ({ requestId, executionState: 'not_started' }), 'not_started'],
  ['bare parameter error without proof', () => undefined, 'unknown'],
  ['wrong request proof', () => ({ requestId: 'f'.repeat(64), executionState: 'not_started' }), 'unknown'],
  ['transport error without proof', () => undefined, 'unknown'],
]) test(`${label} remains a readable host error with correct persisted state and no retry`, async t => {
  const f = await createNaturalAttachmentHost({ wire: true, onPrompt: ({ params }) => {
    throw new AccessError(label.startsWith('transport') ? -32001 : -32602, 'INTERNAL project_id:' + PROJECT_ID, proof(params._meta.requestId));
  } }); t.after(() => f.close());
  const { message } = await f.run(ARCHIVE_REQUEST);
  assert.equal(f.state.thrown, undefined);
  assert.equal(f.state.chunks.findLast(chunk => chunk.type === 'finish')?.reason.kind, 'error');
  assert.equal(f.state.chunks.findLast(chunk => chunk.type === 'finish')?.reason.failure.code, 'COLLABORATION_NO_REPLAY');
  assert.ok(/[\u3400-\u9fff]/u.test(visible(f.state))); assert.ok(!visible(f.state).includes(PROJECT_ID)); assert.ok(!visible(f.state).includes('project_id'));
  assert.equal(f.client.db.prepare('SELECT state FROM client_submissions WHERE local_id=? AND message_id=?').get(f.localId, message.id).state, expected);
  await f.client.recoverAll(); assert.equal(f.state.wirePrompts.length, 1); assert.equal(f.state.transfers.length, 0);
});

test('trusted partial successes show material name/version, retain overall unknown/error and never replay', async t => {
  const materialId = 'e'.repeat(32), receiptId = 'd'.repeat(64);
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: ({ state, params }) => {
    state.businessWrites++;
    throw new AccessError(-32001, 'private failure', { requestId: params._meta.requestId, operationResults: [
      { kind: 'attachment_transfer', receipt_id: receiptId, name: '合成需求.md' },
      { kind: 'material_archive', receipt_id: receiptId, name: '合成需求.md', material_id: materialId, version: 2 },
    ] });
  } }); t.after(() => f.close());
  const { message } = await f.run(ARCHIVE_REQUEST);
  assert.equal(f.state.chunks.findLast(chunk => chunk.type === 'finish')?.reason.kind, 'error');
  const text = visible(f.state); assert.ok(text.includes('合成需求.md')); assert.ok(text.includes('第2版')); assert.ok(text.includes('尚未确认'));
  for (const hidden of [materialId, receiptId, 'receipt_id', 'material_id']) assert.ok(!text.includes(hidden));
  assert.equal(f.client.db.prepare('SELECT state FROM client_submissions WHERE message_id=?').get(message.id).state, 'unknown');
  await f.client.recoverAll(); assert.equal(f.state.wirePrompts.length, 1); assert.equal(f.state.businessWrites, 1);
});

test('unmatched partial operationResults cannot manufacture an archived fact', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, onPrompt: () => { throw new AccessError(-32602, 'untrusted mismatch', {
    requestId: 'f'.repeat(64), operationResults: [{ kind: 'material_archive', receipt_id: 'd'.repeat(64), name: '不能伪造的结果.md', version: 9 }],
  }); } }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  assert.equal(f.state.chunks.findLast(chunk => chunk.type === 'finish')?.reason.kind, 'error');
  assert.ok(!visible(f.state).includes('不能伪造的结果')); assert.ok(!visible(f.state).includes('第9版')); assert.equal(f.state.wirePrompts.length, 1);
});

test('tampered current human hash is rejected before remote session or submission creation', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  const messageId = 'tampered-human-message', text = ARCHIVE_REQUEST;
  const humanAuthorization = makeHumanAuthorization({ messageId, text, projectId: PROJECT_ID }); humanAuthorization.textSha256 = '0'.repeat(64);
  await assert.rejects(f.client.prompt(f.localId, { messageId, text, attachmentEntry: { items: [], humanAuthorization } }), error => error.code === -32013);
  assert.equal(f.state.newSessionProject, undefined); assert.equal(f.state.wirePrompts.length, 0);
  assert.equal(f.client.db.prepare('SELECT count(*) n FROM client_submissions').get().n, 0);
});

function publishOperation({ client, state, params }, operationResult, requestId = params._meta.requestId) {
  state.publishedOperations = (state.publishedOperations ?? 0) + 1;
  client.peer.emit('message', { method: 'session/update', params: { sessionId: params.sessionId,
    update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: JSON.stringify(operationResult) }, _meta: { requestId, operationResult } },
    _meta: { sequence: 100 + state.publishedOperations },
  } });
}

for (const [flags, phrase] of [
  [{}, '已归档为第2版'], [{ deduplicated: true }, '内容未变，沿用第2版'], [{ already_archived: true }, '此前已归档为第2版，本轮没有新增版本'],
]) test(`trusted normal operation publication projects once without raw JSON: ${phrase}`, async t => {
  const materialId = 'e'.repeat(32);
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: context => {
    const operation = { kind: 'material_archive', receipt_id: context.state.attachments[0].attachmentId, name: '可读需求.md', material_id: materialId, version: 2, ...flags };
    publishOperation(context, operation); publishOperation(context, operation);
  } }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  const text = visible(f.state); assert.ok(text.includes(phrase)); assert.equal(text.split('可读需求.md').length - 1, 1);
  for (const hidden of [materialId, 'receipt_id', 'material_id']) assert.ok(!text.includes(hidden));
  assert.equal(f.state.wirePrompts.length, 1);
});

test('operation publication bound to another request cannot become current readable success evidence', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: context => publishOperation(context, {
    kind: 'material_archive', receipt_id: context.state.attachments[0].attachmentId, name: '错误轮次的资料.md', material_id: 'e'.repeat(32), version: 9,
  }, 'f'.repeat(64)) }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.ok(!visible(f.state).includes('错误轮次')); assert.ok(!visible(f.state).includes('第9版')); assert.ok(!visible(f.state).includes('material_id'));
});

test('reconstructed same-db client keeps no restore or receipt context maps', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  const before = f.state.wirePrompts.length, old = f.client, mapping = old.mapping(f.localId), login = old.login;
  f.rebuild(); assert.notEqual(f.client, old); assert.equal(f.client.login, login); assert.deepEqual(f.client.mapping(f.localId), mapping);
  assert.equal(f.state.clientInstances, 2);
  assert.equal('restoreContexts' in f.client, false, 'Restore context machinery is gone');
  assert.equal('lastAttachmentRequests' in f.client, false, 'Receipt grant machinery is gone');
  await f.run('确认', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, before + 1, 'Reconstruction forwards the new turn normally');
});

test('archive operation published before the prompt reply still projects exactly once', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: context => {
    publishOperation(context, { kind: 'material_archive', receipt_id: context.state.attachments[0].attachmentId, name: '顺序无关.md', material_id: 'e'.repeat(32), version: 3 });
  } }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.ok(visible(f.state).includes('顺序无关.md')); assert.ok(visible(f.state).includes('第3版'));
  assert.equal(f.state.wirePrompts.length, 1);
});
