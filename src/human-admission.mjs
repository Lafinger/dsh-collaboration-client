import { classifyHumanIntent, currentHumanInstruction, resolveHumanProject } from './human-intent.mjs';
import { requireHumanAuthorizationCapability } from './human-authorization.mjs';
import { requireAttachmentCapability } from './attachment-protocol.mjs';
import { readableOperationResults } from './human-results.mjs';

const clarify = message => ({ clarification: message });
const eventKey = session => {
  const event = session?.snapshotEvents?.().findLast(value => value.type === 'model/selection');
  return event ? JSON.stringify([event.seq, event.time, event.data]) : null;
};

// Names are data: only the current effective command can make one its source.
// Book-title boundaries are retained with a collision-free local marker; quotes,
// fences and blockquotes are still removed by the shared human-text sanitizer.
function sourceNameRole(text, name, kind = 'archive') {
  const escape = value => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&');
  const separator = '[，,。！？!?；;\\n]';
  const verb = kind === 'read' ? '(?:阅读|读取|看看|查看|看)' : '归档';
  const head = label => `(?:^|${separator})\\s*(?:(?:请|帮我|麻烦|先|你需要)\\s*){0,4}(?:(?:把|将)\\s*${label}\\s*${verb}|${verb}\\s*${label})`;
  const plain = currentHumanInstruction(text);
  const active = currentHumanInstruction(text, [name]);
  const exact = new RegExp(head(escape(name)) + `\\s*(?:吧)?\\s*(?=$|${separator})`, 'u').test(plain);
  let quoted = false;
  if (text.includes(`《${name}》`)) {
    let marker = '__explicit_source_name__';
    while (text.includes(marker)) marker += '_';
    const view = currentHumanInstruction(text.replaceAll(`《${name}》`, ` ${marker} `));
    quoted = new RegExp(head(marker) + `\\s*(?:吧)?\\s*(?=$|${separator}|并)`, 'u').test(view);
  }
  const destination = new RegExp(`作为\\s*${escape(name)}\\s*的?新版本\\s*归档`, 'u').test(active);
  const reference = new RegExp(`(?:^|${separator})\\s*(?:仅供|仅作|只作)?(?:参考|参照|引用)\\s*${escape(name)}(?:$|${separator}|\\s)`, 'u').test(active);
  return { source: exact || quoted, uncertain: active.includes(name) && !exact && !quoted && !destination && !reference };
}

// Reuse the classifier's existing relative-object grammar to constrain borrowing
// a prior source. This extracts names, not permission, and never rewrites wire text.
function sourceDirective(text, kind = 'archive') {
  const relative = /^(?:这(?:份|个)?(?:文件|文档|附件|资料)?|那(?:份|个)?(?:文件|文档|附件|资料)?|该(?:文件|文档|附件|资料)?|此(?:文件|文档|附件|资料)?|刚才那份|刚才(?:的)?(?:文件|文档|附件|资料)|之前那份|上述(?:文件|文档|附件|资料)|所选(?:文件|文档|附件|资料)|文件|文档|附件|资料|它)$/u;
  const prefix = '(?:(?:请|麻烦|帮我|替我|劳驾|烦请|你需要|你要|需要你|希望你|务必|只|先|再|马上|直接|现在)\\s*){0,4}';
  const verb = kind === 'read' ? '(?:看看|看一下|读一读|阅读|分析|检查|审阅|解读|梳理|整理需求)' : '归档';
  const names = new Set(); let current = false;
  for (const match of text.matchAll(/《([^》]+)》/gu)) {
    const role = sourceNameRole(text, match[1], kind);
    if (role.source || role.uncertain) names.add(match[1]);
  }
  for (const clause of currentHumanInstruction(text).split(/[，,。！？!?；;\n]+/u).map(value => value.trim()).filter(Boolean)) {
    const main = clause.split(/并(?:且)?/u)[0].trim();
    const direct = main.match(new RegExp('^' + prefix + verb + '\\s*(.*?)\\s*(?:吧)?$', 'u'));
    const inverse = main.match(new RegExp('^' + prefix + '(?:把|将)\\s*(.*?)\\s*' + verb + '(?:吧)?$', 'u'));
    const operand = (direct?.[1] ?? inverse?.[1]);
    if (operand !== undefined) {
      const source = operand.split(/作为/u)[0].trim();
      if (!source || relative.test(source)) current = true;
      else names.add(source);
    } else if (kind === 'archive' && /^这是/u.test(clause) && /你需要(?:上传并)?归档(?:该|这)/u.test(clause) && classifyHumanIntent(clause).kind === 'archive') current = true;
  }
  return { names, current };
}

/** Runs only inside the chosen collaboration route's reserved llm/stream hook. */
export async function admitHumanTurn({ ctx, entry, client, options, message }) {
  const localId = String(options.sessionId);
  const text = message.content.filter(block => block.type === 'text').map(block => block.text).join('\n');
  const { explicitPaths } = await import('./attachments.mjs');
  const selectedCount = message.content.filter(block => ['file', 'image'].includes(block.type)).length + explicitPaths(text).length;
  const intent = classifyHumanIntent(text);
  const instruction = currentHumanInstruction(text);
  // A new selected object is not an answer to the previous object's question.
  const confirmationWord = /^(?:确认|确认恢复|确认将旧版恢复为新版本)\s*$/u;
  const confirmation = !selectedCount && confirmationWord.test(text.trim());
  client.recordHumanContext(localId, { messageId: String(message.id), confirmation });
  if (!selectedCount && confirmationWord.test(instruction) && !confirmation) return clarify('确认中带有额外对象或引用，不能作为此前资料的裸确认。请重新明确资料名称，核对后再确认；尚未恢复。');
  const context = () => ({ account: client.account, serviceId: client.serviceId, projectId: client.selectedProject(localId), workspace: ctx.get('sessions')?.get(localId)?.header?.cwd });
  if (selectedCount && intent.kind === 'clarify') {
    client.attachments.rememberUnresolved(localId, message, context());
    return clarify(intent.message);
  }
  const pendingSelection = !selectedCount && ['archive', 'read'].includes(intent.kind) ? client.attachments.unresolvedSelection(localId, context()) : undefined;
  const count = selectedCount || (pendingSelection ? pendingSelection.native.length + pendingSelection.paths.length : 0);
  if (count > 1 && (!/全部|所有|这些|这几份|这两份|都/u.test(instruction) || /只|仅|不要|不想|不是|其余|其他/u.test(instruction))) return clarify('多份附件的处理范围还不明确。请说明哪些需要归档，或分次处理；尚未读取附件。');
  const current = () => {
    client.assertCurrent();
    if (entry.client !== client || !entry.currentValid()) throw new Error('活动成员已改变；本次未发送业务请求。');
  };
  current();
  await client.restoreLogin?.();
  current();
  const sessions = ctx.get('sessions');
  const session = sessions?.get(localId);
  const loggedRoute = eventKey(session);
  const before = client.projectAdmissionState(localId);
  if (before.pending || before.busy || before.opening) return clarify('当前会话已有操作或项目选择尚未确认，请先核对；本次未发送业务。');
  const login = client.login;
  const projects = await client.projects();
  current();
  if (client.login !== login || JSON.stringify(client.projectAdmissionState(localId)) !== JSON.stringify(before) || sessions?.get(localId) !== session || eventKey(session) !== loggedRoute) return clarify('查询期间成员或会话归属发生变化，请重新明确操作；本次未读取附件。');
  if (!Array.isArray(projects)) return clarify('未能核实你的授权项目，请稍后重新查询；本次未处理附件。');
  requireHumanAuthorizationCapability(client.humanAuthorizationCapability);
  if (count) requireAttachmentCapability(client.attachmentCapability);
  if (before.mapped && !before.projectId) return clarify('当前会话的项目归属需要核对，请重新打开项目菜单；不会自动改绑。');
  const project = resolveHumanProject({ text, projects, currentProjectId: before.projectId });
  if (project.kind === 'clarify') return clarify(project.message);
  if (!before.projectId) {
    if (!session || session.header?.origin === 'subagent' || typeof sessions?.flush !== 'function') return clarify('当前会话缺少可核实的项目保存能力，请先通过项目菜单选择项目。');
    current();
    if (JSON.stringify(client.projectAdmissionState(localId)) !== JSON.stringify(before)) return clarify('当前会话状态已改变，请重新确认项目。');
    await client.commitProjectSelection(localId, project.projectId, session,
      { provider: options.provider, model: options.model }, value => sessions.flush(value));
    current();
  }
  if (pendingSelection && client.attachments.unresolvedSelection(localId, context()) !== pendingSelection) return clarify('此前附件选择的成员、项目或工作区已改变，请重新选择原附件。');
  if (pendingSelection) {
    const receipts = await client.attachmentReceipts(localId);
    current();
    if (client.selectedProject(localId) !== project.projectId || client.attachments.unresolvedSelection(localId, context()) !== pendingSelection) return clarify('查询期间附件或项目上下文已改变，本次未读取附件。');
    const pendingNames = new Set([...pendingSelection.native.map(block => block.attachment?.name), ...pendingSelection.paths.map(path => path.split(/[\\/]/u).at(-1))].filter(name => typeof name === 'string' && name));
    const directive = sourceDirective(text, intent.kind);
    const names = new Set([...pendingNames, ...receipts.map(receipt => receipt.name), ...directive.names]);
    const conflict = [...directive.names].some(name => !pendingNames.has(name)) || [...names].some(name => { const role = sourceNameRole(text, name, intent.kind); return role.uncertain || role.source && !pendingNames.has(name); });
    if (!conflict && !directive.current && ![...directive.names].some(name => pendingNames.has(name))) return clarify('本次所指原件还不够明确。请明确资料名，或说明是否处理此前选择的附件；尚未读取或归档。');
    if (conflict) {
      // Revoke only ambiguous ephemeral pointers, never delete history or files.
      client.attachments.unresolved.delete(localId); client.lastAttachmentRequests.delete(localId);
      return clarify('待明确附件与本次点名的资料范围不一致，已放下未决选择。请明确资料名称或重新选择所指原件；本次未读取新附件、未归档。');
    }
  }
  const receiptScopes = [];
  if (!count && (intent.kind === 'archive' || confirmation)) {
    const receipts = await client.attachmentReceipts(localId);
    current();
    if (client.selectedProject(localId) !== project.projectId) return clarify('会话项目已改变，本次没有归档。');
    let eligible = receipts.filter(receipt => receipt.projectId === project.projectId);
    const directive = sourceDirective(text);
    if (!confirmation && [...directive.names].some(name => !eligible.some(receipt => receipt.name === name))) {
      client.lastAttachmentRequests.delete(localId);
      return clarify('没有找到本次点名资料的可用原件。请核对资料名称或重新选择所指文件；不会改归档另一份旧资料。');
    }
    const restoreContext = client.restoreContexts.get(localId);
    if (confirmation && restoreContext?.allowed !== true) return clarify('当前没有可核实的恢复确认上下文。请明确资料名称，核对旧版与当前版后再确认；尚未恢复。');
    if (confirmation) {
      eligible = eligible.filter(receipt => receipt.pendingRestore);
    }
    const roles = eligible.map(receipt => ({ receipt, role: sourceNameRole(text, receipt.name) }));
    if (!confirmation && roles.some(({ role }) => role.uncertain)) return clarify('当前提到的资料名称与归档源对象还不够明确。请明确要归档哪份资料；尚未归档。');
    const named = roles.filter(({ role }) => role.source).map(({ receipt }) => receipt);
    const sourceRequest = client.lastAttachmentRequests.get(localId);
    // A unique server receipt is not proof of the most recent local selection.
    // On reconstruction, require an explicit name or a still-live source group.
    if (!confirmation && !named.length && (!sourceRequest || !directive.current)) return clarify('当前缺少可核实的附件来源上下文。请明确资料名称，或重新选择需要归档的原件；尚未归档。');
    const candidates = named.length ? named : !confirmation && sourceRequest ? eligible.filter(receipt => receipt.requestId === sourceRequest) : eligible;
    if (candidates.length !== 1) return clarify(confirmation
      ? candidates.length ? '有多份旧版本恢复待确认，请明确资料名称；尚未恢复。' : '没有可核实的旧版本恢复待确认项。请说明要确认哪项操作。'
      : candidates.length ? '有多份附件可供选择，请明确说出要归档的资料名称；尚未归档。' : '没有找到这段会话中可用的原附件，请重新附上需要归档的文件。');
    const receipt = candidates[0];
    if (confirmation && (restoreContext?.sourceRequestId && receipt.requestId !== restoreContext.sourceRequestId || restoreContext?.receiptIds && !restoreContext.receiptIds.includes(receipt.receiptId))) return clarify('可用恢复提议不属于刚才明确的资料，请重新说明要恢复哪份资料。');
    // An explicit current source, not a server-unique fallback, may hand off
    // the existing reference group to this real receipt's original request.
    if (named.length) client.lastAttachmentRequests.set(localId, receipt.requestId);
    if (receipt.pendingRestore && !confirmation && intent.reason !== 'explicit-current-human-restore-as-new-version') {
      const question = readableOperationResults([{ kind: 'restore_confirmation_required', name: receipt.name, ...receipt.pendingRestore }])[0];
      if (!question) return clarify('未能核实所指资料的版本，尚未恢复。');
      client.expectRestoreConfirmation(localId, { messageId: String(message.id), receiptIds: [receipt.receiptId] });
      return clarify(question);
    }
    if (receipt.archived && !receipt.pendingRestore) return clarify(`《${receipt.name}》此前已归档${receipt.version ? `为第${receipt.version}版` : ''}，本轮没有新增版本。`);
    receiptScopes.push({ receiptId: receipt.receiptId, action: 'archive', ...(receipt.pendingRestore && (confirmation || intent.reason === 'explicit-current-human-restore-as-new-version') ? receipt.pendingRestore : {}) });
  }
  return { admission: { projectId: project.projectId, kind: count ? intent.kind : 'none', receiptScopes, ...(pendingSelection ? { pendingSelection } : {}) } };
}
