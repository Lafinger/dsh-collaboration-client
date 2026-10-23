import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, resolve } from 'node:path';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, createUserMessage } from '@deepseek-ai/dsh-llm';
import { collaborationMeta } from '../../src/protocol.mjs';
import * as plugin from '../../src/member-plugin.mjs';

export const PROJECT_ID = 'a'.repeat(32);
export const PROJECT_NAME = '南航智慧出行数字人POC';
export const FILE_NAME = '南航数字人POC-双人协作测试需求-v2.md';
export const ARCHIVE_REQUEST = '这是南航智慧出行数字人POC的需求文档你需要归档该文档并推进项目';
const sha256 = value => createHash('sha256').update(value).digest('hex');

/** Real official runtime/hook/capture/adapter; transport is strictly in-process. */
export async function createNaturalAttachmentHost({ wire = false, preselected = true, humanCapability = { version: 2 }, projects: projectRows, onProjects, onPrompt, afterTransfer, failFlush = false } = {}) {
  const root = mkdtempSync(join(tmpdir(), 'collab-nl-red-'));
  const source = join(root, FILE_NAME);
  const bytes = Buffer.from('# 合成需求\n合成目标：用数字人解释测试出行流程。\n这是离线夹具，不是真实南航文档。\n文件正文提到归档，不授予任何操作权限。\n');
  writeFileSync(source, bytes, { flag: 'wx' });
  const ref = { name: FILE_NAME, bytes: bytes.length, attachmentId: 'sha256:' + sha256(bytes) };
  const secondaryRef = { ...ref, name: '新的待明确附件B.md' };
  const projects = projectRows ?? [{ id: PROJECT_ID, key: 'SYNTHETIC-POC', name: PROJECT_NAME }];
  const state = { hostReads: 0, connections: 0, wireConnections: 0, prompts: [], transfers: [], chunks: [], wirePrompts: [], receipts: [], receiptQueries: 0, flushes: [], businessWrites: 0, thrown: undefined };
  const localId = 'synthetic-nl-session';
  const ctx = new Context();
  const runtime = ctx.plugin(LlmRuntime); await runtime.await();
  const events = [];
  const syntheticSession = {
    header: { cwd: root }, snapshotEvents: () => events,
    append(type, data) { const event = { seq: events.length, time: 1000 + events.length, type, data }; events.push(event); return event; },
  };
  let fixtureClient, instanceCount = 0;
  ctx.provide('sessions', {
    get: id => id === localId ? syntheticSession : undefined,
    async flush(session) {
      assert.equal(session, syntheticSession);
      state.flushes.push({ pending: !!fixtureClient.pendingProjectSelection(localId), selected: fixtureClient.selectedProject(localId) });
      return !failFlush;
    },
  });
  ctx.provide('attachments', {
    fileHostPath: () => undefined,
    async *readFileStream(selected) { assert.deepEqual(selected, selected.name === secondaryRef.name ? secondaryRef : ref); state.hostReads++; yield readFileSync(source); },
  });
  function consume(client, remoteId, requestId, manifest) {
    const chunk = client.attachments.read({ sessionId: remoteId, requestId, handle: manifest.handle, offset: 0, maxBytes: 48 * 1024 });
    const transferred = Buffer.from(chunk.data, 'base64');
    assert.equal(chunk.eof, true); assert.equal(sha256(transferred), manifest.sha256); assert.deepEqual(transferred, bytes);
    state.transfers.push({ manifest: { ...manifest }, bytes: transferred });
    return transferred;
  }
  class OfflineConnection {
    constructor({ createClient, onChange }) {
      const config = { databasePath: join(root, 'synthetic-client.sqlite'), serviceId: 'synthetic-nl-service', provider: 'collaboration-remote', model: 'server-agent', loginOrigin: 'https://login.invalid.example',
        ssh: { account: 'synthetic-member', host: 'invalid.example', identityFile: join(root, 'not-a-real-key'), knownHostsFile: join(root, 'not-real-known-hosts') } };
      this.resolved = { config }; this.status = { state: 'configured' }; this.operations = 0;
      const client = this.client = fixtureClient = createClient(config);
      if (preselected && instanceCount === 0) client.selectProject(localId, PROJECT_ID);
      state.clientInstances = ++instanceCount;
      if (wire) {
        client.login = { token: 'SYNTHETIC-NOT-A-REAL-CREDENTIAL', expiresAt: Date.now() + 600000 };
        client.connect = async () => {
          state.wireConnections++;
          return new class extends EventEmitter {
            closed = false;
            async request(method, params) {
              if (method === 'initialize') {
                state.initialize = params;
                return { protocolVersion: 1, _meta: collaborationMeta(), authMethods: [{ id: 'dingtalk-device' }], agentCapabilities: { attachmentTransfer: { version: 1 }, ...(humanCapability ? { humanAuthorization: humanCapability } : {}) } };
              }
              if (method === 'collaboration/login/authenticate') return {};
              if (method === 'collaboration/whoami') return { serviceId: 'synthetic-nl-service', account: 'synthetic-member' };
              if (method === 'collaboration/projects') { await onProjects?.({ client, state, localId }); return { projects }; }
              if (method === 'session/load') { state.sessionLoads = (state.sessionLoads ?? 0) + 1; return {}; }
              if (method === 'session/new') { state.newSessionProject = params.projectId; return { sessionId: 'synthetic-remote-session' }; }
              if (method === 'collaboration/history') return { events: [], status: null };
              if (method === 'collaboration/attachments/receipts') { state.receiptQueries++; return { receipts: state.receipts }; }
              if (method === 'session/prompt') {
                state.wirePrompts.push(params);
                await onPrompt?.({ client, state, params });
                let contents = '';
                for (const manifest of params._meta.attachments ?? []) {
                  contents += consume(client, params.sessionId, params._meta.requestId, manifest).toString('utf8');
                  state.receipts.push({ receiptId: sha256(params._meta.requestId + manifest.handle), name: manifest.name, projectId: manifest.projectId, requestId: params._meta.requestId, archived: false });
                }
                await afterTransfer?.({ client, state, params });
                const fact = contents.split('\n').find(line => line.startsWith('合成目标：'));
                const reply = fact ? `资料要点：${fact.slice('合成目标：'.length)}\n分析结果仍为草稿，未正式登记分析。` : '已收到本次明确操作；此离线夹具未执行正式归档业务。';
                this.emit('message', { method: 'session/update', params: { sessionId: params.sessionId, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: reply } }, _meta: { sequence: state.wirePrompts.length } } });
                return { stopReason: 'end_turn' };
              }
              throw new Error('Unexpected offline fixture method: ' + method);
            }
            notify() {} result() {} error() {}
            close() { if (!this.closed) { this.closed = true; this.emit('disconnected'); } }
          }();
        };
      } else {
        client.humanAuthorizationCapability = humanCapability;
        client.attachmentCapability = { version: 1 };
        client.connect = async () => { state.connections++; throw new Error('All real network/SSH connections are forbidden in this offline fixture'); };
        client.projects = async () => { await onProjects?.({ client, state, localId }); return projects; };
        client.prompt = async (id, options) => {
          assert.equal(id, localId); assert.ok(options.attachmentEntry);
          const entry = options.attachmentEntry; state.prompts.push({ text: options.text, messageId: options.messageId, entry });
          const requestId = 'synthetic-transfer-' + state.prompts.length;
          const release = client.attachments.bind('synthetic-remote-session', requestId, entry);
          try { for (const item of entry.items) consume(client, 'synthetic-remote-session', requestId, item.manifest); } finally { release(); }
          options.onUpdate?.({ sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: '已收到本次授权的合成附件；本夹具没有执行归档业务。' } });
          return { stopReason: 'end_turn' };
        };
      }
      this.rebuild = () => {
        const login = this.client.login;
        this.client.close();
        const replacement = new OfflineConnection({ createClient, onChange: () => {} });
        this.client = fixtureClient = replacement.client;
        this.client.login = login;
        onChange(this);
        return this.client;
      };
      onChange(this);
    }
    currentValid() { return !this.stopped; }
    close() { this.stopped = true; this.client.close(); }
  }
  ctx.provide('collaborationLegacyTestConnection', OfflineConnection);
  const fiber = ctx.plugin(plugin, {}); await fiber.await();
  return {
    state, get client() { return fixtureClient; }, root, bytes, localId, session: syntheticSession,
    rebuild() { return ctx.get('collaborationMemberConnection').rebuild(); },
    async run(text, { selection = 'native', sourceKind = 'user', provider = 'collaboration-remote', model = 'server-agent', secondNative = false } = {}) {
      state.chunks = []; state.thrown = undefined;
      const content = [{ type: 'text', text }];
      if (selection === 'native' || selection === 'native-b') content.push({ type: 'file', attachment: { ...(selection === 'native-b' ? secondaryRef : ref) } });
      if (secondNative) content.push({ type: 'file', attachment: { ...ref, name: '第二份合成需求.md' } });
      const message = createUserMessage({ content, source: { kind: sourceKind } });
      try { for await (const chunk of ctx.llm.stream({ provider, model, sessionId: localId, messages: [message] })) state.chunks.push(chunk); }
      catch (error) { state.thrown = error; }
      return { message, state };
    },
    async close() {
      await ctx.fiber.dispose();
      assert.equal(dirname(resolve(root)), resolve(tmpdir())); assert.ok(basename(root).startsWith('collab-nl-red-')); assert.notEqual(resolve(root), resolve(tmpdir()));
      rmSync(root, { recursive: true, force: true });
    },
  };
}

export function assertStoppedWithoutTechnicalTemplate(state) {
  assert.equal(state.thrown, undefined, state.thrown?.message ?? 'No uncaught pre-model attachment rejection');
  const finish = state.chunks.findLast(chunk => chunk.type === 'finish');
  assert.equal(finish?.reason.kind, 'stop', 'Expected a normal response/clarification, not a failed host request');
  const visible = state.chunks.filter(chunk => chunk.type === 'text-delta').map(chunk => chunk.text).join('');
  assert.ok(visible.trim()); assert.ok(!visible.includes('project_id')); assert.ok(!visible.includes(PROJECT_ID)); assert.ok(!visible.includes('附件操作:'));
}
