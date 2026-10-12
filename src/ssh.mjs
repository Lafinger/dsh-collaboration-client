import { spawn } from 'node:child_process';
import { isAbsolute } from 'node:path';
import { JsonPeer } from './protocol.mjs';

export function sshArguments(config) {
  if (!/^[a-zA-Z0-9.-]+$/.test(config.host ?? '') || !/^[a-zA-Z0-9_.-]+$/.test(config.account ?? '')) throw new Error('Invalid SSH host/account');
  for (const field of ['identityFile', 'knownHostsFile']) if (!isAbsolute(config[field] ?? '')) throw new Error(`${field} must be an absolute path`);
  const port = config.port ?? 22;
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid SSH port');
  // No user-editable remote command. Deployment must install this forced-command endpoint.
  return ['-F', 'none', '-T', '-p', String(port), '-l', config.account,
    '-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=yes', '-o', `UserKnownHostsFile=${config.knownHostsFile}`,
    '-o', 'IdentitiesOnly=yes', '-o', 'PreferredAuthentications=publickey', '-o', 'PasswordAuthentication=no',
    '-o', 'KbdInteractiveAuthentication=no', '-o', 'ForwardAgent=no', '-o', 'ClearAllForwardings=yes',
    '-o', 'ServerAliveInterval=10', '-o', 'ServerAliveCountMax=2', '-o', 'ConnectTimeout=15',
    '-i', config.identityFile, config.host, 'workbench-connect'];
}
export async function openSsh(config, { spawnProcess = spawn } = {}) {
  const child = spawnProcess(config.sshExecutable ?? 'ssh', sshArguments(config), { stdio: ['pipe', 'pipe', 'inherit'], windowsHide: true, shell: false });
  await new Promise((resolve, reject) => { child.once('spawn', resolve); child.once('error', reject); });
  const peer = new JsonPeer(child.stdout, child.stdin);
  peer.on('disconnected', () => { child.stdin.end(); child.kill(); });
  child.on('exit', (code) => peer.fail(new Error(`SSH connector exited (${code}); submitted requests are not retried`)));
  return peer;
}
