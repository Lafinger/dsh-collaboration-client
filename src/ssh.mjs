import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import { isAbsolute } from 'node:path';
import { JsonPeer } from './protocol.mjs';
import { SshDiagnostics, sshSpawnError } from './ssh-diagnostics.mjs';

export function sshArguments(config) {
  if (typeof config.host !== 'string' || !/^[a-zA-Z0-9][a-zA-Z0-9.-]*$/.test(config.host) || typeof config.account !== 'string' || !/^[a-zA-Z0-9_][a-zA-Z0-9_.-]*$/.test(config.account)) throw new Error('Invalid SSH host/account');
  if (config.sshExecutable !== undefined && (typeof config.sshExecutable !== 'string' || !isAbsolute(config.sshExecutable) || /[\r\n\0]/.test(config.sshExecutable))) throw new Error('sshExecutable must be an absolute executable path');
  for (const field of ['identityFile', 'knownHostsFile']) if (typeof config[field] !== 'string' || !isAbsolute(config[field]) || /[\r\n\0]/.test(config[field])) throw new Error(`${field} must be an absolute path`);
  const port = config.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH port');
  // No user-editable remote command. Deployment must install this forced-command endpoint.
  return ['-F', 'none', '-T', '-p', String(port), '-l', config.account,
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${config.knownHostsFile}`,
    '-o', 'IdentitiesOnly=yes', '-o', 'PreferredAuthentications=publickey', '-o', 'PasswordAuthentication=no',
    '-o', 'KbdInteractiveAuthentication=no', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes',
    '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=2', '-o', 'ConnectTimeout=15',
    '-i', config.identityFile, config.host, 'collaboration-connect'];
}
export async function openSsh(config, { spawnProcess = spawn } = {}) {
  const args=sshArguments(config);let child;
  try{child=spawnProcess(config.sshExecutable ?? 'ssh',args,{stdio:['pipe','pipe','pipe'],windowsHide:true,shell:false});}catch(error){throw sshSpawnError(error);}
  const diagnostics=new SshDiagnostics();let peer,ended=false,terminated=false,exitCode=null,signal=null,timer,queuedError,finalError,draining=false,resolveFailure;
  const failureReady=new Promise(resolve=>{resolveFailure=resolve;});
  // stdout EOF commonly arrives before close/stderr. Hold just that failure briefly, not requests or protocol errors.
  const finish=(error)=>{if(ended)return;ended=true;clearTimeout(timer);const failure=error??diagnostics.error({exitCode,signal});finalError=failure;resolveFailure(failure);diagnostics.clear();if(peer)peer.fail(failure);else queuedError=failure;};
  const waitForClose=()=>{draining=true;if(!timer&&!ended)timer=setTimeout(()=>finish(),300);};
  child.stderr?.setEncoding('utf8');child.stderr?.on('data',chunk=>{if(!ended)diagnostics.push(chunk);});child.stderr?.on('error',()=>{});
  child.on('exit',(code,bySignal)=>{terminated=true;exitCode=code;signal=bySignal;waitForClose();});
  child.on('close',(code,bySignal)=>{terminated=true;exitCode=code;signal=bySignal;finish();});
  child.on('error',error=>finish(sshSpawnError(error)));
  try{await new Promise((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});}catch(error){clearTimeout(timer);diagnostics.clear();throw sshSpawnError(error);}
  // Keep the shared versioned JsonPeer untouched: server/client joint contract stays byte-identical.
  const input=new class extends EventEmitter{
    setEncoding(encoding){child.stdout.setEncoding(encoding);}destroy(){child.stdout.destroy();}
  }();
  child.stdout.on('data',chunk=>input.emit('data',chunk));
  child.stdout.on('end',waitForClose);child.stdout.on('close',waitForClose);
  child.stdout.on('error',waitForClose);
  child.stdin.on('error',()=>{waitForClose();});
  const output={get writableLength(){return child.stdin.writableLength;},write(line){if(draining)return false;try{return child.stdin.write(line);}catch{waitForClose();return false;}},on(){return this;},destroy(){child.stdin.destroy();}};
  peer=new JsonPeer(input,output);
  const fail=peer.fail.bind(peer);peer.fail=error=>{if(ended||error?.code===-32001)return fail(error);ended=true;clearTimeout(timer);const failure=diagnostics.error({exitCode,signal,protocol:true});finalError=failure;resolveFailure(failure);diagnostics.clear();return fail(failure);};
  const request=peer.request.bind(peer);peer.request=(method,params,options)=>{if(peer.closed)return Promise.reject(finalError??queuedError??diagnostics.error({exitCode,signal}));diagnostics.request(method);if(draining)return failureReady.then(error=>{throw error;});return request(method,params,options);};
  peer.on('disconnected',error=>{finalError??=error;resolveFailure(finalError);clearTimeout(timer);diagnostics.clear();ended=true;child.stderr?.destroy();if(!terminated){child.stdin.end();child.kill();}});
  if(queuedError)peer.fail(queuedError);
  return peer;
}
