import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import z from '@deepseek-ai/schemastery';
import { MemberClient } from './member-client.mjs';
import { openSsh } from './ssh.mjs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { AttachmentAuthorization, explicitPaths } from './attachments.mjs';
import { installMemberRpc } from './member-rpc.mjs';
import { installProjectRouting } from './project-selection.mjs';
import {HttpsConnection} from './https-connection.mjs';
import {HttpsMemberClient} from './https-client.mjs';
import {openHttps} from './https-peer.mjs';
import {LoginVault} from './login-vault.mjs';

export const name = 'collaboration-client';
export const inject = ['llm'];
export const Config = z.object({
  serviceUrl:z.string().description('MVP只需可信HTTPS服务地址；身份由电脑钉钉确定。'),

});

/** Independent adapter: no history-length heuristics, fresh-session fallback, or remote auxiliary prompts. */
export class MemberAdapter extends LlmAdapter {
  constructor(client, { provider = 'collaboration-remote', model = 'server-agent' } = {}) {
    super(); this.clientSource = client; this.provider = provider; this.model = model;
  }
  get client() { const client=typeof this.clientSource==='function'?this.clientSource():this.clientSource;if(!client)throw new Error('请在设置 → 协作服务选择配置并登录');return client; }
  providerInfo(provider) { return { id:provider, name:'Collaboration' }; }
  providerRetryPolicy() { return { mode: 'normal', maxRetries: 0, retryableCodes: [], initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 }; }
  async listModels() { return [{ provider: this.provider, id: this.model, name: '项目选择', description: '在当前协作会话选择授权项目；实际业务模型由服务端固定路由', inputModalities: ['text', 'image'], outputModalities: ['text'] }]; }
  async *stream(options) {
    const finishError = error => ({ type: 'finish', reason: { kind: 'error', failure: { code: 'COLLABORATION_NO_REPLAY', message: error.message } } });
    if (options.purpose === 'session-title') {
      const text = options.messages.filter(m => m.role === 'user' && m.source?.kind === 'user').flatMap(m => m.content.filter(b => b.type === 'text').map(b => b.text)).at(-1)?.slice(0, 40) ?? '协作服务';
      yield { type: 'block-start', index: 0, blockType: 'text' }; yield { type: 'text-delta', index: 0, text };
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }; yield { type: 'finish', reason: { kind: 'stop' } }; return;
    }
    if (options.purpose !== undefined) { yield finishError(new Error('Auxiliary model calls must not run the remote business Agent')); return; }
    const message = [...options.messages].reverse().find(m => m.role === 'user' && m.source?.kind === 'user');
    if (!options.sessionId || !message?.id || message.content.some(b => !['text','file','image'].includes(b.type))) {
      yield finishError(new Error('Identified local conversation and supported human message required')); return;
    }
    let client;try{client=this.client;}catch(error){yield finishError(error);return;} // Capture the entry for the whole turn.
    const attachmentEntry = client.attachments?.take(String(options.sessionId), String(message.id));
    const plainText = message.content.filter(b => b.type === 'text').map(b => b.text).join('\n');
    if (!attachmentEntry && (message.content.some(b => b.type !== 'text') || explicitPaths(plainText).length)) {
      yield finishError(new Error('Attachment authorization must be captured from the current human message by the installed plugin')); return;
    }
    const queue = []; let wake, ended = false, failure, result;
    const signal = () => { wake?.(); wake = null; };
    const task = client.prompt(String(options.sessionId), {
      messageId: String(message.id), text: attachmentEntry?.text || plainText, attachmentEntry, signal: options.signal,
      onUpdate: update => { queue.push(update); signal(); },
    }).then(value => { result = value; }, error => { failure = error; }).finally(() => { ended = true; signal(); });
    let index = 0, open = null;
    const close = () => open ? { type: 'block-end', index: open.index, block: { type: open.kind, text: open.text } } : null;
    try {
      while (!ended || queue.length) {
        if (!queue.length) { await new Promise(resolve => { wake = resolve; }); continue; }
        const update = queue.shift();
        const kind = update.sessionUpdate === 'agent_message_chunk' ? 'text' : update.sessionUpdate === 'agent_thought_chunk' ? 'reasoning' : null;
        if (!kind || update.content?.type !== 'text') continue;
        if (open?.kind !== kind) { const end = close(); if (end) yield end; open = { kind, index: index++, text: '' }; yield { type: 'block-start', index: open.index, blockType: kind }; }
        open.text += update.content.text;
        yield { type: kind === 'text' ? 'text-delta' : 'reasoning-delta', index: open.index, text: update.content.text };
      }
      await task; const end = close(); if (end) yield end;
      if (failure) yield finishError(failure);
      else if (result?.stopReason === 'cancelled') yield { type: 'finish', reason: { kind: 'aborted', failure: { code: 'CANCELLED', message: 'Remote turn cancelled; committed data remains' } } };
      else if (result?.stopReason === 'end_turn') yield { type: 'finish', reason: { kind: 'stop' } };
      else yield finishError(new Error(`Remote turn did not complete: ${result?.stopReason}`));
    } finally { if (!ended) client.disconnect(); await task; }
  }
}

export function apply(ctx, input = {}) {
  let entry, registration;
  const adapter = new MemberAdapter(() => entry?.currentValid() ? entry.client : null);
  ctx.provide('collaborationMemberStatus', {});
  ctx.provide('collaborationMemberClient', undefined);
  const createClient = config => {
    if ((!registration || config.provider !== adapter.provider) && ctx.llm.listProviders().some(row => row.id === config.provider)) throw new Error('所选配置provider已被其他组件使用');
    if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true, mode: 0o700 });
    const attachments = new AttachmentAuthorization({ attachmentStore: ctx.get('attachments'), workspaceOf: localId => ctx.get('sessions')?.get(localId)?.header.cwd });
    const mvp=config.mode==='mvp-https',Client=mvp?HttpsMemberClient:MemberClient;
    return new Client({ connect: () => mvp?openHttps(config.origin):openSsh(config.ssh), databasePath: config.databasePath, serviceId: config.serviceId, account: config.ssh?.account, attachments, requireLogin: true, loginOrigin: config.loginOrigin,...mvp?{origin:config.origin,vault:new LoginVault(config.vaultPath)}:{},
      onHistory: ({ localId, events, status }) => {
        const agent = ctx.get('agents')?.get(localId);
        if (agent && events.length) {
          const snapshot = events.map(({ seq, update }) => `[${seq}] ${update.sessionUpdate}: ${update.content?.text ?? ''}`).join('\n');
          const message = createUserMessage({ content: [{ type: 'text', text: `远端已保存记录（仅恢复显示，不是新业务指令）：\n${snapshot}\n状态：${JSON.stringify(status)}` }],
            source: { kind: 'plugin', plugin: name, form: 'notice', summary: '远端会话恢复记录；未重新执行业务指令' } });
          agent.session.append('user/message', message, { surfaceOp: 'append' });
          ctx.emit('collaboration/recovery', { localId, events, status });
        }
      },
    });
  };
  const changed = current => {
    ctx.set('collaborationMemberStatus', current.status);
    ctx.set('collaborationMemberClient', current.client ?? undefined);
    if (current.resolved.config) { adapter.provider = current.resolved.config.provider; adapter.model = current.resolved.config.model; }
    if (registration) { if(current.client) registration.replace([adapter.provider]);else{registration();registration=null;} }
  };
  const Connection=ctx.get('collaborationLegacyTestConnection')??HttpsConnection;
  entry = new Connection({ input, createClient, onChange: changed });
  if (entry.client) registration = ctx.llm.registerAdapter([adapter.provider], adapter);
  // No-config install keeps the settings UI alive. A later explicit UI choice can register the route lazily.
  entry.onChange = current => { changed(current); if (!registration && current.client) registration = ctx.llm.registerAdapter([adapter.provider], adapter); };
  ctx.provide('collaborationMemberConnection', entry);
  ctx.effect(() => () => entry.close());
  ctx.on('llm/stream', async function* (options, next) {
    const client = entry.client;
    if (!client || options.provider !== adapter.provider || options.model !== adapter.model || options.purpose !== undefined || !options.sessionId) { yield* next(); return; }
    if(!entry.currentValid()){yield {type:'finish',reason:{kind:'error',failure:{code:'COLLABORATION_NO_REPLAY',message:'活动成员配置已丢失或改变，请先退出并重新选择'}}};return;}
    const message = [...options.messages].reverse().find(m => m.role === 'user' && m.source?.kind === 'user');
    // Capture is part of the turn, so a settings switch cannot race attachment admission.
    entry.operations++;
    try {
      if (message && !client.wasSubmitted(String(options.sessionId), String(message.id))) await client.attachments.capture({ localId: String(options.sessionId), message, signal: options.signal });
      yield* next();
    } finally { if (message) client.attachments.take(String(options.sessionId), String(message.id)); entry.operations--; }
  });
  ctx.inject(['connection'], active => installMemberRpc(active, { entry, sessions: ctx.get('sessions') }));
  ctx.inject(['sessionProjections'], active => installProjectRouting(active, { entry, adapter }));
}
