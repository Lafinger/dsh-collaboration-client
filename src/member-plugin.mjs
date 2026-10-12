import { LlmAdapter, createUserMessage } from '@deepseek-ai/dsh-llm';
import z from '@deepseek-ai/schemastery';
import { MemberClient } from './member-client.mjs';
import { openSsh } from './ssh.mjs';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { resolveMemberConfiguration } from './configuration.mjs';

export const name = 'collaboration-client';
export const inject = ['llm'];
export const Config = z.object({
  configFile: z.string().description('客户端 JSON 配置的绝对路径；未指定时读取用户 .dsh/collaboration-client.json。'),
  provider: z.string(), model: z.string(),
  serviceId: z.string(), databasePath: z.string(),
  ssh: z.object({
    host: z.string(), account: z.string(), identityFile: z.string(), knownHostsFile: z.string(),
    port: z.number().min(1).max(65535).step(1), sshExecutable: z.string(),
  }),
});

/** Independent adapter: no history-length heuristics, fresh-session fallback, or remote auxiliary prompts. */
export class MemberAdapter extends LlmAdapter {
  constructor(client, { provider = 'workbench-remote', model = 'server-agent' } = {}) {
    super(); this.client = client; this.provider = provider; this.model = model;
  }
  providerRetryPolicy() { return { mode: 'normal', maxRetries: 0, retryableCodes: [], initialDelayMs: 0, maxDelayMs: 0, jitterRatio: 0 }; }
  async listModels() { return [{ provider: this.provider, id: this.model, name: '项目工作台服务', inputModalities: ['text'], outputModalities: ['text'] }]; }
  async *stream(options) {
    const finishError = error => ({ type: 'finish', reason: { kind: 'error', failure: { code: 'WORKBENCH_NO_REPLAY', message: error.message } } });
    if (options.purpose === 'session-title') {
      const text = options.messages.filter(m => m.role === 'user' && m.source?.kind === 'user').flatMap(m => m.content.filter(b => b.type === 'text').map(b => b.text)).at(-1)?.slice(0, 40) ?? '项目工作台';
      yield { type: 'block-start', index: 0, blockType: 'text' }; yield { type: 'text-delta', index: 0, text };
      yield { type: 'block-end', index: 0, block: { type: 'text', text } }; yield { type: 'finish', reason: { kind: 'stop' } }; return;
    }
    if (options.purpose !== undefined) { yield finishError(new Error('Auxiliary model calls must not run the remote business Agent')); return; }
    const message = [...options.messages].reverse().find(m => m.role === 'user' && m.source?.kind === 'user');
    if (!options.sessionId || !message?.id || message.content.some(b => b.type !== 'text')) {
      yield finishError(new Error('Identified local conversation and text-only human message required')); return;
    }
    const queue = []; let wake, ended = false, failure, result;
    const signal = () => { wake?.(); wake = null; };
    const task = this.client.prompt(String(options.sessionId), {
      messageId: String(message.id), text: message.content.map(b => b.text).join('\n'), signal: options.signal,
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
    } finally { if (!ended) this.client.disconnect(); await task; }
  }
}

export function apply(ctx, input) {
  const resolved = resolveMemberConfiguration(input);
  const { config, ...status } = resolved;
  ctx.provide('workbenchMemberStatus', Object.freeze(status));
  if (resolved.state !== 'configured') {
    ctx.logger?.warn?.(resolved.message);
    return; // No database, adapter or SSH while deployment identity/connection is incomplete.
  }
  if (config.databasePath !== ':memory:') mkdirSync(dirname(config.databasePath), { recursive: true });
  const client = new MemberClient({ connect: () => openSsh(config.ssh), databasePath: config.databasePath, serviceId: config.serviceId, account: config.ssh.account,
    // Recovery snapshot is visible as a local plugin notice, never resubmitted as user input.
    onHistory: ({ localId, events, status }) => {
      const agent = ctx.get('agents')?.get(localId);
      if (agent && events.length) {
        const snapshot = events.map(({ seq, update }) => `[${seq}] ${update.sessionUpdate}: ${update.content?.text ?? ''}`).join('\n');
        const message = createUserMessage({ content: [{ type: 'text', text: `远端已保存记录（仅恢复显示，不是新业务指令）：\n${snapshot}\n状态：${JSON.stringify(status)}` }],
          source: { kind: 'plugin', plugin: name, form: 'notice', summary: '远端会话恢复记录；未重新执行业务指令' } });
        agent.session.append('user/message', message, { surfaceOp: 'append' });
        // The source is plugin, not user: MemberAdapter never submits this snapshot as a command.
        ctx.emit('workbench/recovery', { localId, events, status });
      }
    },
  });
  ctx.effect(() => ctx.llm.registerAdapter([config.provider ?? 'workbench-remote'], new MemberAdapter(client, config)));
  ctx.effect(() => () => client.close());
  ctx.provide('workbenchMemberClient', client);
}
