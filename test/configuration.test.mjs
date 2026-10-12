import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveMemberConfiguration } from '../src/configuration.mjs';
const fixture = root => ({ serviceId: 'fixture', databasePath: join(root, 'state/client.sqlite'), ssh: { host: 'example.test', account: 'alice', identityFile: join(root, 'key'), knownHostsFile: join(root, 'known_hosts') } });
test('missing configuration does not create files or use guessed endpoint', () => {
  const root = mkdtempSync(join(tmpdir(), 'collab-config-')), file = join(root, 'missing.json');
  const status = resolveMemberConfiguration({}, { fallbackPath: file });
  assert.equal(status.state, 'configuration-required'); assert.ok(status.missing.includes('serviceId')); assert.equal(status.config, undefined); assert.equal(existsSync(file), false);
});
test('validated client JSON provides deployment identity, route and separate metadata path', () => {
  const root = mkdtempSync(join(tmpdir(), 'collab-config-')), file = join(root, 'client.json');
  writeFileSync(file, JSON.stringify({ ...fixture(root), provider: 'fixture-remote', model: 'fixture-agent' }));
  const result = resolveMemberConfiguration({ configFile: file }); assert.equal(result.state, 'configured'); assert.equal(result.config.provider, 'fixture-remote'); assert.equal(result.config.ssh.account, 'alice'); assert.equal(existsSync(result.config.databasePath), false);
});
test('malformed/server configuration fails closed and does not echo secret values', () => {
  const root = mkdtempSync(join(tmpdir(), 'collab-config-')), file = join(root, 'client.json');
  writeFileSync(file, '{broken'); assert.equal(resolveMemberConfiguration({ configFile: file }).state, 'configuration-required');
  writeFileSync(file, JSON.stringify({ ...fixture(root), accounts: { alice: 'secret-that-must-not-be-logged' } }));
  const result = resolveMemberConfiguration({ configFile: file }); assert.equal(result.state, 'configuration-required'); assert.ok(!JSON.stringify(result).includes('secret-that-must-not-be-logged'));
});
test('partial/ambiguous inline inputs and unsafe SSH configuration never activate', () => {
  const root = mkdtempSync(join(tmpdir(), 'collab-config-'));
  for (const input of [{ serviceId: 'partial' }, { ...fixture(root), configFile: join(root, 'client.json') }, { ...fixture(root), ssh: { ...fixture(root).ssh, host: 'server;injection' } }, { ...fixture(root), databasePath: 'relative.sqlite' }]) assert.equal(resolveMemberConfiguration(input).state, 'configuration-required');
});
