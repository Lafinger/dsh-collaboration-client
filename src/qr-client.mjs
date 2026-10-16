import {HttpsMemberClient} from './https-client.mjs';import {AccessError} from './protocol.mjs';import {randomBytes} from 'node:crypto';
import {openQrBrowser,validateBrowserLoginTarget} from './browser-login-launcher.mjs';
const network=error=>[-32001,-32002].includes(error?.code);
/** Same encrypted login file and durable member/project/no-replay mappings; only authentication interaction changes. */
export class QrMemberClient extends HttpsMemberClient {
 constructor({openLogin=openQrBrowser,...options}){super({...options,openLogin});this.beginTask=null;this.cancelTask=null;this.cancelRequested=false;this.pendingError=null;this.cancelUnknown=false;}
 initializeCapabilities(){return {webQrLogin:1};}
 validateInitialize(value){super.validateInitialize(value);if(value.agentCapabilities?.mvpHttpsVersion!==2||value.agentCapabilities?.loginMethod!=='dingtalk-qr')throw new AccessError(-32011,'服务端仍为电脑钉钉或双端版本不匹配，请等待配套切换；不回退旧登录');}
 async restoreLogin(){
  if(this.loaded)return;const value=this.vault.load();
  if(value?.kind!=='qr-pending')return super.restoreLogin();
  if(value.origin!==this.origin||value.serviceId!==this.serviceId||typeof value.deviceId!=='string'||!value.deviceId||value.deviceId.length>200||typeof value.proof!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(value.proof)||!Number.isSafeInteger(value.expiresAt)||value.expiresAt>Date.now()+300000||!['starting','pending'].includes(value.phase))throw new AccessError(-32003,'加密扫码请求归属或期限不一致，请明确取消／退出本机后重试');
  if(value.expiresAt<=Date.now()){this.vault.clear();this.loaded=true;return;}
  if(value.phase==='pending'){validateBrowserLoginTarget({origin:this.origin,loginUrl:value.loginUrl,openUrl:value.openUrl});if(typeof value.requestId!=='string'||value.requestId.length>100)throw new AccessError(-32003,'加密扫码请求格式不兼容');}
  this.deviceId=value.deviceId;this.pendingLogin=value;this.cancelUnknown=value.cancelIntent===true;this.loaded=true;
 }
 async ensureConnected(){try{return await super.ensureConnected();}catch(error){if(error.code===-32003&&!this.login){this.account='pending-official-login';this.attached.clear();this.attachments?.clear();this.disconnect();throw new AccessError(-32003,'请在设置 → 协作服务完成钉钉扫码登录；旧设备资格失效时需重新扫码');}throw error;}}
 beginLogin(){if(this.beginTask)return this.beginTask;this.beginTask=this.startQrLogin().finally(()=>{this.beginTask=null;});return this.beginTask;}
 async startQrLogin(){
  await this.restoreLogin();this.assertCurrent();if(this.login||this.pendingLogin)throw new AccessError(-32003,'请先退出当前设备或取消本次请求，再明确发起扫码登录');
  const proof=randomBytes(32).toString('base64url'),pending={kind:'qr-pending',proof,deviceId:this.deviceId,origin:this.origin,serviceId:this.serviceId,expiresAt:Date.now()+300000,phase:'starting'};
  this.vault.save(pending);this.pendingLogin=pending;this.lastLoginError=null;this.cancelRequested=false;this.cancelUnknown=false;
  let started;try{started=await this.recoverStart(pending,true);}catch(error){if(!network(error)){this.vault.clear();this.pendingLogin=null;}throw error;}
  const launch=await this.openPendingLogin();return {...started,launch};
 }
 async recoverStart(pending,create=false){
  const peer=await this.ensureTransport();let started;try{started=await peer.request(create?'collaboration/login/start':'collaboration/login/resume',{deviceId:this.deviceId,proof:pending.proof});}catch(error){if(network(error))this.pendingError='登录发起结果未知；刷新时只查询恢复原请求，不自动打开新页面。';throw error;}
  validateBrowserLoginTarget({origin:this.origin,loginUrl:started.loginUrl,openUrl:started.openUrl});if(started.loginMethod!=='dingtalk-qr'||typeof started.requestId!=='string'||!Number.isSafeInteger(started.expiresAt)||started.expiresAt<=Date.now()||started.expiresAt>Date.now()+300000)throw new AccessError(-32003,'服务器返回的扫码请求期限或入口不匹配');
  if(this.pendingLogin!==pending||this.stopped)throw new AccessError(-32001,'扫码请求已停止');
  Object.assign(pending,started,{phase:'pending'});this.vault.save(pending);this.pendingError=null;return started;
 }
 async launchPendingLogin(){const p=this.pendingLogin;if(this.stopped||this.login||this.cancelUnknown||this.cancelRequested||!p||p.phase!=='pending'||p.expiresAt<=Date.now())throw new AccessError(-32003,'没有可重新打开的本次扫码请求，请先核对原请求状态');this.assertCurrent();validateBrowserLoginTarget({origin:this.origin,loginUrl:p.loginUrl,openUrl:p.openUrl});try{const result=await this.openLogin({origin:this.origin,loginUrl:p.loginUrl,openUrl:p.openUrl});if(result?.status!=='requested')throw Error();return {status:'requested',message:'已请求打开默认浏览器；请用手机钉钉扫码并完成官方确认，原DSH会自动登录。系统受理不等于页面或登录成功。'};}catch{return {status:'failed',message:'未能自动打开默认浏览器；可点“重新打开扫码页面”重开本次请求。不新建登录或自动重复弹窗。'};}}
 async claimLogin(){
  let p=this.pendingLogin;if(!p)return this.authStatus();if(this.cancelUnknown||this.cancelRequested)return this.authStatus();
  if(p.expiresAt<=Date.now()){this.vault.clear();this.pendingLogin=null;this.lastLoginError='本次扫码已过期，请明确重新发起';return this.authStatus();}
  if(p.phase==='starting'){try{await this.recoverStart(p);p=this.pendingLogin;}catch(error){if(error.code===-32003){this.vault.clear();this.pendingLogin=null;this.lastLoginError='未能恢复原扫码请求，请明确重新发起；未自动创建替代登录';return this.authStatus();}throw error;}}
  const peer=await this.ensureTransport();let result;try{result=await peer.request('collaboration/login/claim',{requestId:p.requestId,deviceId:this.deviceId,proof:p.proof});}catch(error){if(error.code===-32003&&this.pendingLogin===p){this.vault.clear();this.pendingLogin=null;this.lastLoginError='本次扫码已取消、被拒绝或失效，请明确重新发起';return this.authStatus();}throw error;}
  if(this.cancelRequested||this.pendingLogin!==p||this.stopped)return this.authStatus();
  if(result.status==='pending')return this.authStatus();
  if(result.status!=='authenticated'||result.loginMethod!=='dingtalk-qr'||result.serviceId!==this.serviceId||result.deviceId!==this.deviceId||typeof result.account!=='string'||!result.account.trim()||typeof result.token!=='string'||!/^[A-Za-z0-9_-]{43}$/.test(result.token)||!Number.isSafeInteger(result.expiresAt)||result.expiresAt<=Date.now()||result.expiresAt>Date.now()+604800000)throw new AccessError(-32003,'官方扫码结果与原设备不匹配');
  try{this.vault.save({...result,origin:this.origin});}catch(error){try{await peer.request('collaboration/login/logout',{token:result.token,deviceId:this.deviceId});}catch{}this.pendingLogin=null;this.disconnect();throw error;}
  this.account=result.account;this.login=result;this.pendingLogin=null;this.loaded=true;this.lastLoginError=null;this.pendingError=null;
  // Delete short-lived encrypted response recovery after durable local save. Lost ack does not invalidate a saved login.
  try{await peer.request('collaboration/login/ack',{requestId:p.requestId,deviceId:this.deviceId,proof:p.proof});}catch{}
  await this.ensureConnected();return this.authStatus();
 }
 authStatus(){return {...super.authStatus(),loginMethod:'dingtalk-qr',pending:!!this.pendingLogin,pendingExpiresAt:this.pendingLogin?.expiresAt??null,pendingRecovery:this.pendingLogin?.phase==='starting',cancelUnknown:this.cancelUnknown,error:this.lastLoginError??this.pendingError};}
 async readAuthStatus(){
  try{await this.restoreLogin();if(this.cancelUnknown)await this.cancelLogin();else if(this.pendingLogin)await this.completeLogin();if(this.login){await this.ensureConnected();this.lastLoginError=null;}this.pendingError=null;return this.authStatus();}
  catch(error){if(network(error)){this.pendingError='网络结果未确认；保留原请求，刷新时只恢复实际状态，不重新授权或弹窗。';return {...this.authStatus(),authenticated:false,error:this.pendingError};}this.lastLoginError=error.message;if(error.code===-32003&&!this.login&&!this.pendingLogin)return this.authStatus();throw error;}
 }
 cancelLogin(){if(this.cancelTask)return this.cancelTask;this.cancelTask=this.cancelQrLogin().finally(()=>{this.cancelTask=null;});return this.cancelTask;}
 async cancelQrLogin(){
  await this.restoreLogin();const p=this.pendingLogin;if(!p)return this.authStatus();this.cancelRequested=true;p.cancelIntent=true;
  try{
   this.vault.save(p);
   // Wait for an already in-flight claim, then linearize cancellation against the server. Never cancel only a local pointer.
   if(this.claimTask)await this.claimTask;
   if(p.phase==='starting')await this.recoverStart(p);
   const peer=await this.ensureTransport(),result=await peer.request('collaboration/login/cancel',{requestId:p.requestId,deviceId:this.deviceId,proof:p.proof});
   if(result.status==='completed'){this.cancelRequested=false;this.cancelUnknown=false;await this.completeLogin();this.lastLoginError='登录已先完成，未取消已有登录；如不需要请退出当前设备';return this.authStatus();}
   if(result.status!=='cancelled')throw new AccessError(-32003,'扫码取消结果无法核对');
   this.vault.clear();this.pendingLogin=null;this.cancelUnknown=false;this.lastLoginError=null;this.pendingError=null;return {...this.authStatus(),cancelled:true};
  }catch(error){if(error.code===-32003||p.expiresAt<=Date.now()){this.vault.clear();this.pendingLogin=null;this.cancelUnknown=false;this.lastLoginError='本次请求已失效，请明确重新发起';return this.authStatus();}this.cancelUnknown=true;this.pendingError='取消结果尚未确认；仍保留原请求证明，请刷新核对，不新建登录或宣称取消成功';throw new AccessError(-32001,this.pendingError);}
  finally{this.cancelRequested=false;}
 }
 async logout(){try{await this.restoreLogin();}catch{return super.logout();}if(this.pendingLogin&&!this.login){const status=await this.cancelLogin();if(!status.authenticated)return status;}return super.logout();}
}
