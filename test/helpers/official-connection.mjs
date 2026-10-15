// Exercise the pinned official browser request/response codec and Host Fetch routing; no listening server.
import {webcrypto} from'node:crypto';
import {Context} from'@deepseek-ai/cordis';
import {HostConnectionService} from'@deepseek-ai/dsh-client-connection';
import {loadOfficialUi} from'./official-ui.mjs';

export function createOfficialHostConnection(ctx=new Context()){
 // Admission credentials are fixture-owned; the real shared route registry and dispatch are not mocked.
 const auth={isAuthenticated:()=>true};new HostConnectionService(ctx,[],auth);
 return ctx;
}
export function installOfficialBrowserConnection(ctx,host,{baseUrl='http://127.0.0.1:19999/',observe=()=>{},decorateResponse}={}){
 const official=loadOfficialUi('@deepseek-ai/dsh-client-connection',{globals:{crypto:webcrypto,Response,Request,Headers,Blob,FormData}});
 const shared=host.connection.createSharedFetchHandler('/api');
 official.installConnection(ctx,{transport:{fetch:async(input,init)=>{
  const url=new URL(input,baseUrl),headers=new Headers(init.headers);headers.set('host',url.host);headers.set('origin',new URL(baseUrl).origin);
  const request=new Request(url,{...init,headers});observe({path:url.pathname,...JSON.parse(init.body).payload});
  const admission=host.connection.admit(request);if('rejection'in admission)return new Response('forbidden',{status:admission.rejection});
  const response=await shared.fetch(request);return decorateResponse?decorateResponse(response):response;
 }},location:new URL(baseUrl)});
 return ctx.connection;
}
