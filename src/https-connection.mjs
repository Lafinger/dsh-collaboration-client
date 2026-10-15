import {homedir} from 'node:os';
import {join} from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {mkdirSync,existsSync,readFileSync,writeFileSync,lstatSync,renameSync} from 'node:fs';
import {trustedOrigin,readServiceInfo} from './https-peer.mjs';
import {AccessError} from './protocol.mjs';

/** New single-address configuration, intentionally does not import or auto-use old personal SSH JSON. */
export class HttpsConnection {
 constructor({input={},base=join(homedir(),'.dsh','dsh-collaboration-client','https-mvp'),createClient,onChange=()=>{}}){
  this.base=base;this.file=join(base,'service.json');this.createClient=createClient;this.onChange=onChange;this.readInfo=readServiceInfo;this.client=null;this.operations=0;this.changing=false;this.stopped=false;
  this.resolved={state:'configuration-required',source:'https-mvp',configPath:this.file,message:'输入一个可信HTTPS服务地址，然后用电脑钉钉登录；不使用个人SSH配置。'};
  try{
   let value;if(input.serviceUrl){this.resolved.origin=trustedOrigin(input.serviceUrl);return;}
   else if(existsSync(this.file)){
    const s=lstatSync(this.file);if(!s.isFile()||s.isSymbolicLink()||s.size>4096)throw new Error();value=JSON.parse(readFileSync(this.file,'utf8'));
    if(!value||value.version!==1||Object.keys(value).some(k=>!['version','origin','serviceId'].includes(k)))throw new Error();
   }
   if(value)this.activate(value);
  }catch{this.resolved={...this.resolved,message:'MVP服务配置不可用；请明确重新保存HTTPS地址，不采用旧SSH配置。'};}
 }
 activate(value){
  const origin=trustedOrigin(value.origin),serviceId=value.serviceId;if(typeof serviceId!=='string'||!serviceId.trim()||serviceId.length>200)throw new AccessError(-32602,'服务标识无效');
  const key=createHash('sha256').update(origin+'\0'+serviceId).digest('hex'),directory=join(this.base,key);
  mkdirSync(directory,{recursive:true,mode:0o700});
  const config={mode:'mvp-https',origin,loginOrigin:origin,serviceId,databasePath:join(directory,'mapping.sqlite'),vaultPath:join(directory,'login.dpapi'),provider:'collaboration-remote',model:'server-agent'};
  const next=this.createClient(config);next.isCurrent=()=>this.client===next&&!this.stopped&&!this.changing;const old=this.client;this.client=next;this.resolved={state:'configured',source:'https-mvp',configPath:this.file,config,message:'HTTPS服务已配置；身份由电脑钉钉登录确定，无需个人账号或密钥。'};old?.close();this.onChange(this);
 }
 get status(){const {config,...status}=this.resolved;return {...status,...config?{origin:config.origin,host:new URL(config.origin).hostname,serviceId:config.serviceId,provider:config.provider,model:config.model,mode:'mvp-https'}:{}};}
 currentValid(){return !!this.client&&!this.stopped;}
 assertIdle(){if(this.stopped||this.changing||this.operations||this.client?.busy.size||this.client?.opening.size)throw new AccessError(-32007,'有操作正在执行，请稍后再切换连接');}
 async configure(origin){
  this.assertIdle();this.changing=true;try{
   await this.client?.restoreLogin();if(this.client?.login||this.client?.pendingLogin)throw new AccessError(-32003,'请先退出当前设备再改变服务地址');
   origin=trustedOrigin(origin);const info=await this.readInfo(origin);
   mkdirSync(this.base,{recursive:true,mode:0o700});const temporary=this.file+'.'+randomUUID()+'.tmp';
   writeFileSync(temporary,JSON.stringify({version:1,origin,serviceId:info.serviceId}),{flag:'wx',mode:0o600});renameSync(temporary,this.file);this.activate({origin,serviceId:info.serviceId});return this.status;
  }finally{this.changing=false;}
 }
 candidates(){return {configuration:this.status,candidates:[]};}
 async refresh(){return this.status;}
 async run(method,...args){
  if(!this.client)throw new AccessError(-32003,'请先输入协作HTTPS服务地址');
  if(this.stopped||this.changing)throw new AccessError(-32007,'连接正在改变');
  if(['beginLogin','completeLogin','logout','management'].includes(method)&&(this.operations||this.client.busy.size||this.client.opening.size))throw new AccessError(-32007,'业务或管理操作中，请等候完成');
  this.operations++;try{return await this.client[method](...args);}finally{this.operations--;}
 }
 close(){this.stopped=true;this.client?.close();}
}
