import { createHash, randomBytes } from 'node:crypto';
import { openSync, closeSync, fstatSync, readSync, lstatSync, realpathSync, constants } from 'node:fs';
import { resolve, relative, isAbsolute, basename, dirname } from 'node:path';
import { AccessError } from './protocol.mjs';
import { MAX_ATTACHMENT_BYTES, MAX_MESSAGE_ATTACHMENTS, ATTACHMENT_CHUNK_BYTES, safeAttachmentName, validateAttachmentManifest } from './attachment-protocol.mjs';
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
export function explicitPaths(text) {
  if (typeof text !== 'string') return [];
  return [...text.matchAll(/(?:^|[\s（(])@(?:"([^"\r\n]+)"|'([^'\r\n]+)'|([^\s\r\n]+))/gu)].map(match => match[1] ?? match[2] ?? match[3]);
}
function authorization(text) {
  const projects = [...text.matchAll(/(?:project_id|项目ID|项目id)\s*[:：=]\s*([a-f0-9]{32})(?![a-f0-9])/gu)];
  const project = projects.length === 1 ? projects[0] : undefined;
  const operations = [...text.matchAll(/^附件操作\s*[:：]\s*(上传并归档|仅传输)\s*$/gmu)];
  if (!project || operations.length !== 1) throw new AccessError(-32602, '附件请求须在当前消息单独写出 附件操作: 上传并归档（或仅传输）及 project_id: <项目ID>');
  return { projectId: project[1], archiveAuthorized: operations[0][1] === '上传并归档' };
}
function ensureLocalFile(path, workspace) {
  if (typeof workspace !== 'string' || !isAbsolute(workspace)) throw new AccessError(-32602, 'Explicit local session workspace required for path attachments');
  const root = realpathSync(workspace), target = resolve(root, path), rel = relative(root, target);
  if (!rel || rel === '..' || rel.startsWith('../') || rel.startsWith('..\\') || isAbsolute(rel)) throw new AccessError(-32602, 'Attachment must be one file inside current local workspace');
  const lower = target.toLowerCase().replaceAll('\\','/');
  if (lower.split('/').some(part => ['.dsh','.ssh','.git'].includes(part)) || /(?:^|\/)(?:\.env(?:\.[^/]*)?|(?:\.?credentials|secrets)(?:\.[^/]*)?|id_(?:rsa|ed25519|ecdsa)|[^/]*_ed25519|[^/]*\.(?:pem|key|pfx|p12))$/i.test(lower)) throw new AccessError(-32602, 'Credential/key/private-state paths are not attachment sources');
  let part = target;
  for (;;) { if (lstatSync(part).isSymbolicLink()) throw new AccessError(-32602, 'Attachment path must not contain symlinks or junctions'); if (part === root) break; const parent = dirname(part); if (parent === part) throw new AccessError(-32602, 'Attachment path escaped workspace'); part = parent; }
  if (realpathSync(target) !== target) throw new AccessError(-32602, 'Attachment path escaped through a filesystem link');
  if (!lstatSync(target).isFile()) throw new AccessError(-32602, 'Directories are not upload attachments');
  return target;
}
function readOneFile(path, expected) {
  const before=lstatSync(path);
  if(!before.isFile()||before.isSymbolicLink())throw new AccessError(-32602,'Attachment source must remain a regular non-link file');
  const fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
  try {
    const stat = fstatSync(fd);
    if (stat.dev!==before.dev||stat.ino!==before.ino||!stat.isFile() || stat.size < 1 || stat.size > MAX_ATTACHMENT_BYTES) throw new AccessError(-32602, 'File must be nonempty and at most 20MiB');
    const bytes = Buffer.alloc(stat.size); let offset = 0;
    while (offset < bytes.length) { const n = readSync(fd, bytes, offset, bytes.length-offset, offset); if (!n) throw new AccessError(-32602, 'File changed during upload selection'); offset += n; }
    const after=fstatSync(fd);
    if (after.size !== stat.size || after.mtimeMs!==stat.mtimeMs || after.ctimeMs!==stat.ctimeMs) throw new AccessError(-32602, 'File changed during upload selection');
    if (expected && (expected.bytes !== bytes.length || expected.attachmentId !== 'sha256:'+digest(bytes))) throw new AccessError(-32602, 'Host attachment reference digest/length mismatch');
    return bytes;
  } finally { closeSync(fd); }
}
/** Current human message only. Nothing derived from remote output or a file placeholder grants authority. */
export class AttachmentAuthorization {
  constructor({ attachmentStore, workspaceOf = () => undefined } = {}) { this.attachmentStore = attachmentStore; this.workspaceOf = workspaceOf; this.pending = new Map(); this.active = new Map(); }
  async capture({ localId, message, workspace, signal }) {
    if (message?.role !== 'user' || message.source?.kind !== 'user' || !message.id) throw new AccessError(-32602, 'Current human message required for attachment selection');
    const text = message.content.filter(block=>block.type==='text').map(block=>block.text).join('\n');
    const native = message.content.filter(block=>['file','image'].includes(block.type));
    const paths = explicitPaths(text);
    if (!native.length && !paths.length) return undefined;
    if (native.length+paths.length > MAX_MESSAGE_ATTACHMENTS) throw new AccessError(-32602, 'At most five explicitly selected attachments');
    const permitted = authorization(text), items=[];
    const nativeBytes=native.reduce((sum,block)=>sum+(block.attachment?.bytes??0),0);
    if(!Number.isSafeInteger(nativeBytes)||nativeBytes>MAX_ATTACHMENT_BYTES)throw new AccessError(-32602,'Native message attachments exceed 20MiB total');
    for (const block of native) {
      if (signal?.aborted) throw signal.reason;
      const ref=block.attachment; if (!ref || !this.attachmentStore) throw new AccessError(-32602, 'Official host attachment storage unavailable');
      if (!Number.isSafeInteger(ref.bytes) || ref.bytes < 1 || ref.bytes > MAX_ATTACHMENT_BYTES) throw new AccessError(-32602, 'Native attachment exceeds selection size limit');
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
    const entry={localId,messageId:String(message.id),items,text};this.pending.set(`${localId}\0${message.id}`,entry);return entry;
  }
  item(name,data,sourceKind,permitted){return {manifest:{handle:randomBytes(32).toString('hex'),name,bytes:data.length,sha256:digest(data),sourceKind,...permitted},data};}
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
