import test from'node:test';import assert from'node:assert/strict';import{Context}from'@deepseek-ai/cordis';
import{installMemberRpc}from'../src/member-rpc.mjs';import{createOfficialHostConnection,installOfficialBrowserConnection}from'./helpers/official-connection.mjs';

test('actual official browser Connection reads status through real Host route and preserves success payload',async()=>{
 const host=createOfficialHostConnection(),browser=new Context();
 try{
  const cfg={state:'configured',source:'discovery',serviceId:'fixture',account:'alice'},client={verifyAuthStatus:async()=>({authenticated:false,serviceId:'fixture'})};
  installMemberRpc(host,{client,status:cfg});const connection=installOfficialBrowserConnection(browser,host);
  const result=await connection.rpc.call('/api','collaboration/member',{method:'status',payload:{}});
  assert.equal(result.ok,true);assert.ok(result.value,'Host result must survive official browser decoder');assert.equal(result.value.configuration.serviceId,'fixture');assert.equal(result.value.authenticated,false);
 }finally{await browser.fiber.dispose();await host.fiber.dispose();}
});
