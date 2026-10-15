import test from 'node:test';
import assert from 'node:assert/strict';
import{readFileSync,mkdtempSync,mkdirSync,copyFileSync,writeFileSync}from'node:fs';
import{resolve,dirname,join}from'node:path';
import{fileURLToPath}from'node:url';
import{loadBrowserThroughDsh}from'./helpers/browser-host.mjs';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');

test('official host loading rejects the original manifest bug even when a valid browser bundle is present',async()=>{
  mkdirSync(join(root,'.dsh'),{recursive:true});const detached=mkdtempSync(join(root,'.dsh/client-boot-negative-'));
  for(const name of ['lib/client.js','src/member-plugin.mjs','src/member-client.mjs']){const path=join(detached,name);mkdirSync(dirname(path),{recursive:true});copyFileSync(join(root,name),path);}
  const manifest=JSON.parse(readFileSync(join(root,'package.json'),'utf8'));manifest.exports['./client']='./src/member-client.mjs';
  writeFileSync(join(detached,'package.json'),JSON.stringify(manifest));
  await assert.rejects(loadBrowserThroughDsh(detached),/Cannot use import statement outside a module/);
});
