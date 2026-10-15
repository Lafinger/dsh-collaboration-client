import {spawnSync} from 'node:child_process';
import {readFileSync,writeFileSync,existsSync,lstatSync,renameSync,mkdirSync,unlinkSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {randomUUID} from 'node:crypto';
import {AccessError} from './protocol.mjs';

/** Windows CurrentUser DPAPI. Plain token never touches disk, args, browser state or config. */
export class LoginVault {
 constructor(path,{crypt=windowsCrypt}={}){this.path=path;this.crypt=crypt;}
 save(value){
  const encrypted=this.crypt('protect',Buffer.from(JSON.stringify(value)).toString('base64'));
  if(typeof encrypted!=='string'||encrypted.length>32768||!/^[A-Za-z0-9+/=]+$/.test(encrypted))throw new AccessError(-32003,'本机安全登录存储失败，未保存登录');
  mkdirSync(dirname(this.path),{recursive:true,mode:0o700});this.safe();
  const temp=this.path+'.'+randomUUID()+'.tmp';writeFileSync(temp,JSON.stringify({version:1,encrypted}),{flag:'wx',mode:0o600});renameSync(temp,this.path);
 }
 load(){
  if(!existsSync(this.path))return null;this.safe();
  try{const record=JSON.parse(readFileSync(this.path,'utf8'));if(record.version!==1||typeof record.encrypted!=='string')throw new Error();return JSON.parse(Buffer.from(this.crypt('unprotect',record.encrypted),'base64').toString('utf8'));}
  catch{throw new AccessError(-32003,'本机加密登录无法读取，请明确退出该设备后重新登录，不使用损坏状态');}
 }
 safe(){if(existsSync(this.path)){const s=lstatSync(this.path);if(!s.isFile()||s.isSymbolicLink()||s.size>40000)throw new AccessError(-32003,'本机登录存储路径不安全');}}
 clear(){this.safe();if(existsSync(this.path))unlinkSync(this.path);}
}
export function windowsCrypt(action,input){
 if(process.platform!=='win32')throw new AccessError(-32011,'本MVP七天登录记忆需Windows系统加密存储，当前平台未验收，不降级明文');
 const executable=join(process.env.SystemRoot??'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');
 const script=fileURLToPath(new URL('./windows-vault.ps1',import.meta.url));
 const result=spawnSync(executable,['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',script,action],{input,encoding:'utf8',windowsHide:true,timeout:10000,maxBuffer:65536});
 if(result.error||result.status!==0)throw new AccessError(-32003,'Windows系统安全存储不可用，未使用明文替代');return result.stdout.trim();
}
