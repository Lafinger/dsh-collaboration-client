import { AccessError } from './protocol.mjs';

const label = value => String(value).replace(/[\u0000-\u001f\u007f]/gu, ' ').replace(/[\\`*_[\]{}()<>#|]/gu, character => '\\' + character).slice(0, 200);
export function readableOperationResults(results) {
  if (!Array.isArray(results)) return [];
  return results.slice(0, 10).flatMap(result => {
    if (!result || !['attachment_transfer', 'material_archive', 'restore_confirmation_required'].includes(result.kind) || typeof result.name !== 'string' || !result.name.trim()) return [];
    const name = `《${label(result.name)}》`;
    if (result.kind === 'attachment_transfer') return [`已校验并接收${name}原件。`];
    if (result.kind === 'restore_confirmation_required') {
      const old = Number.isSafeInteger(result.restoreVersion) && result.restoreVersion > 0 ? `第${result.restoreVersion}版` : '版本';
      const current = Number.isSafeInteger(result.expectedLatestVersion) && result.expectedLatestVersion > 0 ? `，核对时当前为第${result.expectedLatestVersion}版` : '';
      return [`${name}与历史${old}内容相同${current}。尚未恢复，要将旧版恢复为新版本吗？`];
    }
    const version = Number.isSafeInteger(result.version) && result.version > 0 ? `第${result.version}版` : '';
    if (result.already_archived === true) return [`${name}此前已归档${version ? `为${version}` : ''}，本轮没有新增版本。`];
    if (result.deduplicated === true) return [`${name}内容未变，沿用${version || '现有归档版本'}。`];
    return [`${name}已归档${version ? `为${version}` : ''}。`];
  });
}

/** The outcome is computed locally from negotiated v2 and a matching request proof. */
export class HumanSubmissionError extends AccessError {
  constructor(error, { outcome, operationResults = [] }) {
    const facts = readableOperationResults(operationResults);
    const status = outcome === 'not_started'
      ? '服务已明确拒绝本次业务请求，尚未开始执行。没有自动重试，请核对项目或附件后再明确操作。'
      : '本次剩余业务结果尚未确认，我不会自动重试。可先只读核对项目资料或进度，再决定下一步。';
    super(Number.isInteger(error?.code) ? error.code : -32001, [...facts, status].join('\n'), error?.data);
    this.outcome = outcome; this.cause = error;
  }
}
