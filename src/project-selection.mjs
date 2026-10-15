import {randomUUID} from 'node:crypto';
import {AccessError,requireText} from './protocol.mjs';
import {createUserMessage} from '@deepseek-ai/dsh-llm';
import {createScope} from '@deepseek-ai/dsh-scope';

/** Current-session project admission; no global default, remote session or model execution. */
export function createProjectSelection(ctx,{entry,client:fixedClient,status:fixedStatus,sessions}){
  const scopes=new WeakMap(),pending=new Set();
  const current=()=>entry?.client??fixedClient;
  const configuration=()=>entry?.status??fixedStatus;
  const scope=client=>{let value=scopes.get(client);if(!value||value.login!==client.login){value={id:randomUUID(),login:client.login,labels:new Map(),listingKnown:false,queryEpoch:0};scopes.set(client,value);}return value.id;};
  const assertCurrent=client=>{if(current()!==client||entry&&(entry.stopped||entry.changing||!entry.currentValid()))throw new AccessError(-32003,'活动成员配置已改变，请重新打开模型菜单。');};
  const sessionFor=localId=>{requireText(localId,'local sessionId',200);const session=sessions?.get(localId);if(!session)throw new AccessError(-32004,'当前本地会话不可用，请重新打开会话。');if(session.header?.origin==='subagent')throw new AccessError(-32004,'此会话不支持项目选择。');return session;};
  const reserved=async(client,operation)=>{assertCurrent(client);if(entry)entry.operations++;try{return await operation();}finally{if(entry)entry.operations--;}};
  const selection=async(client,localId,operation)=>{
    if(pending.has(localId))throw new AccessError(-32007,'当前会话正在选择项目，请等待完成。');
    pending.add(localId);try{return await reserved(client,operation);}finally{pending.delete(localId);}
  };
  const state=(client,localId,session=sessionFor(localId))=>{
    assertCurrent(client);if(!pending.has(localId))client.reconcileProjectSelection?.(localId,session);
    const cfg=configuration(),agent=ctx.get?.('agents')?.get(localId),scopeId=scope(client),projectId=client.selectedProject(localId);
    return{localId,scopeId,configuration:cfg,authenticated:client.authStatus().authenticated,projectId,project:scopes.get(client).labels.get(projectId)??null,projectAvailable:projectId&&scopes.get(client).listingKnown?scopes.get(client).labels.has(projectId):null,mapped:!!client.mapping(localId),busy:pending.has(localId)||client.busy.has(localId)||client.opening?.has(localId)||agent?.status==='running',uncertain:!!client.pendingProjectSelection?.(localId),provider:cfg.provider,model:cfg.model};
  };
  const authorized=async(client)=>{
    const login=client.login;scope(client);const record=scopes.get(client),epoch=++record.queryEpoch;
    if(!client.authStatus().authenticated)throw new AccessError(-32003,'请先前往 设置 → 协作服务 完成钉钉登录。');
    const projects=await client.projects();assertCurrent(client);
    if(login!==client.login||!client.authStatus().authenticated)throw new AccessError(-32003,'设备登录已失效，请重新登录后打开模型菜单。');
    if(!Array.isArray(projects))throw new AccessError(-32011,'服务器项目列表格式不兼容。');
    const ids=new Set();for(const project of projects){requireText(project?.id,'projectId',200);requireText(project?.name,'project name',1000);if(project.key!==undefined)requireText(project.key,'project key',200);if(ids.has(project.id))throw new AccessError(-32011,'服务器返回重复项目标识。');ids.add(project.id);}
    const values=projects.map(project=>({id:project.id,name:project.name,...project.key===undefined?{}:{key:project.key}}));
    if(scopes.get(client)===record&&record.queryEpoch===epoch){record.labels=new Map(values.map(project=>[project.id,project]));record.listingKnown=true;}return values;
  };
  return{
    async state(localId){
      requireText(localId,'local sessionId',200);const client=current();return reserved(client,async()=>{
        await client.restoreLogin?.();assertCurrent(client);
        let session=sessions?.get(localId);const attached=!!session;
        if(!session){const controller=ctx.get?.('sessionController');if(!controller?.inspect)throw new AccessError(-32004,'当前会话不可用，请重新打开会话。');const inspected=await controller.inspect(localId);session={header:inspected.meta,snapshotEvents:()=>inspected.events};}
        if(session.header?.origin==='subagent')throw new AccessError(-32004,'此会话不支持项目选择。');
        if(attached&&client.pendingProjectSelection?.(localId)&&!pending.has(localId)){try{if(typeof sessions.flush!=='function'||await sessions.flush(session)===false)throw new Error('No durability listener');}catch(error){throw new AccessError(-32012,'项目选择日志尚未保存，结果未确认，请稍后重新打开菜单。');}}
        return state(client,localId,session);
      });
    },
    async menu(localId){const client=current();return reserved(client,async()=>{const value=await this.state(localId);if(!value.authenticated)return{...value,projects:[]};const projects=await authorized(client);return{...await this.state(localId),projects};});},
    async legacySelect({localId,projectId}){
      const client=current(),session=sessionFor(localId);requireText(projectId,'projectId',200);
      return selection(client,localId,async()=>{
        const assertIdle=()=>{const agent=ctx.get?.('agents')?.get(localId);if(sessions.get(localId)!==session||agent?.status==='running'||client.busy?.has(localId)||client.opening?.has(localId)||client.pendingProjectSelection?.(localId))throw new AccessError(-32007,'当前会话正在执行或选择结果未确认，请稍后再选择。');};
        assertIdle();const projects=await authorized(client);assertIdle();
        if(!projects.some(project=>project.id===projectId))throw new AccessError(-32004,'该项目已不可访问，请重新展开菜单。');
        return client.selectProject(localId,projectId);
      });
    },
    async activate({localId,projectId,scopeId}){
      const client=current();requireText(localId,'local sessionId',200);requireText(projectId,'projectId',200);assertCurrent(client);
      if(scopeId!==scope(client))throw new AccessError(-32003,'项目列表属于过期成员连接，请重新展开菜单。');
      if(typeof sessions?.flush!=='function')throw new AccessError(-32011,'此Host缺少会话保存能力，请检查DSH版本。');
      return selection(client,localId,async()=>{
        const controller=ctx.get?.('sessionController');if(!controller)throw new AccessError(-32011,'此Host缺少会话选择能力，请检查DSH版本。');
        const found=await controller.resolveAgent(localId);if(found.error)throw new AccessError(-32004,'当前会话无法选择项目，请检查会话占用。');
        const agent=found.agent,session=sessionFor(localId);if(!agent||agent.session!==session||agent.status!=='idle')throw new AccessError(-32007,'当前会话正在执行或已改变，请稍后重新选择。');
        return agent.runMaintenance(async signal=>{
          const initial=selectionEvent(session);
          const projects=await authorized(client);
          if(!projects.some(project=>project.id===projectId))throw new AccessError(-32004,'该项目已不可访问，请重新展开菜单。');
          const cfg=configuration(),selected=await ctx.get('llm').resolveCallConfig({provider:cfg.provider,model:cfg.model});
          assertCurrent(client);
          if(!client.authStatus().authenticated||scopeId!==scope(client))throw new AccessError(-32003,'设备登录已失效或改变，请重新登录并展开菜单。');
          if(signal.aborted||sessions.get(localId)!==session||agent.status!=='idle'||selectionEvent(session)!==initial)throw new AccessError(-32007,'选择期间会话状态已改变，请重新展开菜单。');
          const route={provider:selected.provider,model:selected.model};
          if(route.provider!==cfg.provider||route.model!==cfg.model)throw new AccessError(-32011,'协作路由解析不兼容。');
          const routing=ctx.get?.('collaborationProjectRouting');if(typeof routing?.ensure!=='function')throw new AccessError(-32011,'此Host缺少协作路由投影能力，请检查DSH版本。');routing.ensure(agent);
          await client.commitProjectSelection(localId,projectId,session,route,sessions.flush?.bind(sessions));
          try{return{...state(client,localId),busy:false,selection:route};}catch(error){throw new AccessError(-32012,'项目选择已提交，但当前状态无法确认，请重新打开菜单核对。');}
        });
      });
    },
  };
}
function selectionEvent(session){return session.snapshotEvents().findLast(event=>event.type==='model/selection');}

/** Apply logged collaboration intent after the official selector without accessing its private cache. */
export function installProjectRouting(ctx,{entry,adapter}){
  const bindings=new Map();
  const ensure=agent=>{
    const existing=bindings.get(agent);if(existing)for(const dispose of existing.listeners)dispose();
    const binding=existing??{scope:createScope(ctx,agent),listeners:[]};bindings.set(agent,binding);
    binding.listeners=installAgentProjectRouting(binding.scope.ctx,agent,{entry,adapter});
  };
  ctx.provide('collaborationProjectRouting',{ensure});
  ctx.on('agent/created',({agent})=>{ensure(agent);});
  ctx.on('agent/disposed',({agent})=>{const binding=bindings.get(agent);if(binding){bindings.delete(agent);void binding.scope.dispose();}});
  ctx.effect(()=>async()=>{await Promise.all([...bindings.values()].map(binding=>binding.scope.dispose()));bindings.clear();});
  for(const agent of ctx.get('agents')?.list?.()??[])ensure(agent);
}
function installAgentProjectRouting(ctx,agent,{entry,adapter}){
  let assembled=null;const listeners=[];
  const intent=agent=>{
    const state=ctx.get('sessionProjections')?.stateOf(agent.session,'modelSelection');
    const route=state?.pending??state?.lastUsed;
    return route?.provider===adapter.provider&&route.model===adapter.model?{provider:route.provider,model:route.model}:null;
  };
  listeners.push(ctx.on('system-prompt/assemble',async(_assembly,context,next)=>{
    if(context.agent!==agent)return next();
    const route=intent(agent);const result=await next();assembled=route;
    return route?{...result,variables:{...result.variables,...route}}:result;
  },{prepend:true}));
  listeners.push(ctx.on('agent/request',async(payload,next)=>{
    const result=await next(),route=payload.agent===agent?assembled:null;if(!route)return result;
    const {reasoningEffort:_effort,...rest}=result;return{...rest,...route};
  },{prepend:true}));
  listeners.push(ctx.on('agent/pre-step',async(payload,next)=>{
    if(payload.agent!==agent)return next();
    const client=entry.client,localId=String(agent.id);
    if(client?.pendingProjectSelection(localId))throw new AccessError(-32012,'项目选择结果未确认，请重新打开模型菜单核对；本次未发送业务。');
    const decision=await next(),route=payload.agent===agent?assembled:null;
    if(!route||decision.kind==='reject'||payload.signal.aborted||decision.messages.length===0&&(payload.step===1||payload.messages.length>0))return decision;
    const previous=payload.agent.session.requestHeader()?.config;
    const messages=decision.messages.filter(message=>message.source?.kind!=='model-selection');
    if(previous&&(previous.provider!==route.provider||previous.model!==route.model)){
      const label=value=>value.provider===route.provider?value.model:`${value.provider}/${value.model}`;
      messages.push(createUserMessage({content:[{type:'text',text:`[model changed: assistant turns above this point were generated by ${label(previous)}; the session continues with ${label(route)}]`}],source:{kind:'model-selection',form:'notice',summary:`${label(previous)} → ${label(route)}`}}));
    }
    return{...decision,messages};
  },{prepend:true}));
  return listeners;
}
