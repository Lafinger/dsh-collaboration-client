import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveMemberConfiguration} from '../src/configuration.mjs';
import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';
import {fileURLToPath} from 'node:url';

const setup=()=>{const root=mkdtempSync(join(tmpdir(),'member-discovery-'));const nested=join(root,'one');mkdirSync(nested);writeFileSync(join(nested,'key'),'fixture');writeFileSync(join(nested,'known_hosts'),'fixture');const value={serviceId:'s',loginOrigin:'https://login.example.test',databasePath:join(nested,'state.sqlite'),ssh:{host:'example.test',account:'alice',identityFile:join(nested,'key'),knownHostsFile:join(nested,'known_hosts')}};writeFileSync(join(nested,'collaboration-client.json'),JSON.stringify(value));return {root,nested,value};};

test('default discovery adopts the only valid one-level member config without editing a profile or root file',()=>{
 const {root,nested}=setup();const result=resolveMemberConfiguration({}, {fallbackPath:join(root,'collaboration-client.json'),env:{}});
 assert.equal(result.state,'configured');assert.equal(result.configPath,join(nested,'collaboration-client.json'));assert.equal(result.source,'discovery');
});
test('fresh bundle starts the component by default, without install scripts or eager remote calls',()=>{
 const patch=readFileSync(new URL('../cordis.patch.yml',import.meta.url),'utf8');assert.match(patch,/disabled:\s*false/);
 const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));for(const lifecycle of ['install','postinstall','prepare'])assert.equal(manifest.scripts[lifecycle],undefined);
});
test('browser uses settings-only identity entry and does not expose the removed standalone project component',async()=>{
 const {browser}=await loadBrowserThroughDsh(fileURLToPath(new URL('..',import.meta.url)));
 const waits=[],entries=[];const ctx={connection:{rpc:{call(){throw Error('No eager RPC');}}},slots:{inject:(name,fn)=>{waits.push(name);if(name==='settings.section')return fn();return()=>{};},register:options=>{entries.push(options);return()=>{};}},inject:(services,fn)=>{assert.ok(!services.includes('layout'));assert.ok(!services.includes('pluginNavigation'));}};
 browser.apply(ctx);assert.equal(entries[0].label,'协作服务');assert.ok(!waits.includes('main'));assert.equal(browser.ProjectSelectionArea,undefined);
});
