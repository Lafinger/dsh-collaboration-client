import test from 'node:test';
import assert from 'node:assert/strict';
import { PassThrough } from 'node:stream';
import { JsonPeer } from '../src/protocol.mjs';
test('malformed/oversized wire input closes instead of dropping pending requests', async()=>{
 const input=new PassThrough(),output=new PassThrough();const peer=new JsonPeer(input,output,{maxFrame:64});const call=peer.request('x',{});input.write('broken-json\n');await assert.rejects(call);assert.equal(peer.closed,true);
 const input2=new PassThrough(),output2=new PassThrough();const second=new JsonPeer(input2,output2,{maxFrame:32});input2.write('a'.repeat(33));assert.equal(second.closed,true);
});
