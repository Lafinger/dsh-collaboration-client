import test from 'node:test';
import assert from 'node:assert/strict';
import { Context } from '@deepseek-ai/cordis';
import { LlmRuntime } from '@deepseek-ai/dsh-llm';
import * as plugin from '../src/member-plugin.mjs';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('JSON configuration activates actual plugin lazily and creates only its own client state', async () => {
  const root = mkdtempSync(join(tmpdir(), 'collab-mounted-config-'));
  const file = join(root, 'client.json'), databasePath = join(root, 'state/client.sqlite');
  writeFileSync(file, JSON.stringify({ serviceId: 'fixture', databasePath, ssh: { host: 'example.test', account: 'alice', identityFile: join(root, 'key'), knownHostsFile: join(root, 'known_hosts') } }));
  const ctx = new Context(), llm = ctx.plugin(LlmRuntime); await llm.await();
  try {
    const entry = ctx.plugin(plugin, { configFile: file }); await entry.await();
    assert.equal(entry.ctx.get('workbenchMemberStatus').state, 'configured');
    const client = entry.ctx.get('workbenchMemberClient'); assert.ok(client); assert.equal(client.peer, null);
    assert.ok(existsSync(databasePath)); assert.ok((await ctx.llm.listModels('workbench-remote')).some(model => model.id === 'server-agent'));
  } finally { await ctx.fiber.dispose(); }
});

test('enabling installed bundle without deployment config stays pending, not ValidationError', async () => {
  const ctx = new Context();
  const llm = ctx.plugin(LlmRuntime); await llm.await();
  try {
    // Missing required bundle fields; pin a nonexistent file so later user configuration cannot affect this regression.
    const configFile = join(mkdtempSync(join(tmpdir(), 'collab-empty-config-')), 'missing.json');
    const entry = ctx.plugin(plugin, { configFile, provider: 'workbench-remote', model: 'server-agent', serviceId: undefined, databasePath: undefined,
      ssh: { host: undefined, account: undefined, identityFile: undefined, knownHostsFile: undefined } });
    await entry.await();
    const status = entry.ctx.get('workbenchMemberStatus');
    assert.equal(status.state, 'configuration-required');
    assert.ok(status.missing.includes('serviceId'));
    assert.equal(entry.ctx.get('workbenchMemberClient'), undefined);
    assert.ok(!ctx.llm.listProviders().some(provider => provider.id === 'workbench-remote'));
  } finally { await ctx.fiber.dispose(); }
});
