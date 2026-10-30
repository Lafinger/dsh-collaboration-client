import { createHash } from 'node:crypto';
import { AccessError } from './protocol.mjs';

export const HUMAN_AUTHORIZATION_VERSION = 3;
export const humanAuthorizationCapability = () => ({ version: HUMAN_AUTHORIZATION_VERSION });
export const humanTextSha256 = text => createHash('sha256').update(text, 'utf8').digest('hex');
export function requireHumanAuthorizationCapability(value) {
  if (value?.version !== HUMAN_AUTHORIZATION_VERSION) throw new AccessError(-32012, '协作服务尚不支持本次授权元数据版本，请等待双端配套升级；未发送业务请求。');
}
export function makeHumanAuthorization({ messageId, text, projectId }) {
  if (typeof messageId !== 'string' || !messageId || typeof text !== 'string' || !/^[a-f0-9]{32}$/u.test(projectId ?? '')) throw new AccessError(-32602, '本次真人消息或项目归属尚未明确；未发送业务请求。');
  return { version: HUMAN_AUTHORIZATION_VERSION, messageId, textSha256: humanTextSha256(text), projectId };
}
export function validateHumanAuthorization(value, { messageId, text, projectId }) {
  const keys = ['version', 'messageId', 'textSha256', 'projectId'];
  if (!value || Object.keys(value).length !== keys.length || keys.some(key => value[key] === undefined) || value.version !== HUMAN_AUTHORIZATION_VERSION || value.messageId !== messageId || value.textSha256 !== humanTextSha256(text) || value.projectId !== projectId) throw new AccessError(-32013, '本次真人授权与消息或项目不一致；未发送业务请求。');
  return value;
}
