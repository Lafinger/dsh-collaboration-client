import {spawnSync} from 'node:child_process';
import {readdirSync,mkdirSync,mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {fileURLToPath} from 'node:url';
import {dirname,join,resolve} from 'node:path';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const testHome=mkdtempSync(join(tmpdir(),'collaboration-check-home-'));
function run(args){const r=spawnSync(process.execPath,args,{cwd:root,stdio:'inherit',env:{...process.env,HOME:testHome,USERPROFILE:testHome,DSH_COLLABORATION_CLIENT_CONFIG:'',DSH_COLLABORATION_PACKAGE_ROOT:'',DSH_MENU_DIAGNOSIS_ARTIFACTS:'',COLLABORATION_OFFICIAL_NODE_MODULES:''}});if(r.error)throw r.error;if(r.status!==0)throw new Error(`Check exited ${r.status}: ${args.join(' ')}`);}
function scan(dir){for(const e of readdirSync(dir,{withFileTypes:true})){const p=join(dir,e.name);if(e.isDirectory())scan(p);else if(/\.(?:mjs|js)$/.test(e.name))run(['--check',p]);}}
run(['scripts/build-client.mjs']);for(const dir of ['src','scripts','test','client'])scan(join(root,dir));
run(['--test','test/*.test.mjs']);run(['--test','test/*.integration.mjs']);
run(['scripts/audit.mjs']);run(['scripts/check-naming.mjs']);
mkdirSync(join(root,'.dsh/evidence'),{recursive:true});writeFileSync(join(root,'.dsh/evidence/check.json'),JSON.stringify({result:'PASS',node:process.version,independentDependencies:true,officialBrowserRegistryAndModuleSystem:true,manifestSelectedClassicScript:true,officialSettingsDom:true,officialBrowserConnectionCodecAndHostFetch:true,actualMemberStatusRendered:true,officialModelSelectorDom:true,nativeModelTriggerStyleRegression:true,tracedRemoteDependencyRegression:true,projectMenuRefreshAndIsolation:true,officialSessionProjectRouteAssembly:true,projectSelectionJournalAndUnknownOutcome:true,menuUnloadFallback:true,defaultBundleLoaderAndExplicitDisable:true,sshEndingDiagnosticsAndLoginFailure:true,localSubprocessStdioFixture:true,realSshTested:false,guiTested:false,timestamp:new Date().toISOString()},null,2));
