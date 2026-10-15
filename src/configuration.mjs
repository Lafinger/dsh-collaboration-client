import { readFileSync, existsSync, statSync, readdirSync, lstatSync, realpathSync, mkdirSync, writeFileSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, isAbsolute, dirname, relative, sep } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { sshArguments } from './ssh.mjs';

export const defaultConfigPath = () => join(homedir(), '.dsh', 'dsh-collaboration-client', 'collaboration-client.json');
export const selectionFileName = '.member-selection.json';
const required = ['serviceId', 'databasePath', 'loginOrigin', 'ssh.host', 'ssh.account', 'ssh.identityFile', 'ssh.knownHostsFile'];
const text = value => typeof value === 'string' && value.trim().length > 0;
const get = (value, key) => key.split('.').reduce((node, part) => node?.[part], value);
const allowed = new Set(['serviceId', 'databasePath', 'loginOrigin', 'ssh', 'provider', 'model']);
const sshFields = new Set(['host', 'account', 'port', 'identityFile', 'knownHostsFile', 'sshExecutable']);
const pending = (configPath, source, missing = [], issue = '未发现可用成员配置') => ({
  state: 'configuration-required', configPath, source, missing, issue,
  message: `协作客户端待配置：${issue}。请在设置 → 协作服务选择或导入成员连接配置；尚未连接服务器。`,
});

export function validateMemberConfiguration(value, { configPath = null, source = 'import', input = {} } = {}) {
  const fail = (issue, missing = []) => pending(configPath, source, missing, issue);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fail('成员配置必须是JSON对象');
  if (Object.keys(value).some(key => !allowed.has(key))) return fail('成员配置含不支持字段；不得导入服务端配置、签名密钥或私钥正文');
  const missing = required.filter(key => !text(get(value, key)));
  if (missing.length) return fail(`缺少 ${missing.join('、')}`, missing);
  if (typeof value.ssh !== 'object' || Array.isArray(value.ssh) || Object.keys(value.ssh).some(key => !sshFields.has(key))) return fail('SSH配置含不支持字段；远端命令固定且不得添加密钥内容');
  for (const field of ['provider', 'model']) if (value[field] !== undefined && !text(value[field])) return fail('provider/model必须为非空文本');
  if (value.serviceId.length > 200 || value.ssh.account.length > 200 || /[\r\n\0]/.test(value.serviceId)) return fail('服务或账号标识无效／过长');
  if (value.databasePath !== ':memory:' && !isAbsolute(value.databasePath)) return fail('databasePath必须为绝对路径');
  try { sshArguments(value.ssh); } catch { return fail('SSH参数无效；检查主机、账号、端口与密钥／known_hosts绝对路径'); }
  let loginOrigin;
  try { const origin = new URL(value.loginOrigin); if (origin.protocol !== 'https:' || origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash) throw new Error(); loginOrigin = origin.origin; }
  catch { return fail('必须提供可信HTTPS登录origin，不猜测其他登录地址'); }
  const provider = input.provider ?? value.provider ?? 'collaboration-remote', model = input.model ?? value.model ?? 'server-agent';
  if (!text(provider) || !text(model) || provider.length > 200 || model.length > 200 || /[\r\n\0]/.test(provider+model)) return fail('provider/model必须为200字符内非空文本');
  return { state: 'configured', config: { ...value, ssh: { ...value.ssh }, loginOrigin, provider, model }, configPath, source,
    message: '成员连接配置完整；尚未认证。请在设置 → 协作服务发起钉钉扫码。' };
}

function readConfig(file, source, input = {}) {
  if (!isAbsolute(file)) return pending(file, source, [], '配置路径必须为绝对路径');
  if (!existsSync(file)) return pending(file, source, required, '成员配置文件不存在');
  try {
    const stat = statSync(file); if (!stat.isFile() || stat.size > 65536) return pending(file, source, [], '成员配置必须是小于64KiB的普通文件');
    return validateMemberConfiguration(JSON.parse(readFileSync(file, 'utf8').replace(/^\uFEFF/, '')), { configPath: file, source, input });
  } catch { return pending(file, source, [], '成员配置无法读取或JSON格式无效'); }
}
export function configurationFingerprint(config) {
  return createHash('sha256').update(JSON.stringify([config.serviceId, config.databasePath, config.loginOrigin, config.ssh.host, config.ssh.port ?? 22, config.ssh.account, config.ssh.identityFile, config.ssh.knownHostsFile, config.ssh.sshExecutable ?? 'ssh', config.provider, config.model])).digest('hex');
}
function contained(base, file) {
  const part = relative(realpathSync(base), realpathSync(file)); return part !== '..' && !part.startsWith('..' + sep) && !isAbsolute(part);
}
function candidate(base, file) {
  try {
    // Do not follow directory/file links or junctions into another configuration tree.
    if (!lstatSync(file).isFile() || lstatSync(file).isSymbolicLink() || !contained(base, file)) return null;
    const result = readConfig(file, 'discovery');
    if (result.state === 'configured') {
      for (const name of ['identityFile', 'knownHostsFile']) if (!statSync(result.config.ssh[name]).isFile()) throw new Error();
    }
    return { id: relative(base, file).split(sep).join('/'), ...result };
  } catch { return { id: relative(base, file).split(sep).join('/'), ...pending(file, 'discovery', [], '配置引用的密钥／known_hosts文件不存在或不可访问') }; }
}
export function discoverMemberConfigurations({ fallbackPath = defaultConfigPath() } = {}) {
  const base = dirname(fallbackPath), found = [];
  if (!isAbsolute(base) || !existsSync(base)) return found;
  const add = file => { if (existsSync(file)) { const value = candidate(base, file); if (value) found.push(value); } };
  add(fallbackPath);
  try {
    for (const entry of readdirSync(base, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      const directory = join(base, entry.name); if (lstatSync(directory).isSymbolicLink() || !contained(base, directory)) continue;
      add(join(directory, 'collaboration-client.json'));
    }
  } catch { /* A partially inaccessible directory does not authorize guessing another identity. */ }
  return found;
}

/** Saved UI choice > legacy explicit settings > bounded automatic discovery. Never merge identity fields. */
export function resolveMemberConfiguration(input = {}, { fallbackPath = defaultConfigPath(), env = process.env, useSaved = true } = {}) {
  const base = dirname(fallbackPath), selectedPath = join(base, selectionFileName);
  let automatic = false;
  if (useSaved && existsSync(selectedPath)) {
    let saved;
    try { if (!lstatSync(selectedPath).isFile() || lstatSync(selectedPath).isSymbolicLink() || statSync(selectedPath).size > 4096 || !contained(base,selectedPath)) throw new Error(); saved = JSON.parse(readFileSync(selectedPath, 'utf8')); if (saved.version !== 1 || !['auto', 'selected'].includes(saved.mode) || (saved.mode==='selected' && (!text(saved.id)||!/^[a-f0-9]{64}$/.test(saved.fingerprint)))) throw new Error(); }
    catch { return pending(selectedPath, 'saved-selection', [], '已保存的配置选择损坏，请在设置中重新选择'); }
    automatic = saved.mode === 'auto';
    if (!automatic) {
      const selected = discoverMemberConfigurations({ fallbackPath }).find(row => row.id === saved.id);
      if (!selected || selected.state !== 'configured' || configurationFingerprint(selected.config) !== saved.fingerprint) return pending(selected?.configPath ?? selectedPath, 'saved-selection', [], '已选配置已丢失、损坏或身份参数改变；请重新选择，不自动换账号');
      return { ...selected, source: 'saved-selection' };
    }
  }
  if (!automatic) {
    const inline = required.some(key => text(get(input, key)));
    if (inline && text(input.configFile)) return pending(input.configFile, 'inline', [], '不要同时使用configFile与内联连接参数');
    if (inline) { const value = Object.fromEntries(Object.entries(input).filter(([key]) => allowed.has(key))); return validateMemberConfiguration(value, { source: 'inline', input }); }
    if (text(input.configFile)) return readConfig(input.configFile, 'explicit', input);
    if (text(env.DSH_COLLABORATION_CLIENT_CONFIG)) return readConfig(env.DSH_COLLABORATION_CLIENT_CONFIG, 'environment', input);
  }
  const candidates = discoverMemberConfigurations({ fallbackPath });
  const direct = candidates.find(row => row.configPath === fallbackPath && row.state === 'configured');
  if (direct) return direct;
  const valid = candidates.filter(row => row.state === 'configured');
  if (valid.length === 1) return valid[0];
  if (valid.length > 1) return pending(fallbackPath, 'discovery', [], '发现多份可用成员配置，请在设置中明确选择');
  const invalid = candidates.find(row => row.configPath === fallbackPath);
  return invalid ?? pending(fallbackPath, 'discovery', required, '未发现可用成员配置');
}
export function saveMemberSelection(base, value) {
  mkdirSync(base, { recursive: true, mode: 0o700 });
  const target = join(base, selectionFileName), temporary = join(base, '.member-selection-' + randomUUID() + '.tmp');
  writeFileSync(temporary, JSON.stringify({ version: 1, ...value }, null, 2), { flag: 'wx', mode: 0o600 });
  renameSync(temporary, target);
}
export function publicConfiguration(result) {
  const { config, ...status } = result;
  return { ...status, ...(config ? { provider: config.provider, model: config.model, serviceId: config.serviceId, account: config.ssh.account,
    host: config.ssh.host, port: config.ssh.port ?? 22, loginOrigin: config.loginOrigin, identityFile: config.ssh.identityFile, knownHostsFile: config.ssh.knownHostsFile } : {}) };
}
