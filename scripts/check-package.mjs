import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve,join,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {loadBrowserThroughDsh} from '../test/helpers/browser-host.mjs';
import {parsePackageTar} from './package-archive.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tarball=process.argv[2];if(!tarball)throw new Error('Usage: node scripts/check-package.mjs <tarball>');
const entries=parsePackageTar(gunzipSync(readFileSync(resolve(tarball))));
const metadata=JSON.parse(entries.get('package.json').toString('utf8'));const {packageManager:sourcePackageManager,...sourceManifest}=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));if(sourcePackageManager!==undefined)assert.equal(sourcePackageManager,'pnpm@11.7.0');assert.deepEqual(metadata,sourceManifest,'Packed manifest differs beyond the pinned pnpm packageManager removal/JSON formatting');for(const [name,bytes]of entries)if(name!=='package.json')assert.deepEqual(bytes,readFileSync(join(root,name)),'Packed artifact differs from checked source '+name);for(const name of entries.keys())assert.ok(!/(^|\/)(?:node_modules|\.git|\.dsh)(?:\/|$)|\.sqlite(?:-|$)/.test(name),'Generated/private file in package '+name);
const declared=[metadata.main,...Object.values(metadata.exports??{}),...Object.values(metadata.bin??{})].filter(v=>typeof v==='string');for(const name of declared)assert.ok(entries.has(name.replace(/^\.\//,'')),'Package entry missing '+name);
for(const [name,bytes]of entries){if(!name.endsWith('.mjs')&&!name.endsWith('.js'))continue;for(const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*|import\()\s*['"](\.[^'"]+)['"]/g)){const target=posix.normalize(posix.join(posix.dirname(name),match[1]));assert.ok(entries.has(target),'Internal packaged import missing '+name+' => '+target);}}
mkdirSync(join(root,'.dsh'),{recursive:true});const detached=mkdtempSync(join(root,'.dsh/packed-'));for(const[name,bytes]of entries){const target=join(detached,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
assert.equal(metadata.license, 'MIT', 'Package must declare the approved MIT license');
assert.ok(entries.has('LICENSE'), 'License text missing from distributable');
assert.match(entries.get('LICENSE').toString('utf8'), /^MIT License\r?\n/);
assert.ok(entries.has('cordis.patch.yml'), 'DSH bundle patch missing');
assert.equal(metadata.dsh?.bundle?.patch, 'cordis.patch.yml');
assert.equal(metadata.exports?.['./client'],'./lib/client.js','DSH ./client must be the classic browser bundle, not Node MemberClient');
assert.equal(metadata.exports?.['./member-client'],'./src/member-client.mjs','Node MemberClient needs its own distinct export');
assert.deepEqual(metadata.dsh?.client?.external,[],'Browser uses only static shell baseline externals');
assert.match(entries.get('cordis.patch.yml').toString('utf8'), /disabled:\s*false/,'Fresh bundle must start the local component without an opt-in patch');
assert.ok(entries.has('src/configuration.mjs'));
for(const name of ['src/configuration.mjs','src/member-connection.mjs','src/member-plugin.mjs','src/member-client.mjs','src/member-rpc.mjs','src/project-selection.mjs','src/ssh.mjs','src/ssh-diagnostics.mjs','lib/client.js','cordis.patch.yml','docs/PROTOCOL-v3.json','docs/DINGTALK-LOGIN.md','docs/INSTALL.md','docs/VERIFY.md','docs/LOCAL-STATUS-RPC-FIX.md','docs/LOGIN-CONNECTION-DIAGNOSTICS.md','docs/PROJECT-MENU.md','docs/MENU-INJECT-FIX.md','docs/MODEL-TRIGGER-STYLE.md','test/model-trigger-style.test.mjs','test/menu-runtime-composition.integration.mjs','docs/设计确认-模型菜单项目选择.md','test/fixtures/project-menu.dom.json','.github/workflows/release.yml','docs/development-lock.snapshot.yaml'])assert.deepEqual(entries.get(name),readFileSync(join(root,name)),'Stale or missing local login artifact '+name);
assert.deepEqual(entries.get('docs/development-lock.snapshot.yaml'),readFileSync(join(root,'pnpm-lock.yaml')),'Development lock snapshot must match the checked dependency lock');
assert.ok(entries.has('scripts/check-config.mjs'));
assert.ok(entries.has('examples/client-config.example.json'));
const example = JSON.parse(entries.get('examples/client-config.example.json').toString('utf8'));
assert.equal(example.serviceId, ''); assert.equal(example.ssh.host, '');
const smoke=metadata.name==='dsh-collaboration-client'
 ? 'const m=await import('+JSON.stringify(pathToFileURL(join(detached,'src/member-plugin.mjs')).href)+');if(typeof m.apply!=="function"||typeof m.MemberAdapter!=="function")throw new Error("Missing plugin exports");'
 : 'const m=await import('+JSON.stringify(pathToFileURL(join(detached,'src/collaboration-runtime.mjs')).href)+');const {runtime}=await m.createCollaborationRuntime({workspace:'+JSON.stringify(join(detached,'.state/workspace'))+',stateRoot:'+JSON.stringify(join(detached,'.state/data'))+',fixture:true});await runtime.closeAll();';
// Detached source uses this project installed dependencies through normal Node resolution.
const browser=await loadBrowserThroughDsh(detached);
assert.equal(browser.clientPath,join(detached,'lib/client.js'),'Detached official host must serve the browser bundle');
const code=smoke+'const member=await import('+JSON.stringify(pathToFileURL(join(detached,'src/member-client.mjs')).href)+');if(typeof member.MemberClient!=="function")throw new Error("Missing separate Node MemberClient");'
 +'const {Context}=await import("@deepseek-ai/cordis"),{LlmRuntime}=await import("@deepseek-ai/dsh-llm");const ctx=new Context();await ctx.plugin(LlmRuntime).await();try{const fiber=ctx.plugin(m,{configFile:'+JSON.stringify(join(detached,'.fixture/missing.json'))+'});await fiber.await();if(fiber.state!==2||fiber.ctx.get("collaborationMemberClient")!==undefined||ctx.llm.listProviders().length)throw Error("Pending installed component must stay active without routes or SSH");}finally{await ctx.fiber.dispose();}';
const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:detached,stdio:'inherit',env:{...process.env,HOME:join(detached,'.fixture/home'),USERPROFILE:join(detached,'.fixture/home'),DSH_COLLABORATION_CLIENT_CONFIG:''}});if(result.error)throw result.error;assert.equal(result.status,0,'Detached package smoke failed');
const checked=spawnSync(process.execPath,['scripts/audit.mjs'],{cwd:detached,stdio:'inherit'});if(checked.error)throw checked.error;assert.equal(checked.status,0,'Detached import/document audit failed');
const testHome=join(detached,'.fixture/test-home');mkdirSync(testHome,{recursive:true});
const tests=spawnSync(process.execPath,['--test','test/*.test.mjs','test/*.integration.mjs'],{cwd:detached,stdio:'inherit',env:{...process.env,HOME:testHome,USERPROFILE:testHome,DSH_COLLABORATION_PACKAGE_ROOT:detached,DSH_MENU_DIAGNOSIS_ARTIFACTS:'',DSH_COLLABORATION_CLIENT_CONFIG:'',COLLABORATION_OFFICIAL_NODE_MODULES:''}});if(tests.error)throw tests.error;assert.equal(tests.status,0,'Detached full unit/integration suite failed');
console.log(JSON.stringify({package:metadata.name,version:metadata.version,files:entries.size,detachedPackageSmoke:'PASS',allPackagedFilesMatchSource:'PASS',pinnedPnpmManifestNormalizationOnly:true,detachedUnitAndIntegration:'PASS',detachedDocumentationLinks:'PASS',officialBrowserRegistryAndModuleSystem:'PASS',manifestSelectedClassicScript:'PASS',officialSettingsAndCurrentSessionProjectDom:'PASS',tracedRemoteDependencyRegression:'PASS',nativeModelTriggerStyleRegression:'PASS',officialBrowserConnectionCodecAndHostFetch:'PASS',actualMemberStatusRendered:'PASS',projectMenuRefreshIsolationAndUnload:'PASS',officialProjectRouteAssembly:'PASS',sshEndingDiagnosticsAndLoginFailure:'PASS',oldRepositoryUsed:false,fixtureOnly:true,userGuiTested:false}));
