import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { MemberClient } from '../src/member-client.mjs';
import { initializeParams, requireInitializeResult, collaborationMeta } from '../src/protocol.mjs';

test('client fails closed on old/missing/future/base protocol responses before identity or business calls',async()=>{
 for(const result of [{protocolVersion:1},{protocolVersion:1,_meta:{collaborationProtocolVersion:1}},{protocolVersion:1,_meta:{collaborationProtocolVersion:2}},{protocolVersion:1,_meta:{collaborationProtocolVersion:4}},{protocolVersion:2,_meta:collaborationMeta()}]){
   const calls=[];const peer=new EventEmitter();peer.closed=false;peer.close=()=>{peer.closed=true;};peer.error=()=>{};peer.request=async(method,params)=>{calls.push(method);assert.deepEqual(params,{...initializeParams(),clientCapabilities:{humanAuthorization:{version:2}}});return result;};
   const client=new MemberClient({connect:async()=>peer,databasePath:':memory:',serviceId:'fixture',account:'bob'});
   try{await assert.rejects(client.prompt('local',{messageId:'one',text:'not sent'}),error=>error.code===-32011);assert.deepEqual(calls,['initialize']);assert.equal(peer.closed,true);assert.equal(client.mapping('local'),undefined);assert.equal(client.db.prepare('SELECT count(*) n FROM client_submissions').get().n,0);}finally{client.close();}
 }
});
test('base version 1 and collaboration version 3 are separate exact contracts',()=>{
 assert.deepEqual(initializeParams(),{protocolVersion:1,clientCapabilities:{},_meta:{collaborationProtocolVersion:3}});
 assert.doesNotThrow(()=>requireInitializeResult({protocolVersion:1,_meta:collaborationMeta()}));
 assert.throws(()=>requireInitializeResult({protocolVersion:1,_meta:{collaborationProtocolVersion:'2'}}),error=>error.code===-32011);
});
