import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {evaluatePluginCompatibility,getDshRuntimeVersion} from '@deepseek-ai/dsh-app-boot';
const metadata=JSON.parse(readFileSync(new URL('../package.json',import.meta.url),'utf8'));
test('official current host gate rejects the legacy manifest and accepts the fixed plugin without exemptions',()=>{
 const runtime=getDshRuntimeVersion();assert.equal(runtime,'0.2.1-rc.2');
 const legacy={...metadata,engines:{...metadata.engines,dsh:'0.2.0-rc.2'}};
 const rejected=evaluatePluginCompatibility(legacy,{},runtime);
 assert.equal(rejected.exempted,false);assert.equal(rejected.requirements['engines.dsh'],'0.2.0-rc.2');
 assert.equal(evaluatePluginCompatibility(metadata,{},runtime),undefined);
});
test('plugin targets the current DSH 0.2.1-rc.2 SDK family without a compatibility exemption',()=>{
 assert.equal(metadata.engines.dsh,'0.2.1-rc.2');
 for(const [name,version] of Object.entries({...metadata.peerDependencies,...metadata.devDependencies})){
  if(name.startsWith('@deepseek-ai/dsh-'))assert.equal(version,'0.2.1-rc.2',name);
 }
 assert.equal(metadata.peerDependencies['@deepseek-ai/cordis'],'4.0.5');
 assert.equal(metadata.peerDependencies['@deepseek-ai/schemastery'],'3.18.5');
 assert.equal(metadata.private,true);
 assert.match(metadata.version,/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/);
});
