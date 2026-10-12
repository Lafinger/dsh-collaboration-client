import { readFileSync, existsSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute } from 'node:path';
import { sshArguments } from './ssh.mjs';

export const defaultConfigPath = () => join(homedir(), '.dsh', 'collaboration-client.json');
const required = ['serviceId', 'databasePath', 'ssh.host', 'ssh.account', 'ssh.identityFile', 'ssh.knownHostsFile'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const get = (value, key) => key.split('.').reduce((node, part) => node?.[part], value);

/** Missing deployment configuration is a safe state, never permission to guess an endpoint. */
export function resolveMemberConfiguration(input = {}, { fallbackPath = defaultConfigPath() } = {}) {
  const filePath = text(input.configFile) ? input.configFile : fallbackPath;
  const pending = (missing, issue) => ({ state: 'configuration-required', missing, issue, configPath: filePath,
    message: `协作客户端待配置：${issue ?? `缺少 ${missing.join('、')}`}。请填写客户端 JSON 配置 ${filePath}，检查后重新启用组件；尚未连接服务器。` });
  const inline = required.some(key => text(get(input, key)));
  let value = input;
  if (inline && text(input.configFile)) return pending([], '不要同时使用 configFile 与内联连接参数');
  if (!inline) {
    if (!isAbsolute(filePath)) return pending([], 'configFile 必须为绝对路径');
    if (!existsSync(filePath)) return pending(required, '客户端配置文件尚不存在');
    try {
      const stat = statSync(filePath);
      if (!stat.isFile() || stat.size > 65536) return pending([], '客户端配置文件必须是小于 64KiB 的普通文件');
      value = JSON.parse(readFileSync(filePath, 'utf8').replace(/^\uFEFF/, ''));
    } catch { return pending([], '客户端配置文件无法读取或 JSON 格式无效'); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) return pending([], '客户端配置必须是 JSON 对象');
    const allowed = new Set(['serviceId', 'databasePath', 'ssh', 'provider', 'model']);
    if (Object.keys(value).some(key => !allowed.has(key))) return pending([], '客户端配置含不支持字段；不要使用服务端配置或签名密钥');
  }
  const missing = required.filter(key => !text(get(value, key)));
  if (missing.length) return pending(missing);
  const sshFields = new Set(['host', 'account', 'port', 'identityFile', 'knownHostsFile', 'sshExecutable']);
  if (Object.keys(value.ssh).some(key => !sshFields.has(key))) return pending([], 'SSH 配置含不支持字段；远端命令固定且不得添加密钥内容');
  for (const field of ['provider', 'model']) if (value[field] !== undefined && !text(value[field])) return pending([], 'provider/model 必须为非空文本');
  if (value.serviceId.length > 200 || value.ssh.account.length > 200) return pending([], '服务或账号标识过长');
  if (value.databasePath !== ':memory:' && !isAbsolute(value.databasePath)) return pending([], 'databasePath 必须为绝对路径');
  try { sshArguments(value.ssh); } catch { return pending([], 'SSH 参数无效；请检查主机、账号、端口及密钥/known_hosts 绝对路径'); }
  const provider = input.provider ?? value.provider ?? 'workbench-remote', model = input.model ?? value.model ?? 'server-agent';
  if (!text(provider) || !text(model)) return pending([], 'provider/model 必须为非空文本');
  const config = { ...value, provider, model };
  return { state: 'configured', config, configPath: inline ? null : filePath,
    message: '客户端配置完整；尚未证明 SSH 或服务可达，首次业务消息才发起连接。' };
}
