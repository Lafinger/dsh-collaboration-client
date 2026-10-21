import test from 'node:test';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {loadBrowserThroughDsh} from './helpers/browser-host.mjs';
const root=fileURLToPath(new URL('..',import.meta.url));
async function entry(rpc){
 const {browser}=await loadBrowserThroughDsh(root);let call,reset;
 browser.apply({connection:{rpc:{call:rpc}},on:(_name,fn)=>{reset=fn;return ()=>{};},effect:fn=>fn(),inject:()=>{},slots:{inject:(_name,fn)=>fn(),register:options=>{call=options.inject().call;return ()=>{};}}});
 return {call,reset:()=>reset()};
}
for(const action of ['role','create'])test('management '+action+' transport failure is an unknown write, never safe to replay',async()=>{
 const {call}=await entry(async()=>{throw Error('HTTP 502 fixture');});
 await assert.rejects(call('administration',{action}),error=>error.outcome==='unknown');
});
test('read-only management transport failure is not marked as unknown write',async()=>{
 const {call}=await entry(async()=>{throw Error('fixture read failure');});
 await assert.rejects(call('administration',{action:'view'}),error=>error.outcome===undefined);
});
test('reset while role assignment response is pending is an unknown write',async()=>{
 let resolve;const pending=new Promise(r=>resolve=r);const e=await entry(()=>pending);
 const result=e.call('administration',{action:'role'});e.reset();resolve({ok:true,value:{ok:true}});
 await assert.rejects(result,error=>error.outcome==='unknown');
});
test('malformed role response is an unknown write rather than a definitive rejection',async()=>{
 const {call}=await entry(async()=>null);
 await assert.rejects(call('administration',{action:'role'}),error=>error.outcome==='unknown');
});
test('definitive role rejection retains the server message without inventing unknown outcome',async()=>{
 const {call}=await entry(async()=>({ok:false,error:{message:'fixture revision rejected',details:{}}}));
 await assert.rejects(call('administration',{action:'role'}),error=>error.message==='fixture revision rejected'&&error.outcome===undefined);
});
