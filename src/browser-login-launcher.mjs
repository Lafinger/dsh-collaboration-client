import {spawn} from 'node:child_process';import {join} from 'node:path';import {fileURLToPath} from 'node:url';
import {AccessError} from './protocol.mjs';import {trustedOrigin} from './https-peer.mjs';
const invalid=()=>{throw new AccessError(-32003,'浏览器打开目标与本次扫码请求不匹配；未打开其他地址');};
export function validateBrowserLoginTarget({origin,loginUrl,openUrl}={}){try{origin=trustedOrigin(origin);if(typeof loginUrl!=='string'||loginUrl.length>2048||/[\x00-\x20\x7f]/.test(loginUrl)||openUrl!==loginUrl)invalid();const url=new URL(loginUrl);if(url.origin!==origin||url.protocol!=='https:'||url.pathname!=='/collaboration/qr-login'||url.search||url.username||url.password||!/^#[A-Za-z0-9_-]{43}$/.test(url.hash))invalid();return url.href;}catch{invalid();}}
/** Exact current trusted URL only; Windows default-browser association. No shell interpolation or URL command-line/log leak. */
export async function openQrBrowser(target,{platform=process.platform,spawnProcess=spawn}={}){
 const url=validateBrowserLoginTarget(target);if(platform!=='win32')throw new AccessError(-32011,'此MVP系统默认浏览器打开仅在Windows设备验收，不使用命令行或明文链接绕过');
 const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe'),script=fileURLToPath(new URL('./windows-open-browser.ps1',import.meta.url));
 return new Promise((resolve,reject)=>{let child,timer,done=false;const finish=ok=>{if(done)return;done=true;clearTimeout(timer);ok?resolve({status:'requested'}):reject(new AccessError(-32001,'未能请求打开默认浏览器；请核对系统浏览器关联，再明确重新打开本次扫码请求'));};try{child=spawnProcess(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script],{windowsHide:true,stdio:['pipe','ignore','ignore']});child.once('error',()=>finish(false));child.once('close',code=>finish(code===0));child.stdin.once('error',()=>finish(false));timer=setTimeout(()=>{finish(false);try{child.kill();}catch{}},10000);child.stdin.end(url);}catch{finish(false);}});
}
