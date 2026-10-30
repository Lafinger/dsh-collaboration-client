import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';import {join} from 'node:path';
const serverRoot=process.env.DSH_COLLABORATION_SERVER_ROOT;
if(!serverRoot)throw new Error('Joint check only: set DSH_COLLABORATION_SERVER_ROOT');
// Compare content, not checkout line endings: the server tree may use autocrlf.
const normalize=value=>value.replace(/\r\n/gu,'\n');
test('client and selected server checkout use same versioned wire contract',()=>{
 assert.equal(normalize(readFileSync(new URL('../../docs/PROTOCOL-v4.json',import.meta.url),'utf8')),normalize(readFileSync(join(serverRoot,'docs/PROTOCOL-v4.json'),'utf8')));
 assert.equal(normalize(readFileSync(new URL('../../src/protocol.mjs',import.meta.url),'utf8')),normalize(readFileSync(join(serverRoot,'src/protocol.mjs'),'utf8')));
});
