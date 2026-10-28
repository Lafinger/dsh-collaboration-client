import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
const serverRoot=process.env.DSH_COLLABORATION_SERVER_ROOT;
if(!serverRoot)throw new Error('Joint check only: set DSH_COLLABORATION_SERVER_ROOT');
test('client and selected server checkout use same versioned wire contract',()=>{
 assert.equal(readFileSync(new URL('../../docs/PROTOCOL-v3.json',import.meta.url),'utf8'),readFileSync(join(serverRoot,'docs/PROTOCOL-v3.json'),'utf8'));
 assert.equal(readFileSync(new URL('../../src/protocol.mjs',import.meta.url),'utf8'),readFileSync(join(serverRoot,'src/protocol.mjs'),'utf8'));
 // The current-human admission vocabulary decides what a message authorizes on both sides, so the two
 // repositories must ship the same bytes or one can authorize an archive the other refuses.
 assert.equal(readFileSync(new URL('../../src/human-intent.mjs',import.meta.url),'utf8'),readFileSync(join(serverRoot,'src/human-intent.mjs'),'utf8'));
});
