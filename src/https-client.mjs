import {MemberClient} from './member-client.mjs';
import {AccessError} from './protocol.mjs';
import {randomBytes} from 'node:crypto';

/** Retains existing durable project/session/no-replay machinery; learns account only from official PC login. */
export class HttpsMemberClient extends MemberClient {
 constructor({vault,...options}){super({...options,account:'pending-official-login',requireLogin:true,loginOrigin:options.origin});this.origin=options.origin;this.vault=vault;this.loaded=false;this.lastLoginError=null;this.statusTask=null;this.claimTask=null;}
 validateInitialize(value){if(value.serviceId!==this.serviceId||value.agentCapabilities?.mvpHttps!==true)throw new AccessError(-32011,'服务身份或MVP版本不匹配，不回退SSH');}
 async restoreLogin(){
  if(this.loaded)return;
  const saved=this.vault.load();if(!saved){this.loaded=true;return;}
  if(saved.origin!==this.origin||saved.serviceId!==this.serviceId||typeof saved.account!=='string'||!saved.account.trim()||typeof saved.deviceId!=='string'||!saved.deviceId.trim()||typeof saved.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(saved.token)||!Number.isSafeInteger(saved.expiresAt)||saved.expiresAt>Date.now()+604800000)throw new AccessError(-32003,'加密登录归属或期限与当前服务不一致');
  if(saved.expiresAt<=Date.now()){this.vault.clear();this.loaded=true;return;}
  this.account=saved.account;this.deviceId=saved.deviceId;this.login=saved;this.loaded=true;
 }
 async ensureConnected(){
  await this.restoreLogin();if(this.login?.expiresAt<=Date.now()){this.login=null;this.vault.clear();}
  if(!this.login)throw new AccessError(-32003,'请在设置 → 协作服务用电脑钉钉登录');
  try{return await super.ensureConnected();}catch(error){if(error.code===-32003&&this.login===null)this.vault.clear();throw error;}
 }
 async beginLogin(){
  await this.restoreLogin();if(this.login||this.pendingLogin)throw new AccessError(-32003,'请先退出当前设备，再发起新登录');
  const peer=await this.ensureTransport(),proof=randomBytes(32).toString('base64url');
  const started=await peer.request('collaboration/login/start',{deviceId:this.deviceId,proof});
  const url=new URL(started.loginUrl);
  if(url.origin!==this.origin||url.pathname!=='/collaboration/pc-login'||url.search||!/^#[A-Za-z0-9_-]{43}$/.test(url.hash)||!/^dingtalk:\/\/dingtalkclient\/action\/openapp\?/.test(started.openUrl)||!/^[A-F0-9]{16}$/.test(started.pairingCode))throw new AccessError(-32003,'服务器返回非预期电脑钉钉登录入口');
  const jump=new URL(started.openUrl);if(jump.searchParams.get('redirect_url')!==started.loginUrl)throw new AccessError(-32003,'电脑钉钉跳转目标不匹配');
  this.pendingLogin={...started,proof};this.lastLoginError=null;return {...started};
 }
 completeLogin(){return this.claimTask??=(async()=>{try{return await this.claimLogin();}finally{this.claimTask=null;}})();}
 async claimLogin(){
  if(!this.pendingLogin)return this.authStatus();
  const p=this.pendingLogin;if(p.expiresAt<=Date.now()){this.pendingLogin=null;throw new AccessError(-32003,'电脑钉钉登录已过期，请明确发起新登录');}
  const peer=await this.ensureTransport(),result=await peer.request('collaboration/login/claim',{requestId:p.requestId,deviceId:this.deviceId,proof:p.proof});
  if(result.status==='pending')return {...this.authStatus(),pending:true};
  if(result.status!=='authenticated'||result.serviceId!==this.serviceId||result.deviceId!==this.deviceId||typeof result.account!=='string'||!result.account.trim()||typeof result.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(result.token)||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now()||result.expiresAt>Date.now()+604800000)throw new AccessError(-32003,'电脑钉钉登录结果与原设备不匹配');
  // Save only encrypted data before admitting business. Failure revokes this just-issued login.
  try{this.vault.save({...result,origin:this.origin});}catch(error){try{await peer.request('collaboration/login/logout',{token:result.token,deviceId:this.deviceId});}catch{}this.pendingLogin=null;peer.close();throw error;}
  this.account=result.account;this.login=result;this.pendingLogin=null;this.loaded=true;await this.ensureConnected();return this.authStatus();
 }
 authStatus(){return {...super.authStatus(),name:this.login?.name??null,administrator:this.login?.administrator===true,loginMethod:'dingtalk-pc',error:this.lastLoginError};}
 verifyAuthStatus(){return this.statusTask??=(async()=>{try{return await this.readAuthStatus();}finally{this.statusTask=null;}})();}
 async readAuthStatus(){
  try{
   await this.restoreLogin();
   if(this.pendingLogin)await this.completeLogin();
   if(!this.login)return this.authStatus();
   await this.ensureConnected();return this.authStatus();
  }catch(error){this.lastLoginError=error.message;if(error.code===-32003){if(this.login===null)this.vault.clear();this.pendingLogin=null;}throw error;}
 }
 async logout(){
  // Local encrypted credentials are cleared regardless of network state; server revoke is attempted once.
  let storageError;try{await this.restoreLogin();}catch{}try{this.vault.clear();}catch(error){storageError=error;}this.loaded=true;
  try{if(this.login){try{await super.logout();}catch{throw new AccessError(-32001,'本机已退出；网络不可用，服务器撤销未确认，旧凭据最长7天失效。不自动重试。');}}else{this.pendingLogin=null;this.disconnect();}if(storageError)throw storageError;return this.authStatus();}finally{this.login=null;this.pendingLogin=null;this.account='pending-official-login';this.disconnect();}
 }
 async management(payload){
  try{return await (await this.ensureConnected()).request('collaboration/admin',payload);}
  catch(error){if([-32001,-32002].includes(error.code))throw new AccessError(-32012,'管理操作结果未确认；请刷新项目／角色核对实际状态，不自动重试', {outcome:'unknown'});throw error;}
 }
}
