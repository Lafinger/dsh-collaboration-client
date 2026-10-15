import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime, createUserMessage } from '@deepseek-ai/dsh-llm';
import { SessionStore } from '@deepseek-ai/dsh-session';
import * as plugin from '../src/member-plugin.mjs';
import {installLegacyConnection} from './helpers/legacy-connection.mjs';
import { MemberAdapter } from '../src/member-plugin.mjs';
import { resolve } from 'node:path';

test('plugin mounts actual adapter and recovery snapshot is non-user local context', async () => {
  const ctx = new Context(); const llmFiber = ctx.plugin(LlmRuntime); const sessionFiber = ctx.plugin(SessionStore);
  await llmFiber.await(); await sessionFiber.await();
  const session = ctx.sessions.create('local-recovery');
  ctx.provide('agents', { get: id => id === session.id ? { session } : undefined });
  installLegacyConnection(ctx);const fiber = ctx.plugin(plugin, {
    loginOrigin:'https://login.example.test',databasePath: ':memory:', serviceId: 'test', provider: 'collaboration-remote', ssh: { account: 'alice', host: 'example.test', identityFile: resolve('fixture-key'), knownHostsFile: resolve('fixture-known-hosts') },
  });
  try {
    await fiber.await();
    const client = fiber.ctx.get('collaborationMemberClient');
    await client.onHistory({ localId: session.id, events: [{ seq: 1, update: { sessionUpdate: 'agent_message_chunk', content: { type: 'text', text: 'previous reply' } } }], status: { state: 'cancelled' } });
    const message = session.deriveMessages().at(-1);
    assert.equal(message.source.kind, 'plugin'); assert.ok(message.content[0].text.includes('previous reply'));
    let submitted = 0; const adapter = new MemberAdapter({ prompt() { submitted++; throw new Error('must not submit'); } });
    const chunks = []; for await (const c of adapter.stream({ provider: 'collaboration-remote', model: 'server-agent', sessionId: session.id, messages: [message] })) chunks.push(c);
    assert.equal(submitted, 0); assert.equal(chunks.at(-1).reason.kind, 'error');
    const title = []; for await (const c of adapter.stream({ provider: 'collaboration-remote', model: 'server-agent', purpose: 'session-title', messages: [createUserMessage({ content: [{ type: 'text', text: 'human title' }], source: { kind: 'user' } })] })) title.push(c);
    assert.equal(title.find(c => c.type === 'text-delta').text, 'human title'); assert.equal(submitted, 0);
    assert.equal(adapter.providerRetryPolicy().maxRetries, 0);
  } finally { await fiber.dispose(); await ctx.fiber.dispose(); }
});
