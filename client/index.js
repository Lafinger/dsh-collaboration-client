// Settings own connection/device identity; the model seat owns current-session project selection.
import * as React from 'react';
import {createPortal} from 'react-dom';
import {MenuSurface,MenuGroup,rankByName,observeStickyMenuGroups,IconChevronDownOutlineRegular,IconDataOutlineRegular,StateDot} from '@deepseek-ai/dsh-client-ui-primitives';
// MODEL_MENU
const h=React.createElement;
export const name='collaboration-member-ui';
export const inject=['connection','slots'];
const card={border:'1px solid var(--dsw-alias-border-l1, #ddd)',borderRadius:16,padding:20,marginBottom:16};
const buttonStyle={padding:'7px 12px',marginRight:8,marginBottom:8,border:'1px solid var(--dsw-alias-border-l1, #ddd)',borderRadius:8,background:'var(--dsw-alias-background-l1, transparent)',color:'inherit',cursor:'pointer'};
const button=(text,onClick,disabled=false)=>h('button',{type:'button',onClick,disabled,style:buttonStyle},text);
const errorView=error=>error?h('p',{role:'alert',style:{color:'var(--dsw-alias-state-error-primary, #b42318)',overflowWrap:'anywhere'}},error):null;

export function LegacyCollaborationPanel({call}){
  const [status,setStatus]=React.useState(null),[candidates,setCandidates]=React.useState([]),[selected,setSelected]=React.useState('');
  const [link,setLink]=React.useState(''),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const mounted=React.useRef(true),operation=React.useRef(false);
  React.useEffect(()=>{mounted.current=true;return()=>{mounted.current=false;};},[]);
  const refresh=async()=>{try{const state=await call('status',{}),list=await call('configuration.list',{});if(!mounted.current)return;setStatus(state);setCandidates(list.candidates);}catch(e){if(mounted.current){setStatus(null);setCandidates([]);setError(e.message||'无法读取本机协作状态，请检查插件组件与DSH连接。');}throw e;}};
  React.useEffect(()=>{refresh().catch(()=>{});},[call]);
  const run=fn=>async(...args)=>{if(operation.current||busy)return;operation.current=true;setBusy(true);setError('');try{await fn(...args);}catch(e){if(mounted.current)setError(e.message||'协作操作失败，请重试。');}finally{operation.current=false;if(mounted.current)setBusy(false);}};
  const cfg=status?.configuration,locked=busy||!status||status.busy||status.switchRequiresLogout;
  const source={discovery:'目录自动发现',explicit:'旧显式配置',environment:'启动环境配置',inline:'旧内联配置','saved-selection':'设置页保存的选择',import:'导入配置'}[cfg?.source]??'尚未选择';
  return h('section',{'aria-label':'协作服务',style:{padding:16,maxWidth:840}},
    h('h2',null,'协作服务'),h('p',null,'管理成员连接与钉钉身份。请打开会话模型菜单，在 Collaboration 分组直接选择项目。'),
    h('div',{style:card},h('h3',null,'连接配置'),
      h('p',{role:'status'},cfg?.message??(error?'本机协作状态读取失败，请先解决下方错误再登录。':'正在读取本机配置…')),
      h('dl',null,h('dt',null,'配置来源'),h('dd',null,source),cfg?.configPath?h('dd',{style:{overflowWrap:'anywhere'}},cfg.configPath):null,
        cfg?.serviceId?h(React.Fragment,null,h('dt',null,'服务 / 成员账号'),h('dd',null,`${cfg.serviceId} / ${cfg.account}`),h('dt',null,'SSH入口'),h('dd',null,`${cfg.host}:${cfg.port}`),h('dt',null,'可信登录域名'),h('dd',null,cfg.loginOrigin)):null),
      h('label',null,'已发现的成员配置 ',h('select',{'aria-label':'成员连接配置',value:selected,disabled:locked,onChange:e=>setSelected(e.target.value)},h('option',{value:''},'请选择'),...candidates.map(row=>h('option',{key:row.id,value:row.id,disabled:row.state!=='configured'},`${row.id} — ${row.state==='configured'?`${row.serviceId} / ${row.account}`:row.issue}`)))),
      h('div',{style:{marginTop:12}},button('使用所选配置',run(async()=>{await call('configuration.select',{id:selected});setLink('');await refresh();}),locked||!selected),
        button('恢复自动选择',run(async()=>{await call('configuration.auto',{});setLink('');setSelected('');await refresh();}),locked),
        button('重新扫描配置',run(async()=>{await call('configuration.refresh',{});await refresh();}),locked)),
      h('label',null,'导入管理员提供的成员配置JSON ',h('input',{type:'file',accept:'.json,application/json',disabled:locked,onChange:run(async event=>{const input=event.currentTarget,file=input.files?.[0];if(!file)return;input.value='';if(file.size>65536)throw new Error('成员配置文件不能超过64KiB。');await call('configuration.import',{json:await file.text()});setSelected('');setLink('');await refresh();})})),
      h('p',null,'仅导入连接参数与本机文件路径，不导入私钥正文、模型Key或服务端凭据；已有配置不会被覆盖。'),
      status?.switchRequiresLogout?h('p',null,'请先退出当前设备，再选择另一份连接配置。'):null),
    h('div',{style:card},h('h3',null,'钉钉身份'),
      h('p',{role:'status'},status?.authenticated?`已登录：${status.account}，有效至 ${new Date(status.expiresAt).toLocaleString()}`:status?'尚未扫码登录；SSH连接本身不授予业务访问。':'尚未读取登录状态；请先确认本机接口可用。'),
      button('发起钉钉扫码登录',run(async()=>{const result=await call('login.start',{});setLink(result.loginUrl);await refresh();}),busy||cfg?.state!=='configured'||status?.authenticated),
      link?h('p',null,h('a',{href:link,target:'_blank',rel:'noopener noreferrer'},'打开可信登录页并扫码确认'),' · ',button('我已扫码，完成登录',run(async()=>{const result=await call('login.claim',{});if(result.pending)throw new Error('尚未完成扫码，请先在登录页确认。');setLink('');await refresh();}),busy)):null,
      button('刷新登录状态',run(refresh),busy),
      button('退出当前设备',run(async()=>{try{await call('login.logout',{});}finally{setLink('');await refresh();}}),busy||status?.busy),
      h('p',null,'仅当前设备登录；重启或到期后重新扫码。连接、登录与项目权限分别核验。')),
    errorView(error));
}

export function CollaborationPanel({call}){
 const [status,setStatus]=React.useState(null),[origin,setOrigin]=React.useState(''),[request,setRequest]=React.useState(null),[error,setError]=React.useState(''),[busy,setBusy]=React.useState(false);
 const [view,setView]=React.useState(null),[projectId,setProjectId]=React.useState(''),[key,setKey]=React.useState(''),[name,setName]=React.useState(''),[role,setRole]=React.useState(''),[account,setAccount]=React.useState('');
 const running=React.useRef(false),mounted=React.useRef(true),incompatible=React.useRef(false);
 const [backendMismatch,setBackendMismatch]=React.useState(false);
 const restartMessage='页面已是新版，但DSH协作后台仍是旧版。请从托盘完整退出DSH后重新打开，再填写HTTPS地址；刷新页面或停用再启用不能重新加载旧模块。不要导入JSON或配置SSH。';
 const refresh=async()=>{try{const next=await call('status',{});const mismatch=!!next.configuration&&next.configuration.mode!=='mvp-https'&&next.configuration.source!=='https-mvp';const previous=incompatible.current;incompatible.current=mismatch;if(mounted.current){setBackendMismatch(mismatch);if(mismatch){setStatus(null);setRequest(null);setView(null);setError(restartMessage);}else{setStatus(next);if(previous)setError('');if(next.configuration?.origin)setOrigin(next.configuration.origin);if(next.authenticated)setRequest(null);}}return mismatch?null:next;}catch(e){if(mounted.current){setStatus(null);setError(e.message);}throw e;}};
 React.useEffect(()=>{mounted.current=true;refresh().catch(e=>setError(e.message));return()=>{mounted.current=false;};},[call]);
 React.useEffect(()=>{if(!request)return;let stopped=false,timer;const tick=async()=>{try{await refresh();}catch(e){if(!stopped){setError(e.message);setRequest(null);}}if(!stopped)timer=setTimeout(tick,1800);};timer=setTimeout(tick,1200);return()=>{stopped=true;clearTimeout(timer);};},[request,call]);
 const run=(fn,{allowMismatch=false}={})=>async()=>{if(running.current)return;if(incompatible.current&&!allowMismatch){setError(restartMessage);return;}running.current=true;setBusy(true);setError('');try{await fn();}catch(e){setError(e.message||'操作未完成；请核对实际状态，不自动重试。');}finally{running.current=false;if(mounted.current)setBusy(false);}};
 const admin=async id=>{const next=await call('administration',{action:'view',...id?{projectId:id}:{}});setView(next);if(id)setProjectId(id);return next;};
 const command=()=>globalThis.crypto.randomUUID();
 return h('section',{'aria-label':'协作服务',style:{padding:16,maxWidth:840}},
  h('h2',null,'协作服务'),h('p',null,'一个服务地址，使用电脑钉钉登录。登录后在会话模型菜单的 Collaboration 分组选择项目。'),
  h('div',{style:card},h('h3',null,'服务连接'),h('label',null,'HTTPS服务地址 ',h('input',{'aria-label':'HTTPS服务地址',type:'url',value:origin,placeholder:'https://协作服务域名',disabled:busy||backendMismatch||status?.switchRequiresLogout,onChange:e=>setOrigin(e.target.value)})),
   button('保存并连接',run(async()=>{await call('configuration.address',{origin});await refresh();}),busy||backendMismatch||status?.switchRequiresLogout),
   h('p',{role:'status'},backendMismatch?restartMessage:status?.configuration?.message??(error?'协作状态读取失败，请核对下方错误；未确认登录。':'正在读取协作状态…'))),
  h('div',{style:card},h('h3',null,'电脑钉钉登录'),h('p',{role:'status'},status?.authenticated?`已登录：${status.name??status.account}${status.administrator?'（项目管理员）':''}，有效至 ${new Date(status.expiresAt).toLocaleString()}`:'尚未登录；请先在电脑钉钉登录本组织账号。'),
   button('电脑钉钉登录',run(async()=>{const next=await call('login.start',{});setRequest(next);}),busy||status?.configuration?.state!=='configured'||status?.authenticated||!!request),
   request?h('div',null,h('p',{role:request.launch?.status==='failed'?'alert':'status'},request.launch?.message??'本次登录请求已准备；请打开电脑钉钉核对，未确认登录。'),
     button('重新打开电脑钉钉',run(async()=>{const launch=await call('login.open',{});setRequest(current=>current?{...current,launch}:null);}),busy||backendMismatch),
    h('p',null,'核对码：',h('strong',null,request.pairingCode),'。若未自动打开，在电脑钉钉工作台进入同一应用核对本次请求；无需手机扫码。'),h('p',null,'确认后此处自动完成登录，请勿使用他人发来的链接或核对码。')):null,
   button('刷新状态',run(refresh,{allowMismatch:true}),busy),button('退出当前设备',run(async()=>{try{await call('login.logout',{});}finally{setRequest(null);setView(null);await refresh();}}),busy||backendMismatch||status?.busy),
   h('p',null,'登录记忆最多7天，退出仅影响当前设备。所有有效成员可见全部项目，私人对话不会共享。')),
  status?.authenticated&&status?.administrator?h('div',{style:card},h('h3',null,'创建项目与角色分配'),
   h('p',null,'仅管理员可建项目和安排角色。角色候选来自已自行登录的成员，无成员管理或项目授权步骤。'),
   h('label',null,'项目标识 ',h('input',{'aria-label':'项目标识',value:key,onChange:e=>setKey(e.target.value),disabled:busy})),
   h('label',null,'项目名称 ',h('input',{'aria-label':'项目名称',value:name,onChange:e=>setName(e.target.value),disabled:busy})),
   button('创建项目',run(async()=>{if(!globalThis.confirm('确认创建这个项目？'))return;const result=await call('administration',{action:'create',commandId:command(),key,name});await admin(result.project.id);setKey('');setName('');}),busy||!key.trim()||!name.trim()),
   button('刷新项目和角色候选',run(()=>admin(projectId)),busy),
   view?h('div',null,h('label',null,'项目 ',h('select',{'aria-label':'管理项目',value:projectId,disabled:busy,onChange:e=>{setProjectId(e.target.value);setRole('');setAccount('');}},h('option',{value:''},'请选择'),...view.projects.map(p=>h('option',{key:p.id,value:p.id},p.key+' · '+p.name)))),
    button('读取所选项目',run(()=>admin(projectId)),busy||!projectId),
    view.project?.id===projectId?h('div',null,h('ul',null,...view.project.roles.map(r=>h('li',{key:r.role},r.label+'：'+(view.members.find(m=>m.account===r.member)?.name??r.member??'空缺')))),
     h('label',null,'职责 ',h('select',{'aria-label':'职责',value:role,disabled:busy,onChange:e=>setRole(e.target.value)},h('option',{value:''},'请选择'),...view.project.roles.map(r=>h('option',{key:r.role,value:r.role},r.label)))),
     h('label',null,'成员 ',h('select',{'aria-label':'角色成员',value:account,disabled:busy,onChange:e=>setAccount(e.target.value)},h('option',{value:''},'空缺'),...view.members.map(m=>h('option',{key:m.account,value:m.account},m.name)))),
     button('确认角色分配',run(async()=>{if(!globalThis.confirm('确认修改角色？换人会暂停相关未生效方案，不能继承前任确认。'))return;await call('administration',{action:'role',commandId:command(),projectId,role,account:account||null,revision:view.revision});await admin(projectId);}),busy||!role)):null):null):null,
  errorView(error));
}

export function apply(ctx){
  let configuration=null,connectionEpoch=0;const listeners=new Set();
  const snapshot={getSnapshot:()=>configuration,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);}};
  const call=async(method,payload)=>{
    const epoch=connectionEpoch;let result;try{result=await ctx.connection.rpc.call('/api','collaboration/member',{method,payload});}catch(error){
      const status=/\bHTTP (\d{3})\b/.exec(error?.message??'')?.[1];
      const failure=new Error(status?`本机协作接口请求失败（HTTP ${status}）；请检查Host组件是否已启用，升级后重启DSH并刷新页面。`:'本机协作接口通信失败；请检查DSH连接，升级后重启DSH并刷新页面。');
      if(method==='project.activate')failure.outcome='unknown';throw failure;
    }
    if(epoch!==connectionEpoch){const failure=new Error('本机连接已改变，请重新打开菜单。');if(method==='project.activate')failure.outcome='unknown';throw failure;}
    if(!result.ok){const failure=new Error(result.error?.message||'协作服务当前不可用');failure.outcome=result.error?.details?.outcome;throw failure;}
    if(!result.value||typeof result.value!=='object'||Array.isArray(result.value)){const failure=new Error('本机协作接口返回格式不兼容；请将Host与页面升级到同一版本，重启DSH并刷新页面。');if(method==='project.activate')failure.outcome='unknown';throw failure;}
    if(method.startsWith('project.')&&['project.state','project.menu','project.activate'].includes(method)){
      const value=result.value,valid=value.localId===payload.localId&&typeof value.scopeId==='string'&&typeof value.authenticated==='boolean'&&typeof value.mapped==='boolean'&&typeof value.busy==='boolean'&&typeof value.uncertain==='boolean'&&(value.projectId===null||typeof value.projectId==='string')&&typeof value.provider==='string'&&typeof value.model==='string';
      const activated=method!=='project.activate'||value.projectId===payload.projectId&&value.scopeId===payload.scopeId&&value.busy===false&&value.uncertain===false&&value.selection?.provider===value.provider&&value.selection?.model===value.model;
      if(!valid||!activated||method==='project.menu'&&(!Array.isArray(value.projects)||value.projects.some(project=>!project||typeof project.id!=='string'||typeof project.name!=='string'))){const failure=new Error('本机项目接口返回格式不兼容，请重启DSH并刷新页面。');if(method==='project.activate')failure.outcome='unknown';throw failure;}
    }
    const config=result.value?.configuration??(method.startsWith('configuration.')&&method!=='configuration.list'?result.value:null);
    const directIdentity=method==='status'||method.startsWith('login.');
    const auth=typeof result.value?.authenticated==='boolean'?{authenticated:result.value.authenticated,...directIdentity?{account:result.value.account??null,...method.startsWith('login.')||configuration?.authenticated!==result.value.authenticated||configuration?.account!==(result.value.account??null)?{identityRevision:(configuration?.identityRevision??0)+1}:{}}:{}}:{};
    if(config||Object.keys(auth).length){const next={...configuration,...config,...auth};if(JSON.stringify(next)!==JSON.stringify(configuration)){configuration=next;for(const fn of listeners){try{fn();}catch{}}}}
    return result.value;
  };
  ctx.on?.('connection/reset',()=>{connectionEpoch++;configuration=null;for(const fn of listeners)fn();});
  ctx.slots.inject('settings.section',()=>ctx.slots.register({name:'settings.section',id:'collaboration-member',order:80,label:'协作服务',inject:()=>({call})},CollaborationPanel));
  // ModelDirectory resolves Remote namespaces in the caller's injection scope.
  ctx.inject(['locale','modelDirectories','sessions','remote','remote.session'],active=>{
    active.effect(()=>active.locale.register(MENU_NS,{zh:menuZh,en:menuEn}));
    active.effect(installMenuStyle);
    active.slots.inject('conversation.input.model',()=>active.slots.register({
      name:'conversation.input.model',priority:-10,locale:MENU_NS,
      inject:sessionId=>{
        const directory=active.modelDirectories.directoryFor(sessionId),available=active.sessions.subagentAddress(sessionId)===undefined;
        return{localId:String(sessionId),available,call,load:()=>{if(available)directory.load().catch(()=>{});},select:selection=>available?directory.select(selection):Promise.resolve(undefined),hooks:{modelDirectory:directory.store,entryConfiguration:snapshot}};
      },
    },CollaborationModelMenu));
  });
}
