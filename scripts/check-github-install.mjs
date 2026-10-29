import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { repository } from './release-policy.mjs';
const spec = process.argv[2] ?? `github:${repository}`;
assert.match(spec, /^github:Lafinger\/dsh-collaboration-client(?:#[0-9A-Za-z.-]+)?$/, 'Only approved GitHub repository specs are tested');
const pnpm = process.env.DSH_PNPM_SCRIPT ?? process.env.npm_execpath;
if (!pnpm) throw new Error('Run through pnpm run install:check, or set DSH_PNPM_SCRIPT to the pnpm script');
const expected = JSON.parse(readFileSync('package.json', 'utf8'));
mkdirSync('.dsh', { recursive: true });
const directory = mkdtempSync(resolve('.dsh/github-install-'));
writeFileSync(join(directory, 'package.json'), JSON.stringify({ name: 'isolated-github-plugin-check', private: true, type: 'module' }));
let result = spawnSync(process.execPath, [pnpm, 'add', spec, '--ignore-scripts', '--config.auto-install-peers=true'], { cwd: directory, stdio: 'inherit' });
if (result.error) throw result.error;
assert.equal(result.status, 0, 'GitHub dependency installation failed');
// Judge the mount without any configuration this machine already holds. Both the member
// configuration and the HTTPS-MVP connection resolve from the user's home, so an operator
// who already has a working client would otherwise get state 'configured' and the
// clean-install assertion would fail for a reason unrelated to the published artifact.
// This is the same isolation check.mjs already applies to every offline check.
const isolatedHome = mkdtempSync(join(directory, 'home-'));
const isolatedEnv = {
  ...process.env,
  HOME: isolatedHome,
  USERPROFILE: isolatedHome,
  DSH_COLLABORATION_CLIENT_CONFIG: '',
  DSH_COLLABORATION_PACKAGE_ROOT: '',
  DSH_MENU_DIAGNOSIS_ARTIFACTS: '',
  COLLABORATION_OFFICIAL_NODE_MODULES: ''
};
const missingConfig = join(isolatedHome, 'missing-client.json');
const source = `import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {homedir} from 'node:os';
import {Context} from '@deepseek-ai/cordis';
import {LlmRuntime} from '@deepseek-ai/dsh-llm';
import * as plugin from 'dsh-collaboration-client';
const metadata=JSON.parse(readFileSync(new URL('./node_modules/dsh-collaboration-client/package.json',import.meta.url),'utf8'));
assert.equal(metadata.version,${JSON.stringify(expected.version)});assert.equal(metadata.dsh.bundle.patch,'cordis.patch.yml');
assert.equal(homedir(),${JSON.stringify(isolatedHome)},'Smoke home is not isolated');
const ctx=new Context(),llm=ctx.plugin(LlmRuntime);await llm.await();
try{const entry=ctx.plugin(plugin,{configFile:${JSON.stringify(missingConfig)}});await entry.await();
// collaborationMemberStatus is only set from the connection's onChange, so an unconfigured
// install leaves it {} and reading .state there is not a valid clean-install assertion.
// The connection service is what the settings UI reads, and it always carries the state.
const connection=entry.ctx.get('collaborationMemberConnection');
assert.ok(connection,'Member connection service must exist so the settings UI stays usable');
assert.equal(connection.resolved.state,'configuration-required');
assert.ok(!connection.client,'No client may be created without configuration');
assert.ok(connection.resolved.configPath.startsWith(${JSON.stringify(isolatedHome)}),'Resolved configuration escaped the isolated home');
assert.equal(entry.ctx.get('collaborationMemberClient'),undefined);
assert.equal(ctx.llm.listProviders().some(p=>p.id==='collaboration-remote'),false);}finally{await ctx.fiber.dispose();}
console.log(JSON.stringify({githubSource:${JSON.stringify(spec)},version:metadata.version,isolatedMount:'PASS',lifecycleBuildRequired:false,sshStarted:false,configurationSourceIsolated:true}));`;
const file = join(directory, 'smoke.mjs'); writeFileSync(file, source);
result = spawnSync(process.execPath, [file], { cwd: directory, stdio: 'inherit', env: isolatedEnv });
if (result.error) throw result.error;
assert.equal(result.status, 0, 'Installed GitHub package mount failed');
