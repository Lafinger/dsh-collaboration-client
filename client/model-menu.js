// Model seat replacement: domain projects are never model ids.
const MENU_NS='collaboration-model-menu';
const menuZh={
  'trigger.model':'请选择模型','trigger.project':'请选择项目','trigger.unknown':'项目选择未确认','trigger.selecting':'正在选择项目…','trigger.aria':'选择模型或协作项目，当前 {name}',
  'menu.aria':'模型与协作项目','menu.model':'模型','menu.effort':'推理等级','menu.back':'返回',
  'search.placeholder':'搜索模型或项目…','search.clear':'清除搜索','search.empty':'没有匹配的模型或项目。',
  'loading.models':'正在加载模型…','loading.projects':'正在获取项目…','projects.login':'请先前往 设置 → 协作服务 完成钉钉登录。',
  'projects.empty':'暂无可访问项目。','projects.fixed':'此会话已绑定项目，切换项目请新建会话。','projects.busy':'当前会话正在执行或选择项目，请稍后再选择。','projects.unavailable':'不可访问',
  'projects.unknown':'项目选择结果未确认；重新展开菜单核对前不要发送消息。','projects.error':'项目查询失败：{message}',
  'models.empty':'没有可用的模型。','models.error':'模型目录加载失败：{message}','operation.error':'选择失败：{message}',
  'effort.default':'Default','provider.account':'DeepSeek 账号','provider.collaboration':'Collaboration',
};
const menuEn={
  'trigger.model':'Select model','trigger.project':'Select project','trigger.unknown':'Project selection unconfirmed','trigger.selecting':'Selecting project…','trigger.aria':'Select model or collaboration project, current {name}',
  'menu.aria':'Models and collaboration projects','menu.model':'Model','menu.effort':'Reasoning effort','menu.back':'Back',
  'search.placeholder':'Search models or projects…','search.clear':'Clear search','search.empty':'No matching models or projects.',
  'loading.models':'Loading models…','loading.projects':'Loading projects…','projects.login':'Complete DingTalk login in Settings → Collaboration service first.',
  'projects.empty':'No accessible projects.','projects.fixed':'This conversation is bound to its project. Start a new conversation to change projects.','projects.busy':'This conversation is busy. Wait before making a selection.','projects.unavailable':'Unavailable',
  'projects.unknown':'Project selection is unconfirmed. Reopen the menu before sending a message.','projects.error':'Project query failed: {message}',
  'models.empty':'No models available.','models.error':'Model catalog failed: {message}','operation.error':'Selection failed: {message}',
  'effort.default':'Default','provider.account':'DeepSeek Account','provider.collaboration':'Collaboration',
};
const menuCss=`
.dsh-collaboration-model{position:relative;min-width:0}
.dsh-collaboration-model-trigger{display:flex;align-items:center;gap:4px;min-width:0;max-width:min(360px,45cqw);height:28px;padding:0 4px 0 8px;border:none;border-radius:var(--dsw-radius-sm);outline:none;background:transparent;color:var(--dsw-alias-label-secondary);font-size:13px;line-height:20px;font-weight:400;cursor:pointer}
.dsh-collaboration-model-trigger-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-collaboration-model-trigger-effort{flex-shrink:1000;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dsw-alias-label-caption)}
.dsh-collaboration-model-trigger-icon{display:var(--dsh-composer-model-icon-display,none);flex:none}
.dsh-collaboration-model-trigger-label,.dsh-collaboration-model-trigger-effort{display:var(--dsh-composer-model-text-display,block)}
.dsh-collaboration-model-chevron{color:var(--dsw-alias-label-caption);flex:none;transition:transform .12s}
.dsh-collaboration-model-chevron-open{transform:rotate(180deg)}
.dsh-collaboration-model-trigger:disabled{cursor:default;color:var(--dsw-alias-label-dimmed)}
.dsh-collaboration-model-trigger:hover:not(:disabled),.dsh-collaboration-model-row:hover:not(:disabled),.dsh-collaboration-model-row[data-highlighted]{background:var(--dsw-alias-interactive-bg-hover)}
.dsh-collaboration-model-trigger:focus-visible:not([data-selection-focus]){box-shadow:0 0 0 2px var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary))}
.dsh-collaboration-model-row:focus-visible,.dsh-collaboration-model-search:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary));outline-offset:-2px}
.dsh-collaboration-model-menu{position:fixed;z-index:1100;display:flex;flex-direction:column;width:max-content;min-width:min(240px,calc(100vw - 32px));max-width:min(420px,calc(100vw - 32px));max-height:min(360px,calc(100vh - 96px));padding:4px;color:var(--dsw-alias-label-primary);box-shadow:var(--dsw-elevation-prominent);--dsw-elevation-stroke-color:var(--dsw-alias-border-l1);overflow:hidden;font-size:13px}
.dsh-collaboration-model-groups{min-height:0;overflow:auto}
.dsh-collaboration-model-row{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;border:0;border-radius:var(--dsw-radius-sm);padding:7px 8px;background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}
.dsh-collaboration-model-row:disabled{cursor:default;color:var(--dsw-alias-label-dimmed)}
.dsh-collaboration-model-row>span:first-child{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dsh-collaboration-model-status{margin:0;padding:8px;color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px;overflow-wrap:anywhere}
.dsh-collaboration-model-error{color:var(--dsw-alias-state-error-primary)}
.dsh-collaboration-model-searchbar{display:flex;align-items:center;gap:4px}
.dsh-collaboration-model-clear{width:auto;flex:none}
.dsh-collaboration-model-search{min-width:0;flex:1;width:100%;box-sizing:border-box;background:transparent;color:inherit;border:1px solid var(--dsw-alias-border-l1);border-radius:var(--dsw-radius-sm);padding:6px 8px;font:inherit}
`;
function installMenuStyle(){
  const id='dsh-collaboration-model-menu';let tag=document.querySelector(`style[data-collaboration-style="${id}"]`);
  if(tag)return()=>{};
  tag=document.createElement('style');tag.dataset.collaborationStyle=id;tag.textContent=menuCss;document.head.appendChild(tag);return()=>tag.remove();
}
function projectCaption(project){const key=project.key??project.id;return key===project.name?key:`${key} · ${project.name}`;}
function providerOrder(groups){return [...groups].sort((a,b)=>{const score=id=>id==='deepseek-account'?0:id==='deepseek-official'?1:2;return score(a.id)-score(b.id);});}
function CollaborationModelMenu({locked,available,localId,call,load,select,useModelDirectory,useEntryConfiguration,t}){
  const directory=useModelDirectory(value=>value),configuration=useEntryConfiguration(value=>value);
  const provider=configuration?.provider??'collaboration-remote',model=configuration?.model??'server-agent';
  const identity=JSON.stringify([localId,configuration?.configPath,configuration?.serviceId,configuration?.account,configuration?.provider,configuration?.model,configuration?.identityRevision]);
  const [openIdentity,setOpenIdentity]=React.useState(null),[pane,setPane]=React.useState('root'),[query,setQuery]=React.useState(''),[highlight,setHighlight]=React.useState(0);
  const open=openIdentity===identity,setOpen=value=>setOpenIdentity(value?identity:null);
  const [projectState,setProjectState]=React.useState(null),[listing,setListing]=React.useState({identity:null,status:'idle',projects:[],error:''}),[operationError,setOperationError]=React.useState(''),[busy,setBusy]=React.useState(false);
  const [position,setPosition]=React.useState({visibility:'hidden'}),[selectionFocus,setSelectionFocus]=React.useState(false);
  const trigger=React.useRef(null),menu=React.useRef(null),search=React.useRef(null),life=React.useRef(0),readEpoch=React.useRef(0),operation=React.useRef(null),identityRef=React.useRef(identity);
  identityRef.current=identity;
  const state=projectState?.localId===localId?projectState:null;
  const listingCurrent=listing.identity===identity?listing:null;
  const collaborating=directory.current?.provider===provider&&directory.current?.model===model;
  const displayGroups=providerOrder(directory.groups.some(group=>group.id===provider)?directory.groups:[...directory.groups,{id:provider,name:t('provider.collaboration'),models:[]}]);
  const groups=displayGroups.filter(group=>group.id!==provider);
  const ordinaryChoice=groups.flatMap(group=>group.models.map(item=>({group,item}))).find(choice=>choice.group.id===directory.current?.provider&&choice.item.id===directory.current?.model);
  const reasoning=ordinaryChoice?.item.reasoning,effort=directory.current?.reasoningEffort??reasoning?.defaultEffort;
  const effortLabel=reasoning?(effort===undefined?t('effort.default'):reasoning.efforts.find(row=>row.id===effort)?.name??effort):directory.retainedEffort;
  const selectedProject=listingCurrent?.projects.find(project=>project.id===state?.projectId)??state?.project;
  const projectLabel=selectedProject?projectCaption(selectedProject):state?.projectId??t('trigger.project');
  const label=busy&&operation.current?.kind==='project'?t('trigger.selecting'):state?.uncertain?t('trigger.unknown'):collaborating?(state?.projectAvailable===false?`${projectLabel} · ${t('projects.unavailable')}`:projectLabel):ordinaryChoice?.item.name??(directory.current?`${directory.current.provider}/${directory.current.model}`:t('trigger.model'));
  const selecting=busy||directory.pending!==null,working=locked||selecting,stateBlocked=state?.busy||state?.uncertain,blocked=working||stateBlocked;
  const triggerTitle=!collaborating&&effortLabel?`${label} · ${effortLabel}`:label;
  const projectRows=listingCurrent?.status==='ready'&&!state?.uncertain&&state?.authenticated?listingCurrent.projects:[];
  const normalGroups=groups.map(group=>({...group,models:rankByName(group.models,query.trim())})).filter(group=>group.models.length>0);
  const projects=rankByName(projectRows.map(project=>({...project,displayName:project.name,name:`${project.id} ${projectCaption(project)}`})),query.trim()).map(project=>({...project,name:project.displayName}));
  const choices=displayGroups.flatMap(group=>group.id===provider?projects.map(project=>({kind:'project',id:`project:${project.id}`,project,caption:projectCaption(project),disabled:blocked||state?.mapped&&state.projectId!==project.id})):(normalGroups.find(value=>value.id===group.id)?.models??[]).map(item=>({kind:'model',id:`model:${group.id}:${item.id}`,selection:{provider:group.id,model:item.id,...item.reasoning?.defaultEffort===undefined?{}:{reasoningEffort:item.reasoning.defaultEffort}},caption:item.name,disabled:blocked})));
  const enabled=choices.filter(choice=>!choice.disabled);
  const close=(restoreFocus=true)=>{readEpoch.current++;setOpen(false);setPane('root');setQuery('');setListing(value=>({...value,status:'idle'}));if(restoreFocus)trigger.current?.focus();};
  React.useEffect(()=>{
    if(!available)return;
    const current=++life.current;readEpoch.current++;operation.current=null;setOpen(false);setProjectState(null);setListing({identity:null,status:'idle',projects:[],error:''});setOperationError('');setBusy(false);
    const epoch=readEpoch.current;
    call('project.state',{localId}).then(value=>{if(current===life.current&&epoch===readEpoch.current)setProjectState(value);},error=>{if(current===life.current&&epoch===readEpoch.current&&error.outcome==='unknown')setProjectState(value=>({...value,localId,uncertain:true}));});
    return()=>{life.current++;readEpoch.current++;};
  },[available,localId,configuration?.configPath,configuration?.serviceId,configuration?.account,configuration?.provider,configuration?.model,configuration?.identityRevision]);
  React.useEffect(()=>{
    if(!available||!open||pane!=='model')return;
    const epoch=++readEpoch.current,currentLife=life.current,currentIdentity=identity;
    setHighlight(0);
    setListing({identity:currentIdentity,status:'loading',projects:[],error:''});setOperationError('');
    call('project.menu',{localId}).then(value=>{
      if(epoch!==readEpoch.current||currentLife!==life.current||identityRef.current!==currentIdentity)return;
      setProjectState(value);setListing({identity:currentIdentity,status:'ready',projects:value.projects,error:''});
      const index=displayGroups.flatMap(group=>group.id===provider?value.projects.filter(project=>!value.mapped||project.id===value.projectId).map(project=>({kind:'project',project})):group.models.map(item=>({kind:'model',selection:{provider:group.id,model:item.id}}))).findIndex(choice=>choice.kind==='project'?collaborating&&choice.project.id===value.projectId:choice.selection.provider===directory.current?.provider&&choice.selection.model===directory.current?.model);setHighlight(Math.max(0,index));
    },error=>{
      if(epoch!==readEpoch.current||currentLife!==life.current||identityRef.current!==currentIdentity)return;
      setListing({identity:currentIdentity,status:'error',projects:[],error:error.message});
      if(error.outcome==='unknown')setProjectState(value=>({...value,localId,uncertain:true}));
    });
    return()=>{if(epoch===readEpoch.current)readEpoch.current++;};
  },[available,open,pane,identity,call]);
  React.useEffect(()=>{
    if(!open)return;
    const outside=event=>{if(!trigger.current?.parentElement?.contains(event.target)&&!menu.current?.contains(event.target))close(false);};
    document.addEventListener('mousedown',outside);return()=>document.removeEventListener('mousedown',outside);
  },[open]);
  React.useLayoutEffect(()=>{
    if(!open)return;
    const place=()=>{const rect=trigger.current?.getBoundingClientRect();if(!rect)return;const width=menu.current?.offsetWidth??0,height=menu.current?.offsetHeight??0;setPosition({left:Math.max(12,Math.min(rect.right-width,window.innerWidth-width-12)),top:Math.max(12,rect.top-height-8)});};
    place();window.addEventListener('resize',place);window.addEventListener('scroll',place,true);return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open,pane,listing,directory,query]);
  React.useEffect(()=>{if(open)(pane==='model'?search.current:menu.current?.querySelector('button:not(:disabled)'))?.focus();},[open,pane]);
  React.useEffect(()=>{if(open&&pane==='model'&&menu.current)return observeStickyMenuGroups(menu.current.querySelector('.dsh-collaboration-model-groups'));},[open,pane,listing,query,directory.groups]);
  const show=()=>{if(working)return;setSelectionFocus(false);setOperationError('');setQuery('');setHighlight(0);setPane(directory.current?'root':'model');setOpen(true);load();};
  const choose=async choice=>{
    if(blocked||choice.disabled||operation.current)return;
    if(choice.kind==='model'&&directory.current?.provider===choice.selection.provider&&directory.current?.model===choice.selection.model&&(choice.id.startsWith('model:')||directory.current.reasoningEffort===choice.selection.reasoningEffort)){setSelectionFocus(true);close();return;}
    const token={localId,identity,life:life.current,kind:choice.kind};operation.current=token;setBusy(true);setOperationError('');
    try{
      if(choice.kind==='project'){
        const value=await call('project.activate',{localId,projectId:choice.project.id,scopeId:state.scopeId});
        if(token.life===life.current&&token.identity===identityRef.current){setProjectState(value);setSelectionFocus(true);close();}
      }else{
        const result=await select(choice.selection);if(result&&!result.ok)throw new Error(result.error.message);
        if(token.life===life.current&&token.identity===identityRef.current){setSelectionFocus(true);close();}
      }
    }catch(error){
      if(token.life===life.current&&token.identity===identityRef.current){
        setOperationError(error.outcome==='unknown'?t('projects.unknown'):t('operation.error',{message:error.message}));
        if(error.outcome==='unknown'){
          setProjectState(value=>({...value,localId,uncertain:true}));setListing(value=>({...value,status:'error',projects:[],error:t('projects.unknown')}));
          // Only an explicit model-list reopen may reconcile an unknown selection.
        }
      }
    }finally{if(operation.current===token)operation.current=null;if(token.life===life.current)setBusy(false);}
  };
  const blur=event=>{if(!open)return;const target=event.relatedTarget;if(target&& (trigger.current?.parentElement?.contains(target)||menu.current?.contains(target)))return;close(false);};
  const keyboard=event=>{
    if(event.nativeEvent?.isComposing)return;
    if(event.key==='Escape'||event.key==='Tab'&&event.shiftKey){event.preventDefault();if(pane!=='root'&&directory.current){readEpoch.current++;setPane('root');}else close();return;}
    if(pane==='model'&&event.target===search.current&&(event.key==='ArrowDown'||event.key==='ArrowUp')){event.preventDefault();setHighlight(value=>enabled.length?(value+(event.key==='ArrowDown'?1:-1)+enabled.length)%enabled.length:0);return;}
    if(pane==='model'&&event.target===search.current&&(event.key==='Enter'||event.key==='Tab'&&!event.shiftKey)){event.preventDefault();const choice=enabled[Math.min(highlight,enabled.length-1)];if(choice)void choose(choice);return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){
      event.preventDefault();const buttons=[...menu.current.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement),offset=event.key==='ArrowDown'?1:-1;
      buttons[(index+offset+buttons.length)%buttons.length]?.focus();
    }
  };
  const status=(text,error=false)=>h('p',{role:error?'alert':'status',className:`dsh-collaboration-model-status${error?' dsh-collaboration-model-error':''}`},text);
  const row=(choice,checked)=>h('button',{key:choice.id,type:'button',role:'menuitemradio','aria-checked':checked,disabled:choice.disabled,className:'dsh-collaboration-model-row',title:choice.caption,'data-highlighted':enabled[highlight]?.id===choice.id?'':undefined,onClick:()=>{void choose(choice);}},h('span',null,choice.caption),h('span',{'aria-hidden':true},checked?'✓':''));
  const content=pane==='root'?h(React.Fragment,null,h('button',{type:'button',role:'menuitem',className:'dsh-collaboration-model-row',onClick:()=>{setPane('model');setQuery('');}},t('menu.model'),h('span',null,label)),reasoning?h('button',{type:'button',role:'menuitem',className:'dsh-collaboration-model-row',onClick:()=>setPane('effort')},t('menu.effort'),h('span',null,effortLabel)):null):pane==='effort'?h(React.Fragment,null,
    h('button',{type:'button',className:'dsh-collaboration-model-row',onClick:()=>setPane('root')},t('menu.back')),
    ...(reasoning?.defaultEffort===undefined?[{id:undefined,name:t('effort.default')}]:[]).concat(reasoning?.efforts??[]).map(value=>row({kind:'model',id:`effort:${value.id??'default'}`,selection:{provider:directory.current.provider,model:directory.current.model,...value.id===undefined?{}:{reasoningEffort:value.id}},caption:value.name,disabled:blocked},effort===value.id))):h(React.Fragment,null,
    h('div',{className:'dsh-collaboration-model-searchbar'},h('input',{ref:search,type:'search',className:'dsh-collaboration-model-search',placeholder:t('search.placeholder'),'aria-label':t('search.placeholder'),value:query,onChange:event=>{setQuery(event.target.value);setHighlight(0);}}),query?h('button',{type:'button',className:'dsh-collaboration-model-row dsh-collaboration-model-clear','aria-label':t('search.clear'),onClick:()=>{setQuery('');setHighlight(0);search.current?.focus();}},'×'):null),
    directory.status==='loading'?status(t('loading.models')):null,
    directory.error?status(t('models.error',{message:directory.error}),true):null,
    ...directory.failures.filter(failure=>failure.id!==provider).map(failure=>h(React.Fragment,{key:failure.id},status(`${failure.name}: ${failure.message}`,true))),
    h('div',{className:'dsh-collaboration-model-groups scrollable',role:'menu','aria-label':t('menu.model')},
      ...displayGroups.map(group=>group.id!==provider?((normalGroups.find(value=>value.id===group.id)?.models.length??0)>0?h(MenuGroup,{key:group.id,label:group.id==='deepseek-account'?t('provider.account'):group.name},...normalGroups.find(value=>value.id===group.id).models.map(item=>{const choice=choices.find(value=>value.kind==='model'&&value.selection.provider===group.id&&value.selection.model===item.id);return row(choice,directory.current?.provider===group.id&&directory.current?.model===item.id);})):null):h(MenuGroup,{key:'collaboration',label:t('provider.collaboration')},
        !listingCurrent||listingCurrent.status==='loading'?status(t('loading.projects')):null,
        listingCurrent?.status==='error'?status(state?.uncertain?t('projects.unknown'):t('projects.error',{message:listingCurrent.error}),true):null,
        listingCurrent?.status==='ready'&&state?.authenticated===false?status(t('projects.login')):null,
        listingCurrent?.status==='ready'&&state?.uncertain?status(t('projects.unknown'),true):null,
        state?.mapped?status(t('projects.fixed')):null,
        state?.busy?status(t('projects.busy')):null,
        ...projects.map(project=>row(choices.find(value=>value.kind==='project'&&value.project.id===project.id),collaborating&&state?.projectId===project.id&&!state?.uncertain&&!busy)),
        listingCurrent?.status==='ready'&&state?.authenticated&&state.projectId&&!projectRows.some(project=>project.id===state.projectId)?status(`${state.projectId} · ${t('projects.unavailable')}`):null,
        listingCurrent?.status==='ready'&&state?.authenticated&&!projectRows.length?status(t('projects.empty')):null))),
    listingCurrent?.status==='ready'&&!choices.length&&query?status(t('search.empty')):null);
  if(!available)return null;
  return h('div',{className:'dsh-collaboration-model',onBlur:blur},h('button',{ref:trigger,type:'button',className:'dsh-collaboration-model-trigger','aria-label':t('trigger.aria',{name:label}),'aria-haspopup':'menu','aria-expanded':open,'aria-busy':selecting,'data-selection-focus':selectionFocus?'':undefined,title:triggerTitle,disabled:locked,onBlur:()=>setSelectionFocus(false),onKeyDown:event=>{if(['ArrowDown','ArrowUp','Enter'].includes(event.key)){event.preventDefault();if(!open)show();else menu.current?.querySelector('input,button:not(:disabled)')?.focus();}else if(event.key==='Escape'&&open){event.preventDefault();close();}},onClick:()=>open?close():show()},h(IconDataOutlineRegular,{className:'dsh-collaboration-model-trigger-icon',size:16}),h('span',{className:'dsh-collaboration-model-trigger-label'},label),!collaborating&&effortLabel?h('span',{className:'dsh-collaboration-model-trigger-effort'},effortLabel):null,selecting?h(StateDot,{state:'ongoing'}):h(IconChevronDownOutlineRegular,{className:`dsh-collaboration-model-chevron${open?' dsh-collaboration-model-chevron-open':''}`})),
    open?createPortal(h(MenuSurface,{ref:menu,className:'dsh-collaboration-model-menu',style:position,role:pane==='model'?'group':'menu','aria-label':t('menu.aria'),onKeyDown:keyboard,onBlur:blur},content,operationError?status(operationError,true):null),document.body):null);
}
