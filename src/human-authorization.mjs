import { createHash } from 'node:crypto';
import { AccessError } from './protocol.mjs';

export const HUMAN_AUTHORIZATION_VERSION = 2;
export const humanAuthorizationCapability = () => ({ version: HUMAN_AUTHORIZATION_VERSION });
export const humanTextSha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
export function requireHumanAuthorizationCapability(value) {
  if (value?.version !== HUMAN_AUTHORIZATION_VERSION) throw new AccessError(-32012, '协作服务尚不支持本次自然语言授权，请等待双端配套升级；未发送业务请求。');
}
export function makeHumanAuthorization({ messageId, text, projectId, items = [], receiptScopes = [] }) {
  if (typeof messageId !== 'string' || !messageId || typeof text !== 'string' || !/^[a-f0-9]{32}$/u.test(projectId ?? '')) throw new AccessError(-32602, '本次真人消息或项目归属尚未明确；未发送业务请求。');
  return {
    version: HUMAN_AUTHORIZATION_VERSION, messageId, textSha256: humanTextSha256(text), projectId,
    attachmentScopes: items.map(item => ({ handle: item.manifest.handle, action: item.manifest.archiveAuthorized ? 'archive' : 'transfer' })),
    receiptScopes: receiptScopes.map(scope => ({ ...scope })),
  };
}
export function validateHumanAuthorization(value, { messageId, text, projectId, items = [] }) {
  const keys = ['version', 'messageId', 'textSha256', 'projectId', 'attachmentScopes', 'receiptScopes'];
  if (!value || Object.keys(value).some(key => !keys.includes(key)) || value.version !== HUMAN_AUTHORIZATION_VERSION || value.messageId !== messageId || value.textSha256 !== humanTextSha256(text) || value.projectId !== projectId || !Array.isArray(value.attachmentScopes) || !Array.isArray(value.receiptScopes) || value.attachmentScopes.length !== items.length) throw new AccessError(-32013, '本次真人授权与消息或项目不一致；未发送业务请求。');
  for (const item of items) {
    const matches = value.attachmentScopes.filter(scope => scope?.handle === item.manifest.handle);
    if (matches.length !== 1 || Object.keys(matches[0]).some(key => !['handle', 'action'].includes(key)) || matches[0].action !== (item.manifest.archiveAuthorized ? 'archive' : 'transfer') || item.manifest.projectId !== projectId) throw new AccessError(-32013, '附件操作超出本次明确授权；未发送业务请求。');
  }
  const receipts = new Set();
  for (const scope of value.receiptScopes) {
    if (!scope || typeof scope.receiptId !== 'string' || !scope.receiptId || receipts.has(scope.receiptId) || scope.action !== 'archive' || Object.keys(scope).some(key => !['receiptId', 'action', 'targetMaterialId', 'expectedLatestVersion', 'restoreVersion'].includes(key))) throw new AccessError(-32013, '附件回执授权不明确；未发送业务请求。');
    receipts.add(scope.receiptId);
  }
  return value;
}
