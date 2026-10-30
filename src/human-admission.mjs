import { AccessError } from './protocol.mjs';
import { HUMAN_AUTHORIZATION_VERSION } from './human-authorization.mjs';
import { ATTACHMENT_PROTOCOL_VERSION } from './attachment-protocol.mjs';
import { explicitPaths } from './attachments.mjs';

/** Runs only inside the chosen collaboration adapter stream for the current human turn.
 * Minimum admission: an attachment turn requires the session's bound project; everything
 * else forwards untouched for the model to clarify. Negotiated capabilities may still be
 * unset before the first connect; prompt-time checks fail closed on any wrong version. */
export async function admitHumanTurn({ client, options, message }) {
  const localId = String(options.sessionId);
  const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
  const hasAttachments = message.content.some(block => ['file', 'image'].includes(block.type)) || explicitPaths(text).length > 0;
  if (!hasAttachments) return { admission: undefined };
  let human = client.humanAuthorizationCapability;
  if (!human && typeof client.ensureConnected === 'function') {
    try { await client.ensureConnected(); } catch { /* capability gate below re-checks; prompt time fails closed too */ }
    human = client.humanAuthorizationCapability;
  }
  if (!human || human.version !== HUMAN_AUTHORIZATION_VERSION) throw new AccessError(-32012, '协作服务尚不支持本次授权元数据版本，请等待双端配套升级；未发送业务请求。');
  const attachment = client.attachmentCapability;
  if (attachment && attachment.version !== ATTACHMENT_PROTOCOL_VERSION) throw new AccessError(-32012, 'Matching attachment-capable client and server required; no upload downgrade or prompt replay');
  const projectId = client.selectedProject?.(localId);
  if (!projectId || !/^[a-f0-9]{32}$/u.test(projectId)) throw new AccessError(-32602, '当前会话尚未绑定项目；请先打开模型菜单明确选择项目，再发送附件。');
  return { admission: { projectId } };
}
