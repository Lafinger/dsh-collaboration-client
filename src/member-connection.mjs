import {dirname,join} from 'node:path';
import {mkdirSync,writeFileSync,statSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {AccessError} from './protocol.mjs';
import {defaultConfigPath,resolveMemberConfiguration,discoverMemberConfigurations,validateMemberConfiguration,configurationFingerprint,saveMemberSelection,publicConfiguration} from './configuration.mjs';

/** One active local entry. Choices never copy an authenticated identity or migrate a conversation. */
export class MemberConnection {
  constructor({input={},fallbackPath=defaultConfigPath(),env=process.env,createClient,onChange=()=>{}}){
    this.input=input;this.fallbackPath=fallbackPath;this.env=env;this.createClient=createClient;this.onChange=onChange;
    this.client=null;this.resolved=null;this.changing=false;this.operations=0;this.stopped=false;this.requiresSelection=false;
    const initial=resolveMemberConfiguration(input,{fallbackPath,env});
    try{this.activate(initial);}catch{this.resolved={state:'configuration-required',source:initial.source,configPath:initial.configPath,missing:[],issue:'成员本机状态库无法打开',message:'成员本机状态库无法打开；请在设置选择有效配置，不自动清库或换账号。'};this.onChange(this);}
  }
  prepareClient(config){
    const client=this.createClient(config);
    client.isCurrent=()=>this.client===client&&!this.stopped&&this.currentValid();
    return client;
  }
  activate(resolved){
    const next=resolved.state==='configured'?this.prepareClient(resolved.config):null;
    const previous=this.client;this.client=next;this.resolved=resolved;
    previous?.close();this.onChange(this);
  }
  currentValid(){
    if(!this.client)return false;
    const current=resolveMemberConfiguration(this.input,{fallbackPath:this.fallbackPath,env:this.env});
    return current.state==='configured'&&configurationFingerprint(current.config)===configurationFingerprint(this.resolved.config);
  }
  get status(){
    const result=publicConfiguration(this.resolved);
    return this.client&&!this.currentValid()?{...result,state:'configuration-required',issue:'活动成员配置已丢失或改变',message:'活动成员配置已丢失或改变；请退出当前设备并重新选择，不自动换账号。'}:result;
  }
  assertSwitchable(){
    if(this.stopped||this.changing||this.operations||this.client?.busy.size||this.client?.opening.size||this.client?.connecting)throw new AccessError(-32007,'当前操作或业务执行中，不能切换连接');
    if(this.client?.authStatus().authenticated||this.client?.login||this.client?.pendingLogin)throw new AccessError(-32003,'请先明确退出当前设备，再切换连接');
  }
  candidates(){return {configuration:this.status,candidates:discoverMemberConfigurations({fallbackPath:this.fallbackPath}).map(row=>({id:row.id,...publicConfiguration(row)}))};}
  select(id){
    this.assertSwitchable();this.changing=true;
    try{
      const selected=discoverMemberConfigurations({fallbackPath:this.fallbackPath}).find(row=>row.id===id);
      if(!selected||selected.state!=='configured')throw new AccessError(-32602,'所选成员配置无效，请重新扫描');
      // Open state before persisting so invalid/foreign SQLite does not replace a usable selection.
      const next=this.prepareClient(selected.config);
      try{saveMemberSelection(dirname(this.fallbackPath),{mode:'selected',id:selected.id,fingerprint:configurationFingerprint(selected.config)});}catch(error){next.close();throw error;}
      const previous=this.client;this.client=next;this.resolved={...selected,source:'saved-selection'};this.requiresSelection=false;previous?.close();this.onChange(this);
      return this.status;
    }finally{this.changing=false;}
  }
  reset(){
    this.assertSwitchable();this.changing=true;
    try{
      const automatic=resolveMemberConfiguration({}, {fallbackPath:this.fallbackPath,env:{},useSaved:false});
      const next=automatic.state==='configured'?this.prepareClient(automatic.config):null;
      try{saveMemberSelection(dirname(this.fallbackPath),{mode:'auto'});}catch(error){next?.close();throw error;}
      const previous=this.client;this.client=next;this.resolved=automatic;this.requiresSelection=false;previous?.close();this.onChange(this);return this.status;
    }finally{this.changing=false;}
  }
  importConfig(json){
    this.assertSwitchable();if(typeof json!=='string'||Buffer.byteLength(json)>65536)throw new AccessError(-32602,'仅支持64KiB以内成员配置JSON，不导入私钥或凭据');
    let value;try{value=JSON.parse(json.replace(/^\uFEFF/,''));}catch{throw new AccessError(-32602,'成员配置JSON无效');}
    const validated=validateMemberConfiguration(value);if(validated.state!=='configured')throw new AccessError(-32602,validated.issue);
    try{for(const field of ['identityFile','knownHostsFile'])if(!statSync(validated.config.ssh[field]).isFile())throw new Error();}catch{throw new AccessError(-32602,'配置引用的密钥／known_hosts文件不存在或不可访问');}
    const directory=join(dirname(this.fallbackPath),'import-'+randomUUID());mkdirSync(directory,{mode:0o700,recursive:true});
    const {provider,model,...connection}=validated.config;writeFileSync(join(directory,'collaboration-client.json'),JSON.stringify({...connection,provider,model},null,2),{flag:'wx',mode:0o600});
    return this.select(directory.split(/[\\/]/).at(-1)+'/collaboration-client.json');
  }
  async refresh(){
    if(this.stopped||this.changing)throw new AccessError(-32007,'连接正在切换');
    if(this.requiresSelection)return this.status;
    const latest=resolveMemberConfiguration(this.input,{fallbackPath:this.fallbackPath,env:this.env});
    const unchanged=latest.state==='configured'&&this.resolved.state==='configured'&&configurationFingerprint(latest.config)===configurationFingerprint(this.resolved.config);
    if(unchanged)return this.status;
    // If files disappeared/changed, suspend rather than authenticate another endpoint.
    if(this.client){this.assertSwitchable();this.requiresSelection=true;this.activate({state:'configuration-required',configPath:this.resolved.configPath,source:this.resolved.source,missing:[],issue:'活动成员配置已改变，请在设置中重新确认',message:'活动成员配置已改变；请退出并重新选择，不自动换账号。'});}
    else this.activate(latest);
    return this.status;
  }
  async run(method,...args){
    if(this.stopped||this.changing)throw new AccessError(-32007,'成员连接正在切换');
    if(!this.client)throw new AccessError(-32003,'请在设置 → 协作服务选择成员连接配置');
    if(method!=='logout'&&!this.currentValid()){
      if(method==='verifyAuthStatus')return {...this.client.authStatus(),authenticated:false,configurationInvalid:true};
      throw new AccessError(-32003,'活动成员配置已丢失或改变；请先退出当前设备并重新选择');
    }
    if(['beginLogin','completeLogin','logout'].includes(method)&&(this.operations||this.client.busy.size||this.client.opening.size))throw new AccessError(-32007,'正在操作或执行业务，请稍后再操作设备登录');
    this.operations++;const client=this.client;
    try{return await client[method](...args);}finally{this.operations--;}
  }
  close(){this.stopped=true;this.client?.close();}
}
