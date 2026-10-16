import {createProjectSelection} from './project-selection.mjs';
const ENDPOINT='collaboration/member';
const localAuthority=value=>{
  try{const u=new URL(`http://${value}`);return !u.username&&!u.password&&u.pathname==='/'&&!u.search&&!u.hash&&(u.hostname==='localhost'||u.hostname==='[::1]'||/^127\.\d+\.\d+\.\d+$/.test(u.hostname));}catch{return false;}
};
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).length===keys.length&&Object.keys(value).every(k=>keys.includes(k));
const reply=(rpcId,result)=>Response.json({type:'server-response',rpcId,result},{headers:{'cache-control':'no-store'}});

/** Loopback GUI entry. Connection selection is local; business authority remains remote. */
export function installMemberRpc(ctx,{entry,client:fixedClient,status:fixedStatus,sessions}){
  if(typeof ctx.connection?.fetch?.register!=='function')throw new TypeError('Host Connection Fetch registry required');
  const projects=createProjectSelection(ctx,{entry,client:fixedClient,status:fixedStatus,sessions});
  return ctx.connection.fetch.register({path:`/api/${ENDPOINT}`,methods:['POST'],requestBody:'buffered',async fetch(request){
    if(!localAuthority(request.headers.get('host')))return new Response('forbidden',{status:403});
    const origin=request.headers.get('origin');
    if(origin){try{const u=new URL(origin);if(!['http:','https:'].includes(u.protocol)||!localAuthority(u.host)||u.username||u.password||u.pathname!=='/'||u.search||u.hash||u.host!==request.headers.get('host'))throw new Error();}catch{return new Response('forbidden',{status:403});}}
    if(request.headers.get('content-type')?.split(';')[0].trim().toLowerCase()!=='application/json')return new Response('unsupported content type',{status:415});
    let message;try{const text=await request.text();if(text.length>100000)throw new Error();message=JSON.parse(text);}catch{return new Response('bad request',{status:400});}
    const rpcId=typeof message?.rpcId==='string'?message.rpcId:'invalid';
    try{
      if(message.type!=='client-request'||message.method!==ENDPOINT||typeof message.rpcId!=='string'||message.rpcId.length>200||!exact(message.payload,['method','payload']))throw new Error();
      const {method,payload}=message.payload;
      const client=entry?.client??fixedClient,configuration=entry?.status??fixedStatus;
      const run=(name,...args)=>entry?entry.run(name,...args):client[name](...args);
      if(method==='configuration.address'&&exact(payload,['origin'])&&entry?.configure)return reply(rpcId,{ok:true,value:await entry.configure(payload.origin)});
      if(method==='configuration.list'&&exact(payload,[])&&entry)return reply(rpcId,{ok:true,value:entry.candidates()});
      if(method==='configuration.select'&&exact(payload,['id'])&&entry)return reply(rpcId,{ok:true,value:entry.select(payload.id)});
      if(method==='configuration.auto'&&exact(payload,[])&&entry)return reply(rpcId,{ok:true,value:entry.reset()});
      if(method==='configuration.import'&&exact(payload,['json'])&&entry)return reply(rpcId,{ok:true,value:entry.importConfig(payload.json)});
      if(method==='configuration.refresh'&&exact(payload,[])&&entry)return reply(rpcId,{ok:true,value:await entry.refresh()});
      if(method==='status'&&exact(payload,[]))return reply(rpcId,{ok:true,value:{configuration,...(client?await run('verifyAuthStatus'):{authenticated:false}),busy:!!(entry?.operations||client?.busy?.size),switchRequiresLogout:!!(client?.login||client?.pendingLogin)}});
      if(!client)return reply(rpcId,{ok:false,error:{code:'configuration-required',message:entry?.configure?'请先在设置 → 协作服务输入HTTPS服务地址并保存连接。':'请在设置 → 协作服务选择或导入成员连接配置。',details:{}}});
      let data;
      if(method==='login.start'&&exact(payload,[]))data=await run('beginLogin');
      else if(method==='login.claim'&&exact(payload,[]))data=await run('completeLogin');
      else if(method==='login.logout'&&exact(payload,[]))data=await run('logout');
      else if(method==='administration'&&payload&&typeof payload==='object'&&client.management)data=await run('management',payload);
      else if(method==='project.list'&&exact(payload,[]))data={projects:await run('projects')};
      else if(method==='project.menu'&&exact(payload,['localId']))data=await projects.menu(payload.localId);
      else if(method==='project.activate'&&exact(payload,['localId','projectId','scopeId']))data=await projects.activate(payload);
      else if(method==='project.state'&&exact(payload,['localId']))data=await projects.state(payload.localId);
      else if(method==='project.select'&&exact(payload,['localId','projectId']))data=await projects.legacySelect(payload);
      // Keep explicit legacy read APIs for old clients; no history or communication in settings.
      else if(method==='session.list'&&exact(payload,[]))data={sessions:(sessions?.list()??[]).map(s=>({id:String(s.id),title:s.header?.title??String(s.id),projectId:client.selectedProject(String(s.id)),mapped:!!client.mapping(String(s.id))}))};
      else if(method==='communication.list'&&exact(payload,['projectId']))data=await run('communications',payload.projectId);
      else if(method==='history.read'&&exact(payload,['localId']))data=await run('legacyHistory',payload.localId);
      else throw new Error();
      return reply(rpcId,{ok:true,value:data});
    }catch(error){return reply(rpcId,{ok:false,error:{code:'collaboration-request-rejected',message:typeof error?.code==='number'?error.message:'协作请求无效或当前不可执行，请检查配置、登录与项目资格。',details:error?.code===-32012?{outcome:'unknown'}:{}}});}
  }});
}
