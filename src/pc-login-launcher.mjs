import {spawn} from 'node:child_process';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {AccessError} from './protocol.mjs';
import {trustedOrigin} from './https-peer.mjs';
const invalid=()=>{throw new AccessError(-32003,'电脑钉钉打开目标与当前登录请求不匹配；未打开其他地址');};

/** Only this exact current-request DingTalk work-platform URL may cross the local OS boundary. */
export function validatePcLoginTarget({origin,loginUrl,openUrl}={}){
 try{
  origin=trustedOrigin(origin);
  if(typeof loginUrl!=='string'||typeof openUrl!=='string'||openUrl.length>8192||/[\x00-\x20\x7f]/.test(openUrl))invalid();
  const page=new URL(loginUrl),jump=new URL(openUrl),keys=['corpid','container_type','app_id','redirect_type','redirect_url'];
  if(page.origin!==origin||page.pathname!=='/collaboration/pc-login'||page.search||page.username||page.password||!/^#[A-Za-z0-9_-]{43}$/.test(page.hash))invalid();
  if(jump.protocol!=='dingtalk:'||jump.hostname!=='dingtalkclient'||jump.pathname!=='/action/openapp'||jump.port||jump.username||jump.password||jump.hash||[...jump.searchParams].length!==keys.length||keys.some(k=>jump.searchParams.getAll(k).length!==1)||[...jump.searchParams.keys()].some(k=>!keys.includes(k)))invalid();
  if(!/^[A-Za-z0-9_-]{1,200}$/.test(jump.searchParams.get('corpid')??'')||jump.searchParams.get('container_type')!=='work_platform'||!/^0_\d{1,30}$/.test(jump.searchParams.get('app_id')??'')||jump.searchParams.get('redirect_type')!=='jump'||jump.searchParams.get('redirect_url')!==loginUrl)invalid();
  return jump.href;
 }catch{invalid();}
}

/** Local Host operation, not browser navigation. OS acceptance is NOT identity confirmation or proof that a page rendered. */
export async function openPcDingTalk(target,{platform=process.platform,spawnProcess=spawn}={}){
 const url=validatePcLoginTarget(target);
 if(platform!=='win32')throw new AccessError(-32011,'本MVP自动打开电脑钉钉仅在Windows验收；请在电脑钉钉工作台打开同一应用');
 const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const script=fileURLToPath(new URL('./windows-open-dingtalk.ps1',import.meta.url));
 return new Promise((resolve,reject)=>{
  let child,timer,done=false;
  const finish=success=>{if(done)return;done=true;clearTimeout(timer);if(success)resolve({status:'requested'});else reject(new AccessError(-32001,'未能自动打开电脑钉钉；请确认电脑钉钉已安装并登录，可重新打开或从其工作台进入同一应用核对本次请求'));};
  try{
   // URL travels only on stdin, never PowerShell arguments/interpolated commands, logs or stderr capture. No shell:true.
   child=spawnProcess(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['pipe','ignore','ignore']});
   child.once('error',()=>finish(false));child.once('close',code=>finish(code===0));child.stdin.once('error',()=>finish(false));
   timer=setTimeout(()=>{finish(false);try{child.kill();}catch{/* Only our bounded helper; never the DingTalk or DSH process. */}},10000);
   child.stdin.end(url);
  }catch{finish(false);}
 });
}
