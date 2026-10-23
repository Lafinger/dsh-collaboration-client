import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { AccessError } from '../src/protocol.mjs';
import { makeHumanAuthorization } from '../src/human-authorization.mjs';
import { createNaturalAttachmentHost, assertStoppedWithoutTechnicalTemplate, ARCHIVE_REQUEST, PROJECT_ID, PROJECT_NAME } from './helpers/natural-language-attachment-host.mjs';
const hash = text => createHash('sha256').update(text, 'utf8').digest('hex');
const visible = state => state.chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('');

test('real MemberClient wire preserves original human text and emits the exact negotiated v2 metadata', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  const { message } = await f.run(ARCHIVE_REQUEST);
  assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1);
  const sent = f.state.wirePrompts[0], grant = sent._meta.humanAuthorization;
  assert.equal(f.state.initialize._meta.collaborationProtocolVersion, 3);
  assert.deepEqual(f.state.initialize.clientCapabilities.attachmentTransfer, { version: 1 });
  assert.deepEqual(f.state.initialize.clientCapabilities.humanAuthorization, { version: 2 });
  assert.equal(sent.prompt[0].text, ARCHIVE_REQUEST);
  assert.deepEqual(Object.keys(grant).sort(), ['version', 'messageId', 'textSha256', 'projectId', 'attachmentScopes', 'receiptScopes'].sort());
  assert.equal(grant.messageId, message.id); assert.equal(grant.textSha256, hash(ARCHIVE_REQUEST)); assert.equal(grant.projectId, PROJECT_ID);
  assert.deepEqual(grant.attachmentScopes, [{ handle: sent._meta.attachments[0].handle, action: 'archive' }]);
  assert.deepEqual(grant.receiptScopes, []); assert.equal(sent._meta.attachments[0].archiveAuthorized, true);
  assert.equal(f.state.transfers.length, 1); assert.equal(f.state.connections, 0);
});

test('first natural project admission uses real journal and flush before publishing selection or reading bytes', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, preselected: false }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.deepEqual(f.state.flushes, [{ pending: true, selected: null }]);
  assert.equal(f.client.selectedProject(f.localId), PROJECT_ID); assert.equal(f.client.pendingProjectSelection(f.localId), undefined);
  assert.equal(f.session.snapshotEvents().filter(event => event.type === 'model/selection').length, 1);
  assert.equal(f.state.newSessionProject, PROJECT_ID); assert.equal(f.state.wirePrompts.length, 1);
});

test('failed project flush retains journal and does not read or submit attachment', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, preselected: false, failFlush: true }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.hostReads, 0); assert.equal(f.state.wirePrompts.length, 0); assert.ok(f.client.pendingProjectSelection(f.localId));
});

test('old peer without v2 receives neither bytes nor a business prompt and no invented legacy template', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, humanCapability: null }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.hostReads, 0); assert.equal(f.state.wirePrompts.length, 0); assert.equal(f.state.newSessionProject, undefined);
});

test('ambiguous fresh project names do not create a selection or read attachment', async t => {
  const projects = [{ id: PROJECT_ID, name: PROJECT_NAME }, { id: 'b'.repeat(32), name: PROJECT_NAME }];
  const f = await createNaturalAttachmentHost({ wire: true, preselected: false, projects }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.flushes.length, 0); assert.equal(f.state.hostReads, 0); assert.equal(f.state.wirePrompts.length, 0);
});

test('project changed during authority lookup is not overwritten or used for attachment execution', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, onProjects: ({ client, localId }) => client.selectProject(localId, 'b'.repeat(32)) }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.client.selectedProject(f.localId), 'b'.repeat(32)); assert.equal(f.state.hostReads, 0); assert.equal(f.state.wirePrompts.length, 0);
});

test('explicit unknown destination cannot be replaced by a known project mentioned only as a reference', async t => {
  const f = await createNaturalAttachmentHost({ projects: [{ id: PROJECT_ID, name: '南航POC' }] }); t.after(() => f.close());
  await f.run('请归档到未知项目，参考南航POC的格式。'); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.hostReads, 0); assert.equal(f.state.prompts.length, 0);
});

test('two actual native attachments with mixed archive/read instructions clarify before any bytes', async t => {
  const f = await createNaturalAttachmentHost(); t.after(() => f.close());
  await f.run('请把第一份归档，第二份只阅读。', { secondNative: true }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.hostReads, 0); assert.equal(f.state.prompts.length, 0); assert.equal(f.state.transfers.length, 0);
});

test('bare selected attachment then natural purpose answer reuses trusted opaque selection without reselection', async t => {
  const f = await createNaturalAttachmentHost(); t.after(() => f.close());
  await f.run('处理一下'); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.hostReads, 0); assert.equal(f.state.prompts.length, 0);
  await f.run('归档刚才那份', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.hostReads, 1); assert.equal(f.state.prompts.length, 1); assert.equal(f.state.prompts[0].text, '归档刚才那份');
  assert.equal(f.state.transfers[0].manifest.archiveAuthorized, true);
});

test('read then explicitly archive authorizes existing same-session receipt without retransferring bytes', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请看看这份需求，不要归档'); assertStoppedWithoutTechnicalTemplate(f.state);
  const original = f.state.wirePrompts[0]; assert.equal(original._meta.attachments[0].archiveAuthorized, false);
  const receipt = f.state.receipts[0];
  await f.run('把刚才那份归档', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 2); assert.equal(f.state.receiptQueries, 1); assert.equal(f.state.hostReads, 1);
  const next = f.state.wirePrompts[1]; assert.equal(next.prompt[0].text, '把刚才那份归档'); assert.equal(next._meta.attachments, undefined);
  assert.deepEqual(next._meta.humanAuthorization.attachmentScopes, []);
  assert.deepEqual(next._meta.humanAuthorization.receiptScopes, [{ receiptId: receipt.receiptId, action: 'archive' }]);
  assert.equal(original._meta.attachments[0].archiveAuthorized, false, 'Do not rewrite original read authorization');
});

test('draft positive uses actual synthetic document contents and makes no formal business registration', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请分析这份需求并整理草稿，暂时不要归档。'); assertStoppedWithoutTechnicalTemplate(f.state);
  const fact = f.bytes.toString('utf8').split('\n').find(line => line.startsWith('合成目标：')).slice('合成目标：'.length);
  assert.ok(visible(f.state).includes(fact)); assert.ok(visible(f.state).includes('未正式登记'));
  assert.equal(f.state.transfers[0].manifest.archiveAuthorized, false); assert.equal(f.state.businessWrites, 0);
  assert.deepEqual(f.state.wirePrompts[0]._meta.humanAuthorization.receiptScopes, []);
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

test('receipt source request grouping never chooses a different older or artificially newer timestamp row', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请看看这份需求，不要归档'); const original = f.state.receipts[0];
  f.state.receipts.push({ receiptId: 'b'.repeat(64), requestId: 'c'.repeat(64), projectId: PROJECT_ID, name: '另一来源的需求.md', archived: false, createdAt: 99999999999999 });
  await f.run('把刚才那份归档', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.deepEqual(f.state.wirePrompts[1]._meta.humanAuthorization.receiptScopes, [{ receiptId: original.receiptId, action: 'archive' }]);
  assert.equal(f.state.hostReads, 1);
});

const restoreProposal = { targetMaterialId: 'e'.repeat(32), restoreVersion: 1, expectedLatestVersion: 2 };
const proposeHistoricalRestore = ({ state, params }) => {
  if (params._meta.attachments?.length) state.receipts.at(-1).pendingRestore = { ...restoreProposal };
};

test('unique trusted historical proposal supports natural confirmation, survives readonly recover and is single use', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); await f.client.recoverAll();
  const receipt = f.state.receipts[0];
  await f.run('确认恢复', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.deepEqual(f.state.wirePrompts[1]._meta.humanAuthorization.receiptScopes, [{ receiptId: receipt.receiptId, action: 'archive', ...restoreProposal }]);
  assert.equal(f.state.hostReads, 1);
  // Deliberately keep the mock server's stale proposal: local one-shot fencing must still reject reuse.
  await f.run('确认', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 2);
});

for (const topic of ['帮我做个方案', '取消恢复']) test(`historical proposal cannot cross the intervening human turn: ${topic}`, async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  await f.run(topic, { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.deepEqual(f.state.wirePrompts[1]._meta.humanAuthorization.receiptScopes, []);
  await f.run('确认', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 2); assert.equal(f.state.hostReads, 1);
});

test('multiple live historical proposals ask for a material name rather than choosing the newest source', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  f.state.receipts.push({ receiptId: 'b'.repeat(64), requestId: 'c'.repeat(64), projectId: PROJECT_ID, name: '另一份历史材料.md', archived: false, pendingRestore: { ...restoreProposal, targetMaterialId: 'f'.repeat(32) } });
  await f.run('确认', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1); assert.equal(f.state.hostReads, 1);
});

test('plain confirmation without a trusted pending proposal cannot authorize restoration', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请看看这份需求，不要归档');
  await f.run('确认', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1); assert.equal(f.state.hostReads, 1);
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
    const operation = { kind: 'material_archive', receipt_id: context.state.receipts[0].receiptId, name: '可读需求.md', material_id: materialId, version: 2, ...flags };
    publishOperation(context, operation); publishOperation(context, operation);
  } }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  const text = visible(f.state); assert.ok(text.includes(phrase)); assert.equal(text.split('可读需求.md').length - 1, 1);
  for (const hidden of [materialId, f.state.receipts[0].receiptId, 'receipt_id', 'material_id']) assert.ok(!text.includes(hidden));
  assert.equal(f.state.wirePrompts.length, 1);
});

test('trusted restore-wait publication says historical/current versions and never claims restored success', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: context => publishOperation(context, {
    kind: 'restore_confirmation_required', receipt_id: context.state.receipts[0].receiptId, name: '历史需求.md', material_id: 'e'.repeat(32), restoreVersion: 1, expectedLatestVersion: 2,
  }) }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  const text = visible(f.state); assert.ok(text.includes('历史第1版')); assert.ok(text.includes('当前为第2版')); assert.ok(text.includes('尚未恢复'));
  assert.ok(!text.includes('已恢复')); assert.ok(!text.includes('receipt_id')); assert.ok(!text.includes('e'.repeat(32)));
});

test('operation publication bound to another request cannot become current readable success evidence', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: context => publishOperation(context, {
    kind: 'material_archive', receipt_id: context.state.receipts[0].receiptId, name: '错误轮次的资料.md', material_id: 'e'.repeat(32), version: 9,
  }, 'f'.repeat(64)) }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.ok(!visible(f.state).includes('错误轮次')); assert.ok(!visible(f.state).includes('第9版')); assert.ok(!visible(f.state).includes('material_id'));
});


for (const [label, text, selection] of [
  ['new unresolved attachment B', '', 'native-b'], ['new human topic', '帮我做个方案', 'none'], ['cancel restoration', '取消恢复', 'none'],
]) test(`reconstructed same-db client cannot restore old A after ${label}`, async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  await f.run(text, { selection });
  const before = f.state.wirePrompts.length, reads = f.state.hostReads, old = f.client, mapping = old.mapping(f.localId), login = old.login;
  f.rebuild(); assert.notEqual(f.client, old); assert.equal(f.client.login, login); assert.deepEqual(f.client.mapping(f.localId), mapping);
  assert.equal(f.client.restoreContexts.size, 0); assert.equal(f.client.lastAttachmentRequests.size, 0); assert.equal(f.state.clientInstances, 2);
  await f.run('确认', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, before, 'reconstruction must not use unique old pending A as the latest question');
  assert.equal(f.state.hostReads, reads);
});

for (const [label, text, selection] of [
  ['new unresolved attachment B', '', 'native-b'], ['new human topic', '帮我做个方案', 'none'], ['cancel archive', '取消归档', 'none'],
]) test(`reconstructed same-db client cannot archive old A as just-mentioned file after ${label}`, async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请看看这份需求，不要归档');
  await f.run(text, { selection });
  const before = f.state.wirePrompts.length, reads = f.state.hostReads;
  f.rebuild();
  await f.run('把刚才那份归档', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, before, 'unique older receipt is not proof of the most recent selected object');
  assert.equal(f.state.hostReads, reads);
});

test('new attachment B carrying plain confirmation cannot preserve live old-A restore authority', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST);
  await f.run('确认', { selection: 'native-b' }); assertStoppedWithoutTechnicalTemplate(f.state);
  await f.run('确认', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1); assert.equal(f.state.hostReads, 1);
});

test('named old A is shown with both versions before a fresh reconstructed confirmation can restore it', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); await f.run('', { selection: 'native-b' }); f.rebuild();
  const receipt = f.state.receipts[0];
  await f.run(`请归档《${receipt.name}》`, { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1);
  assert.ok(visible(f.state).includes(receipt.name)); assert.ok(visible(f.state).includes('第1版')); assert.ok(visible(f.state).includes('第2版'));
  await f.run('确认恢复', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 2);
  assert.deepEqual(f.state.wirePrompts[1]._meta.humanAuthorization.receiptScopes, [{ receiptId: receipt.receiptId, action: 'archive', ...restoreProposal }]);
});

test('live unresolved B still reuses its own opaque selection instead of old A receipt', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请看看这份需求，不要归档'); await f.run('', { selection: 'native-b' });
  await f.run('把刚才那份归档', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 2); assert.equal(f.state.hostReads, 2);
  assert.equal(f.state.wirePrompts[1]._meta.attachments[0].name, '新的待明确附件B.md');
  assert.deepEqual(f.state.wirePrompts[1]._meta.humanAuthorization.receiptScopes, []);
});


for (const [form, reference] of [['quotation', name => `把刚才那份归档。下面只是引用：“${name}”`], ['reference', name => `把那份归档，参考《${name}》`], ['blockquote', name => `把刚才那份归档。\n> ${name}`]]) test(`cold object selection cannot treat inert old-name mention as an explicit current target: ${form}`, async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请看看这份需求，不要归档'); await f.run('', { selection: 'native-b' });
  const name = f.state.receipts[0].name; f.rebuild();
  await f.run(reference(name), { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1, 'quoted/reference-only A name must not bypass absent source context for B');
  assert.equal(f.state.hostReads, 1);
  if (form === 'quotation') {
    const g = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => g.close());
    await g.run(ARCHIVE_REQUEST);
    await g.run('确认《另一个对象B.md》', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(g.state);
    assert.equal(g.state.wirePrompts.length, 1, 'stripping an explicitly different object must not turn it into bare confirmation of A');
  }
});


for (const quoted of [true, false]) test(`live unresolved B cannot override explicit old-A source (quoted=${quoted})`, async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); await f.run('', { selection: 'native-b' });
  const receipt = f.state.receipts[0];
  await f.run(quoted ? `请归档《${receipt.name}》` : `请归档${receipt.name}`, { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1, 'source conflict must ask or name A, not send cached B'); assert.equal(f.state.hostReads, 1);
  await f.run('把刚才那份归档', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 1); assert.equal(f.state.hostReads, 1);
});

test('live source-group B is not overridden by quoted old-A filename data', async t => {
  const f = await createNaturalAttachmentHost({ wire: true }); t.after(() => f.close());
  await f.run('请看看这份需求，不要归档'); await f.run('请看看这份需求，不要归档', { selection: 'native-b' });
  const [a, b] = f.state.receipts;
  await f.run(`把刚才那份归档。\n> ${a.name}`, { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 3); assert.equal(f.state.hostReads, 2);
  assert.deepEqual(f.state.wirePrompts[2]._meta.humanAuthorization.receiptScopes, [{ receiptId: b.receiptId, action: 'archive' }]);
  const g = await createNaturalAttachmentHost({ wire: true }); t.after(() => g.close());
  await g.run('请看看这份需求，不要归档', { selection: 'native-b' });
  await g.run('请归档 不存在的C.md', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(g.state);
  assert.equal(g.state.wirePrompts.length, 1, 'unmatched bare source name cannot authorize old B');
});

test('same-material new-version destination A does not replace unresolved B as source', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: proposeHistoricalRestore }); t.after(() => f.close());
  await f.run(ARCHIVE_REQUEST); await f.run('', { selection: 'native-b' });
  const a = f.state.receipts[0];
  await f.run(`请把这份文件作为《${a.name}》的新版本归档`, { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 2); assert.equal(f.state.hostReads, 2);
  assert.equal(f.state.wirePrompts[1]._meta.attachments[0].name, '新的待明确附件B.md');
  assert.deepEqual(f.state.wirePrompts[1]._meta.humanAuthorization.receiptScopes, []);
});


test('explicit current source A becomes the next relative source, not the older physical upload B', async t => {
  const f = await createNaturalAttachmentHost({ wire: true, afterTransfer: ({ state, params }) => {
    for (const scope of params._meta.humanAuthorization.receiptScopes) { const row = state.receipts.find(row => row.receiptId === scope.receiptId); row.archived = true; row.version = 2; }
  } }); t.after(() => f.close());
  await f.run('请看看这份需求，不要归档'); await f.run('请看看这份需求，不要归档', { selection: 'native-b' });
  const a = f.state.receipts[0];
  await f.run('请归档《不存在的资料C.md》', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 2, 'explicit unknown source must not fall back to existing B group');
  await f.run(`请归档《${a.name}》`, { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.deepEqual(f.state.wirePrompts[2]._meta.humanAuthorization.receiptScopes, [{ receiptId: a.receiptId, action: 'archive' }]);
  await f.run('把刚才那份归档', { selection: 'none' }); assertStoppedWithoutTechnicalTemplate(f.state);
  assert.equal(f.state.wirePrompts.length, 3, 'the newly selected current object is A, already archived; B has no new permission');
  assert.ok(visible(f.state).includes(a.name)); assert.equal(f.state.hostReads, 2);
});
