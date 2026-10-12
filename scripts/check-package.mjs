import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync,mkdtempSync,existsSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {dirname,resolve,join,posix} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const tarball=process.argv[2];if(!tarball)throw new Error('Usage: node scripts/check-package.mjs <tarball>');
const tar=gunzipSync(readFileSync(resolve(tarball)));const entries=new Map();let offset=0;
function field(block,start,length){return block.subarray(start,start+length).toString('utf8').replace(/\0.*$/s,'');}
while(offset+512<=tar.length){const block=tar.subarray(offset,offset+512);if(block.every(v=>v===0))break;const name=field(block,0,100);const prefix=field(block,345,155);const filename=(prefix?prefix+'/':'')+name;const size=parseInt(field(block,124,12).trim()||'0',8);const type=field(block,156,1)||'0';offset+=512;
 if(!Number.isSafeInteger(size)||size<0||offset+size>tar.length)throw new Error('Invalid archive length');
 if(type==='0'){assert.ok(filename.startsWith('package/')&&!filename.split('/').includes('..'),'Unsafe tar entry');entries.set(filename.slice(8),Buffer.from(tar.subarray(offset,offset+size)));}
 else if(!['5','x','g'].includes(type))throw new Error('Unsupported tar entry '+type);
 offset+=Math.ceil(size/512)*512;
}
const metadata=JSON.parse(entries.get('package.json').toString('utf8'));for(const name of entries.keys())assert.ok(!/(^|\/)(?:node_modules|\.git|\.dsh)(?:\/|$)|\.sqlite(?:-|$)/.test(name),'Generated/private file in package '+name);
const declared=[metadata.main,...Object.values(metadata.exports??{}),...Object.values(metadata.bin??{})].filter(v=>typeof v==='string');for(const name of declared)assert.ok(entries.has(name.replace(/^\.\//,'')),'Package entry missing '+name);
for(const [name,bytes]of entries){if(!name.endsWith('.mjs')&&!name.endsWith('.js'))continue;for(const match of bytes.toString('utf8').matchAll(/(?:from\s*|import\s*|import\()\s*['"](\.[^'"]+)['"]/g)){const target=posix.normalize(posix.join(posix.dirname(name),match[1]));assert.ok(entries.has(target),'Internal packaged import missing '+name+' => '+target);}}
mkdirSync(join(root,'.dsh'),{recursive:true});const detached=mkdtempSync(join(root,'.dsh/packed-'));for(const[name,bytes]of entries){const target=join(detached,name);mkdirSync(dirname(target),{recursive:true});writeFileSync(target,bytes);}
assert.equal(metadata.license, 'MIT', 'Package must declare the approved MIT license');
assert.ok(entries.has('LICENSE'), 'License text missing from distributable');
assert.match(entries.get('LICENSE').toString('utf8'), /^MIT License\r?\n/);
assert.ok(entries.has('cordis.patch.yml'), 'DSH bundle patch missing');
assert.equal(metadata.dsh?.bundle?.patch, 'cordis.patch.yml');
assert.match(entries.get('cordis.patch.yml').toString('utf8'), /disabled:\s*true/);
assert.ok(entries.has('src/configuration.mjs'));
assert.ok(entries.has('scripts/check-config.mjs'));
assert.ok(entries.has('examples/client-config.example.json'));
const example = JSON.parse(entries.get('examples/client-config.example.json').toString('utf8'));
assert.equal(example.serviceId, ''); assert.equal(example.ssh.host, '');
const smoke=metadata.name==='dsh-collaboration-client'
 ? 'const m=await import('+JSON.stringify(pathToFileURL(join(detached,'src/member-plugin.mjs')).href)+');if(typeof m.apply!=="function"||typeof m.MemberAdapter!=="function")throw new Error("Missing plugin exports");'
 : 'const m=await import('+JSON.stringify(pathToFileURL(join(detached,'src/workbench-runtime.mjs')).href)+');const {runtime}=await m.createWorkbenchRuntime({workspace:'+JSON.stringify(join(detached,'.state/workspace'))+',stateRoot:'+JSON.stringify(join(detached,'.state/data'))+',fixture:true});await runtime.closeAll();';
// Detached source uses this project installed dependencies through normal Node resolution.
const code=smoke;
const result=spawnSync(process.execPath,['--input-type=module','-e',code],{cwd:detached,stdio:'inherit'});if(result.error)throw result.error;assert.equal(result.status,0,'Detached package smoke failed');console.log(JSON.stringify({package:metadata.name,files:entries.size,detachedPackageSmoke:'PASS',oldRepositoryUsed:false,fixtureOnly:true}));
