import { createHash, randomBytes } from 'node:crypto';
import { openSync, closeSync, fstatSync, readSync, lstatSync, realpathSync, existsSync, constants } from 'node:fs';
import { resolve, relative, isAbsolute, basename, dirname } from 'node:path';
import { AccessError } from './protocol.mjs';
import { makeHumanAuthorization } from './human-authorization.mjs';
import { MAX_ATTACHMENT_BYTES, MAX_MESSAGE_ATTACHMENTS, ATTACHMENT_CHUNK_BYTES, safeAttachmentName, validateAttachmentManifest } from './attachment-protocol.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function rejectGifUpload({name,mediaType,data}={}) {
  const signature=data?.subarray(0,6).toString('ascii');
  if (/\.gif$/i.test(name??'') || mediaType==='image/gif' || signature==='GIF87a' || signature==='GIF89a') throw new AccessError(-32602, 'GIF uploads are not allowed; select a PNG, JPEG or WebP original instead');
}
export function explicitPaths(text) {
  if (typeof text !== 'string') return [];
  return [...text.matchAll(/(?:^|[\s（(])@(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s\r\n]+))/gu)].map(match => match[1] ?? match[2] ?? match[3]);
}
function ensureLocalFile(path, workspace) {
  if (typeof workspace !== 'string' || !isAbsolute(workspace)) throw new AccessError(-32602, '当前会话没有可用的本地工作区，无法读取 @ 附件。');
  const root = realpathSync(workspace), target = resolve(root, path), rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new AccessError(-32602, '附件必须在当前会话工作区内。');
  const lower = target.toLowerCase().replaceAll('\\','/');
  if (lower.split('/').some(part => ['.dsh','.ssh','.git'].includes(part)) || /(?:^|\/)(?:\.env(?:\.[^/]*)?|(?:\.?credentials|secrets)(?:\.[^/]*)?|id_(?:rsa|ed25519|ecdsa)|[^/]*_ed25519|[^/]*\.(?:pem|key|pfx|p12))$/i.test(lower)) throw new AccessError(-32602, '凭据、密钥或私有状态目录不能作为附件。');
  if (!existsSync(target)) throw new AccessError(-32602, '附件文件不存在：请确认文件名与当前会话工作区。');
  let part = target;
  for (;;) { if (lstatSync(part).isSymbolicLink()) throw new AccessError(-32602, '附件路径不能包含符号链接或 junction。'); if (part === root) break; const parent = dirname(part); if (parent === part) throw new AccessError(-32602, '附件必须在当前会话工作区内。'); part = parent; }
  if (realpathSync(target) !== target) throw new AccessError(-32602, '附件路径经过了文件系统链接，已拒绝。');
  if (!lstatSync(target).isFile()) throw new AccessError(-32602, '目录不能作为附件上传。');
  return target;
}
function readOneFile(path, expected) {
  const before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink())throw new AccessError(-32602,'附件必须是普通文件，且不能是链接。');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (stat.dev!==before.dev||stat.ino!==before.ino||!stat.isFile()) throw new AccessError(-32602, '读取附件时文件发生变化，请重新选择。');
    if (stat.size === 0) throw new AccessError(-32602, '附件文件为空，请先保存内容后再上传。');
    if (stat.size > MAX_ATTACHMENT_BYTES) throw new AccessError(-32602, '附件超过 20MiB 上限，请选择更小的文件。');
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const n = readSync(fd, bytes, offset, bytes.length-offset, offset); if (!n) throw new AccessError(-32602, '读取附件时文件发生变化，请重新选择。'); offset += n; }
    const after=fstatSync(fd);
    if (after.size !== stat.size || after.mtimeMs!==stat.mtimeMs || after.ctimeMs!==stat.ctimeMs) throw new AccessError(-32602, '读取附件时文件发生变化，请重新选择。');
    if (expected && (expected.bytes !== bytes.length || expected.attachmentId !== 'sha256:'+digest(bytes))) throw new AccessError(-32602, '附件内容与宿主记录不一致，未发送业务请求。');
    return bytes;
  } finally { closeSync(fd); }
}
/** Current human message only. Nothing derived from remote output or a file placeholder grants authority. */
export class AttachmentAuthorization {
  constructor({ attachmentStore, workspaceOf = () => undefined } = {}) { this.attachmentStore = attachmentStore; this.workspaceOf = workspaceOf; this.pending = new Map(); this.active = new Map(); }
  async capture({ localId, message, workspace, signal, admission }) {
    if (message?.role !== 'user' || message.source?.kind !== 'user' || !message.id) throw new AccessError(-32602, 'Current human message required for attachment selection');
    const text = message.content.filter(block=>block.type==='text').map(block=>block.text).join('\n');
    const native = message.content.filter(block=>['file','image'].includes(block.type));
    const paths = explicitPaths(text);
    if (!native.length && !paths.length) return undefined;
    if (native.length+paths.length > MAX_MESSAGE_ATTACHMENTS) throw new AccessError(-32602, 'At most five explicitly selected attachments');
    if (!admission || !/^[a-f0-9]{32}$/u.test(admission.projectId ?? '')) throw new AccessError(-32602, '本次附件项目尚未明确。');
    const permitted = { projectId: admission.projectId };
    const items=[];
    const nativeBytes=native.reduce((sum,block)=>sum+(block.attachment?.bytes??0),0);
    if(!Number.isSafeInteger(nativeBytes)||nativeBytes>MAX_ATTACHMENT_BYTES)throw new AccessError(-32602,'Native message attachments exceed 20MiB total');
    for (const block of native) {
      if (signal?.aborted) throw signal.reason;
      const ref=block.attachment; if (!ref || !this.attachmentStore) throw new AccessError(-32602, 'Official host attachment storage unavailable');
      rejectGifUpload(ref);
      if (ref.bytes === 0) throw new AccessError(-32602, '附件文件为空，请先保存内容后再上传。');
      if (!Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > MAX_ATTACHMENT_BYTES) throw new AccessError(-32602, '附件大小无效或超过 20MiB 上限，请重新选择。');
      const name=safeAttachmentName(ref.name ?? ({'image/png':'image.png','image/jpeg':'image.jpg','image/webp':'image.webp','image/gif':'image.gif'}[ref.mediaType] ?? 'attachment.bin'));
      const path=block.type==='file' ? this.attachmentStore.fileHostPath(ref) : this.attachmentStore.imageHostPath(ref);
      let data;
      if (path) data=readOneFile(path,ref);
      else if (block.type==='image') data=Buffer.from((await this.attachmentStore.readImage(ref,signal)).data);
      else { const chunks=[]; let size=0; for await(const chunk of this.attachmentStore.readFileStream(ref,signal)){size+=chunk.length;if(size>MAX_ATTACHMENT_BYTES)throw new AccessError(-32602,'Host attachment too large');chunks.push(Buffer.from(chunk));}data=Buffer.concat(chunks); }
      if (data.length!==ref.bytes || ref.attachmentId!=='sha256:'+digest(data)) throw new AccessError(-32602,'Invalid host attachment integrity');
      items.push(this.item(name,data,block.type==='file'?'file-attachment':'normalized-image',permitted));
    }
    for (const selected of paths) { if(signal?.aborted)throw signal.reason; const path=ensureLocalFile(selected,workspace??this.workspaceOf(localId));if(items.reduce((sum,item)=>sum+item.manifest.bytes,0)+lstatSync(path).size>MAX_ATTACHMENT_BYTES)throw new AccessError(-32602,'Message attachments exceed 20MiB total');items.push(this.item(safeAttachmentName(basename(path)),readOneFile(path),'local-path',permitted)); }
    validateAttachmentManifest(items.map(item=>item.manifest));
    const entry={localId,messageId:String(message.id),items,text,...(admission ? { humanAuthorization: makeHumanAuthorization({messageId:String(message.id),text,projectId:admission.projectId}) } : {})};this.pending.set(`${localId}\0${message.id}`,entry);return entry;
  }
  item(name,data,sourceKind,permitted){if(!data.length)throw new AccessError(-32602,'附件文件为空，请先保存内容后再上传。');rejectGifUpload({name,data});return {manifest:{handle:randomBytes(32).toString('hex'),name,bytes:data.length,sha256:digest(data),sourceKind,...permitted},data};}
  take(localId,messageId){const key=`${localId}\0${messageId}`,entry=this.pending.get(key);this.pending.delete(key);return entry;}
  bind(sessionId,requestId,entry,signal){const key=`${sessionId}\0${requestId}`;this.active.set(key,{...entry,signal});return()=>this.active.delete(key);}
  read({sessionId,requestId,handle,offset,maxBytes}){
    const entry=this.active.get(`${sessionId}\0${requestId}`),item=entry?.items.find(item=>item.manifest.handle===handle);
    if(!item || entry.signal?.aborted)throw new AccessError(-32013,'Attachment not authorized for this current request/session');
    if(!Number.isSafeInteger(offset)||offset<0||offset>=item.data.length||!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>ATTACHMENT_CHUNK_BYTES)throw new AccessError(-32602,'Invalid attachment chunk bounds');
    const data=item.data.subarray(offset,Math.min(offset+maxBytes,item.data.length));return {offset,data:data.toString('base64'),bytes:data.length,eof:offset+data.length===item.data.length};
  }
  clear(){this.pending.clear();this.active.clear();}
}
