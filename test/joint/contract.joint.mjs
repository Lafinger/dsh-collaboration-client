import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const serverRoot=process.env.DSH_COLLABORATION_SERVER_ROOT;
if(!serverRoot)throw new Error('Joint check only: set DSH_COLLABORATION_SERVER_ROOT');
test('client and selected server checkout use same versioned wire contract',()=>{
 assert.equal(readFileSync(new URL('../../docs/PROTOCOL-v3.json',import.meta.url),'utf8'),readFileSync(join(serverRoot,'docs/PROTOCOL-v3.json'),'utf8'));
 assert.equal(readFileSync(new URL('../../src/protocol.mjs',import.meta.url),'utf8'),readFileSync(join(serverRoot,'src/protocol.mjs'),'utf8'));
});
