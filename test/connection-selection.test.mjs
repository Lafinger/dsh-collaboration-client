import test from'node:test';import assert from'node:assert/strict';
import{mkdtempSync,mkdirSync,writeFileSync,readFileSync,renameSync,symlinkSync,existsSync}from'node:fs';import{tmpdir}from'node:os';import{join}from'node:path';
import{resolveMemberConfiguration,discoverMemberConfigurations,validateMemberConfiguration,selectionFileName}from'../src/configuration.mjs';
import{MemberConnection}from'../src/member-connection.mjs';import{MemberClient}from'../src/member-client.mjs';
const create=()=>{const root=mkdtempSync(join(tmpdir(),'connection-choices-')),file=join(root,'collaboration-client.json');return{root,file,env:{}};};
function config(root,name='one',account='alice'){const directory=join(root,name);mkdirSync(directory,{recursive:true});const value={serviceId:'s',loginOrigin:'https://login.example.test',databasePath:join(directory,'state.sqlite'),ssh:{host:'example.test',account,identityFile:join(directory,'key'),knownHostsFile:join(directory,'known_hosts')}};writeFileSync(value.ssh.identityFile,'fixture—not a real key');writeFileSync(value.ssh.knownHostsFile,'fixture');writeFileSync(join(directory,'collaboration-client.json'),JSON.stringify(value));return value;}
function mounted(t,fixture){let calls=0;const entry=new MemberConnection({fallbackPath:fixture.file,env:{},input:fixture.input??{},createClient:cfg=>new MemberClient({...cfg,account:cfg.ssh.account,requireLogin:true,connect:async()=>{calls++;throw Error('No network in this test');}})});t.after(()=>entry.close());return{entry,get calls(){return calls;}};}

test('automatic discovery is bounded, ignores arbitrary/deep JSON and linked directories, and asks on ambiguity',()=>{
 const {root,file}=create();const one=config(root);const deep=config(root,'deep/nested','other');writeFileSync(join(root,'unrelated.json'),JSON.stringify(deep));
 assert.equal(resolveMemberConfiguration({},{fallbackPath:file,env:{}}).config.ssh.account,'alice');
 config(root,'two','bob');const ambiguous=resolveMemberConfiguration({},{fallbackPath:file,env:{}});assert.equal(ambiguous.state,'configuration-required');assert.match(ambiguous.issue,/多份/);
 writeFileSync(file,JSON.stringify(one));assert.equal(resolveMemberConfiguration({},{fallbackPath:file,env:{}}).configPath,file);
 const outer=mkdtempSync(join(tmpdir(),'connection-outside-'));config(outer,'external');symlinkSync(join(outer,'external'),join(root,'linked'),process.platform==='win32'?'junction':'dir');
 assert.ok(!discoverMemberConfigurations({fallbackPath:file}).some(row=>row.id.startsWith('linked/')));
});
test('a saved UI choice overrides legacy explicit config, survives restart and never falls back if changed or removed',t=>{
 const f=create(),one=config(f.root),two=config(f.root,'two','bob');f.input={configFile:join(f.root,'one','collaboration-client.json')};
 const before=readFileSync(f.input.configFile,'utf8');const fixture=mounted(t,f);assert.equal(fixture.entry.client.account,'alice');
 fixture.entry.select('two/collaboration-client.json');assert.equal(fixture.entry.client.account,'bob');assert.equal(fixture.calls,0);assert.equal(readFileSync(f.input.configFile,'utf8'),before);
 const resolved=resolveMemberConfiguration(f.input,{fallbackPath:f.file,env:{}});assert.equal(resolved.source,'saved-selection');assert.equal(resolved.config.ssh.account,'bob');
 writeFileSync(join(f.root,'two','collaboration-client.json'),JSON.stringify({...two,ssh:{...two.ssh,account:'charlie'}}));
 assert.equal(resolveMemberConfiguration(f.input,{fallbackPath:f.file,env:{}}).state,'configuration-required');assert.equal(fixture.entry.status.state,'configuration-required');
 renameSync(join(f.root,'two','collaboration-client.json'),join(f.root,'two','moved.json'));assert.equal(resolveMemberConfiguration(f.input,{fallbackPath:f.file,env:{}}).state,'configuration-required');
 assert.ok(!JSON.stringify(fixture.entry.candidates()).includes('fixture—not a real key'));assert.equal(one.ssh.account,'alice');
});
test('switch guard covers logged-in, pending login, busy turn, transport and operation races; auto reset is explicit',async t=>{
 const f=create();config(f.root);config(f.root,'two','bob');f.input={configFile:join(f.root,'one','collaboration-client.json')};const {entry}=mounted(t,f);
 entry.client.login={token:'SECRET',expiresAt:Date.now()+60000};assert.throws(()=>entry.select('two/collaboration-client.json'),/退出/);entry.client.login=null;
 entry.client.pendingLogin={proof:'SECRET'};assert.throws(()=>entry.reset(),/退出/);entry.client.pendingLogin=null;
 entry.client.busy.add('local');assert.throws(()=>entry.select('two/collaboration-client.json'),/执行中/);entry.client.busy.clear();
 entry.operations++;assert.throws(()=>entry.select('two/collaboration-client.json'),/操作/);entry.operations--;
 entry.client.connecting=Promise.resolve();assert.throws(()=>entry.reset(),/操作/);entry.client.connecting=null;
 entry.select('two/collaboration-client.json');const old=entry.client;entry.reset();assert.equal(old.stopped,true);assert.equal(entry.client,null);assert.equal(entry.status.state,'configuration-required');
 assert.equal(JSON.parse(readFileSync(join(f.root,selectionFileName),'utf8')).mode,'auto');
 assert.equal(resolveMemberConfiguration(f.input,{fallbackPath:f.file,env:{}}).state,'configuration-required');
});
test('import validates only connection JSON, creates a separate candidate and never overwrites root or echoes credentials',t=>{
 const f=create(),value=config(f.root);writeFileSync(f.file,JSON.stringify(value));const before=readFileSync(f.file,'utf8'),{entry}=mounted(t,f);
 assert.throws(()=>entry.importConfig(JSON.stringify({...value,apiKey:'SECRET-KEY'})),/不支持字段/);assert.equal(existsSync(join(f.root,selectionFileName)),false);
 const imported=entry.importConfig(JSON.stringify(value));assert.equal(imported.source,'saved-selection');assert.match(imported.configPath,/import-/);assert.equal(readFileSync(f.file,'utf8'),before);assert.equal(entry.client.peer,null);
});
test('logged-in file mutation is fail-closed but explicit logout remains possible without logging in another account',async t=>{
 const f=create(),value=config(f.root),fixture=mounted(t,f),{entry}=fixture;entry.select('one/collaboration-client.json');
 entry.client.login={token:'PRIVATE-TOKEN',account:'alice',serviceId:'s',expiresAt:Date.now()+60000};
 writeFileSync(join(f.root,'one','collaboration-client.json'),JSON.stringify({...value,ssh:{...value.ssh,account:'bob'}}));
 const status=await entry.run('verifyAuthStatus');assert.equal(status.authenticated,false);assert.equal(entry.client.account,'alice');assert.equal(fixture.calls,0);
 await assert.rejects(entry.run('projects'),/已丢失或改变/);await assert.rejects(entry.refresh(),/退出/);assert.ok(!JSON.stringify(entry.candidates()).includes('PRIVATE-TOKEN'));
 entry.client.logout=async()=>{entry.client.login=null;entry.client.pendingLogin=null;return{authenticated:false};};await entry.run('logout');entry.select('one/collaboration-client.json');assert.equal(entry.client.account,'bob');assert.equal(entry.client.login,null);
});
test('repeated rescan cannot silently adopt a changed active automatic identity; an explicit choice is required',async t=>{
 const f=create(),value=config(f.root),{entry}=mounted(t,f),old=entry.client;
 writeFileSync(join(f.root,'one','collaboration-client.json'),JSON.stringify({...value,ssh:{...value.ssh,account:'bob'}}));
 await entry.refresh();assert.equal(old.stopped,true);assert.equal(entry.client,null);await entry.refresh();assert.equal(entry.client,null);assert.equal(entry.status.state,'configuration-required');
 entry.select('one/collaboration-client.json');assert.equal(entry.client.account,'bob');
});
test('async login/project operations block switch and logout until settled',async t=>{
 const f=create();config(f.root);const {entry}=mounted(t,f);let release;entry.client.projects=()=>new Promise(resolve=>{release=resolve;});
 const pending=entry.run('projects');assert.equal(entry.operations,1);assert.throws(()=>entry.reset(),/执行中/);await assert.rejects(entry.run('logout'),/正在操作/);release([]);await pending;assert.equal(entry.operations,0);entry.reset();
});
test('bad saved-selection JSON never falls back, and failed state opening preserves a usable entry and saved choice',t=>{
 const f=create(),value=config(f.root),{entry}=mounted(t,f);entry.select('one/collaboration-client.json');const saved=readFileSync(join(f.root,selectionFileName),'utf8'),previous=entry.client;
 const broken=config(f.root,'broken','bob');writeFileSync(broken.databasePath,'not sqlite');assert.throws(()=>entry.select('broken/collaboration-client.json'));assert.equal(entry.client,previous);assert.equal(previous.stopped,false);assert.equal(readFileSync(join(f.root,selectionFileName),'utf8'),saved);
 for(const payload of [null,{version:1,mode:'selected',id:123,fingerprint:0},{version:1,mode:'selected',id:'../../outside',fingerprint:'f'.repeat(64)},'{invalid']){
  writeFileSync(join(f.root,selectionFileName),typeof payload==='string'?payload:JSON.stringify(payload));assert.equal(resolveMemberConfiguration({configFile:join(f.root,'one','collaboration-client.json')},{fallbackPath:f.file,env:{}}).state,'configuration-required');
 }
 entry.reset();assert.equal(value.serviceId,'s');
});
test('import refuses unsupported/relative executable and missing local key references before writing a candidate',t=>{
 const f=create(),value=config(f.root),{entry}=mounted(t,f);
 for(const ssh of [{...value.ssh,sshExecutable:{}},{...value.ssh,sshExecutable:'./untrusted-script'},{...value.ssh,host:'-F'}])assert.equal(validateMemberConfiguration({...value,ssh}).state,'configuration-required');
 assert.throws(()=>entry.importConfig(JSON.stringify({...value,ssh:{...value.ssh,identityFile:join(f.root,'missing-key')}})),/密钥/);
 assert.ok(!discoverMemberConfigurations({fallbackPath:f.file}).some(row=>row.id.startsWith('import-')));
});
test('project choices and saved mappings cannot move to another account even if two configs share SQLite',t=>{
 const f=create(),value=config(f.root);const a=new MemberClient({...value,account:'alice',connect:async()=>{throw Error('not used');}});a.selectProject('local','project');a.close();
 const restarted=new MemberClient({...value,account:'alice',connect:async()=>{throw Error('not used');}});assert.equal(restarted.selectedProject('local'),'project');restarted.db.prepare('INSERT INTO client_mapping VALUES(?,?,?,?,0)').run('local','s','alice','remote');restarted.close();
 const b=new MemberClient({...value,account:'bob',connect:async()=>{throw Error('not used');}});t.after(()=>b.close());assert.equal(b.selectedProject('local'),null);assert.throws(()=>b.selectProject('local','project'),/different account/);assert.throws(()=>b.mapping('local'),/different account/);
});
