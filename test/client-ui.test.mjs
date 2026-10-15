import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';

test('the manifest-selected ./client entry executes as a DSH classic script and registers the browser factory',()=>{
  const manifest=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
  const entry=new URL('../'+manifest.exports['./client'].replace(/^\.\//,''),import.meta.url);
  const registrations=[];
  const script=new vm.Script(readFileSync(entry,'utf8'),{filename:'dsh-collaboration-client/client.js'});
  script.runInNewContext({window:{__ModuleLoader__:{load:registration=>registrations.push(registration)}}});
  assert.equal(registrations.length,1);assert.equal(registrations[0].id,manifest.name);
  assert.equal(typeof registrations[0].factory,'function');
});

test('official DSH client registry and module system serve and import the manifest-selected browser half',async()=>{
  const {browser,clientPath,source,modules}=await loadBrowserThroughDsh(fileURLToPath(new URL('..',import.meta.url)));
  assert.ok(clientPath.endsWith('lib/client.js')||clientPath.endsWith('lib\\client.js'));
  assert.deepEqual(Array.from(browser.inject),['connection','slots']);
  assert.equal(await modules.import('dsh-collaboration-client'),browser);
  assert.ok(!source.includes("from 'node:sqlite'"));
});

test('the Node member API remains separately importable without evaluating a browser global',async()=>{
  const {MemberClient}=await import('dsh-collaboration-client/member-client');
  assert.equal(typeof MemberClient,'function');
});

test('browser package loads native plugin entry with no secret/process dependencies and registers login page',()=>{
  const text=readFileSync(new URL('../lib/client.js',import.meta.url),'utf8');
  let module;
  const React={createElement:()=>null};
  vm.runInNewContext(text,{window:{__ModuleLoader__:{load:entry=>{assert.equal(entry.id,'dsh-collaboration-client');module=entry.factory(name=>{assert.ok(['react','react-dom','@deepseek-ai/dsh-client-ui-primitives'].includes(name));return name==='react'?React:{};});}}}});
  assert.deepEqual(Array.from(module.inject),['connection','slots']);assert.equal(typeof module.CollaborationPanel,'function');
  const registrations=[];const ctx={connection:{rpc:{call(){}}},slots:{inject:(name,fn)=>{if(name==='settings.section')return fn();return ()=>{};},register:spec=>{registrations.push(spec);return ()=>{};}},inject:()=>{}};
  module.apply(ctx);assert.equal(registrations[0].id,'collaboration-member');
  assert.ok(!text.includes('private-device-token'));assert.ok(!text.includes('node:'));
});
