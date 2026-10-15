import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync } from 'node:fs';
import { tmpdir, homedir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
import { join } from 'node:path';
import { resolveMemberConfiguration, defaultConfigPath } from '../src/configuration.mjs';
const fixture = root => { writeFileSync(join(root,'key'),'fixture key placeholder');writeFileSync(join(root,'known_hosts'),'fixture host placeholder');return { loginOrigin:'https://login.example.test',serviceId: 'fixture', databasePath: join(root, 'state/client.sqlite'), ssh: { host: 'example.test', account: 'alice', identityFile: join(root, 'key'), knownHostsFile: join(root, 'known_hosts') } }; };
test('default config is user-owned plugin directory and never falls back to legacy root file', () => {
  assert.equal(defaultConfigPath(), join(homedir(), '.dsh', 'dsh-collaboration-client', 'collaboration-client.json'));
  const root = mkdtempSync(join(tmpdir(), 'collab-home-'));
  mkdirSync(join(root, '.dsh')); writeFileSync(join(root, '.dsh', 'collaboration-client.json'), JSON.stringify(fixture(root)));
  const module = pathToFileURL(resolve('src/configuration.mjs')).href;
  const code = `import assert from 'node:assert/strict';import{resolveMemberConfiguration,defaultConfigPath}from ${JSON.stringify(module)};const r=resolveMemberConfiguration();assert.equal(r.state,'configuration-required');assert.equal(r.configPath,defaultConfigPath());`;
  let result=spawnSync(process.execPath,['--input-type=module','-e',code],{stdio:'inherit',env:{...process.env,HOME:root,USERPROFILE:root}});
  assert.equal(result.status,0);
  const dir=join(root,'.dsh','dsh-collaboration-client');mkdirSync(dir);writeFileSync(join(dir,'collaboration-client.json'),'\uFEFF'+JSON.stringify(fixture(root)));
  result=spawnSync(process.execPath,['--input-type=module','-e',code.replace("'configuration-required'","'configured'")],{stdio:'inherit',env:{...process.env,HOME:root,USERPROFILE:root}});
  assert.equal(result.status,0);
});
test('explicit file overrides environment; environment overrides default; inline stays independent',()=>{
 const root=mkdtempSync(join(tmpdir(),'collab-env-'));const file=join(root,'override.json');writeFileSync(file,JSON.stringify(fixture(root)));
 const missing=join(root,'missing.json');const env={DSH_COLLABORATION_CLIENT_CONFIG:file};
 assert.equal(resolveMemberConfiguration({},{fallbackPath:missing,env}).state,'configured');
 assert.equal(resolveMemberConfiguration({configFile:missing},{env}).state,'configuration-required');
 assert.equal(resolveMemberConfiguration(fixture(root),{env:{DSH_COLLABORATION_CLIENT_CONFIG:missing}}).state,'configured');
 assert.equal(resolveMemberConfiguration({},{fallbackPath:file,env:{DSH_COLLABORATION_CLIENT_CONFIG:'relative.json'}}).state,'configuration-required');
 assert.equal(resolveMemberConfiguration({},{fallbackPath:file,env:{DSH_COLLABORATION_CLIENT_CONFIG:''}}).state,'configured');
 assert.equal(existsSync(fixture(root).databasePath),false);
});
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
