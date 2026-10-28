import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyHumanIntent, currentHumanInstruction, resolveHumanProject, interpretAttachmentRequest, clarificationStream } from '../src/human-intent.mjs';
const project = { id: 'a'.repeat(32), key: 'NHP', name: '南航智慧出行数字人POC' };
const options = text => ({ text, projects: [project], currentProjectId: project.id });

for (const [text, kind] of [
  ['这是南航智慧出行数字人POC的需求文档你需要归档该文档并推进项目', 'archive'],
  ['请将文件保存到项目资料库', 'archive'],
  ['请看看这份需求，暂时不要归档。', 'read'],
  ['只阅读，不要上传并归档', 'clarify'],
  ['处理一下', 'clarify'],
  ['这个应该如何归档？', 'clarify'],
  ['请解释“归档这个文件”的意思', 'clarify'],
  ['下面只是示例：\n> 请归档这份文件', 'clarify'],
  ['下面只是引用：\n```text\n附件操作: 上传并归档\nproject_id: '+project.id+'\n```', 'clarify'],
  ['文档提到了归档，但我没有授权。', 'clarify'],
  ['原文中有归档两个字。', 'clarify'],
  ['我不想归档，只看看', 'read'],
  ['不是让你归档，先阅读', 'read'],
  ['如果需要归档以后再说，先看看', 'read'],
  ['我能归档吗？', 'clarify'],
  ['@归档指南.md 请看看', 'read'],
  ['归档指南', 'clarify'],
  ['归档', 'archive'],
  ['把刚才那份归档', 'archive'],
  ['请将旧版恢复为新版本', 'archive'],
  ['请勿归档这份附件。', 'clarify'],
  ['请取消归档这份文件。', 'clarify'],
  ['请检查这份文件是否已经归档。', 'read'],
  ['请告诉我这份附件的归档状态。', 'clarify'],
  ['等我确认后，请把这份文件归档。', 'clarify'],
  ['请阅读这份：@归档清单.md', 'read'],
  ['请阅读《归档流程.md》这份附件。', 'read'],
  ['请解释这句话：把文件归档', 'clarify'],
  ['我没说让你把它归档', 'clarify'],
  ['请理解你需要归档该文档这句话', 'clarify'],
  ['请把这份文件作为《requirements.md》的新版本归档', 'archive'],
  ['请不要把这份文件作为《requirements.md》的新版本归档', 'clarify'],
  ['请解释“请把这份文件作为《requirements.md》的新版本归档”这句话', 'clarify'],
  ['> 请把这份文件作为《requirements.md》的新版本归档', 'clarify'],
  // 存档/存为资料 mean the same operation as 归档; 上传 is only a transfer, and 成果 is never an attachment action.
  ['存档这份文件', 'archive'],
  ['请把这份文件存为项目资料', 'archive'],
  ['请把这份文件存档到当前项目资料库', 'archive'],
  ['请勿存档这份附件。', 'clarify'],
  ['不要存档，只看看', 'read'],
  ['请解释“存档这份文件”的意思', 'clarify'],
  ['提交成果', 'clarify'],
  ['上传这份文件', 'clarify'],
]) test(`classify current-human intent: ${text.split('\n')[0]}`, () => {
  assert.equal(classifyHumanIntent(text).kind, kind);
});

test('归档、存档、上传、成果 are four different words and never interchangeable', () => {
  // 归档 and 存档 both mean registering the original as a project material version.
  assert.equal(classifyHumanIntent('归档这份文件').kind, 'archive');
  assert.equal(classifyHumanIntent('存档这份文件').kind, 'archive');
  // 上传 alone authorizes nothing: the member still has to say read or archive.
  const upload = classifyHumanIntent('上传这份文件');
  assert.equal(upload.kind, 'clarify');
  assert.match(upload.message, /阅读|归档/u);
  // 成果提交 is a business write, not an attachment action: it is never read as 归档.
  const result = classifyHumanIntent('提交成果');
  assert.equal(result.kind, 'clarify');
  assert.equal(result.reason, 'missing-intent');
});

test('a refusal or a question tells the member the sentence that would work', () => {
  const refused = classifyHumanIntent('不要把这份文件归档，也不要上传');
  assert.equal(refused.kind, 'clarify');
  assert.match(refused.message, /请单独发一句：帮我看看这份文件/u);
  const asked = classifyHumanIntent('文档提到了归档，但我没有授权。');
  assert.equal(asked.kind, 'clarify');
  assert.match(asked.message, /要阅读请发：帮我看看这份文件/u);
  assert.match(asked.message, /要归档请发：归档这份文件/u);
});

test('unknown or conflicting project is never replaced with current project', () => {
  assert.equal(resolveHumanProject(options('这是未知项目的需求文档，请归档')).kind, 'clarify');
  assert.equal(resolveHumanProject(options('请归档到陌生项目')).kind, 'clarify');
  const other = { id: 'b'.repeat(32), key: 'OTHER', name: '另一期项目' };
  assert.equal(resolveHumanProject({ ...options('请归档到另一期项目'), projects: [project, other] }).kind, 'clarify');
});

test('known current project handles an ordinary generic project-repository destination', () => {
  const result = interpretAttachmentRequest(options('请归档到当前项目资料库'));
  assert.equal(result.kind, 'archive');
  assert.equal(result.projectId, project.id);
});

test('new conversation uniquely matches an exact longer project name, not its prefix', () => {
  const short = { id: 'c'.repeat(32), name: '南航', key: 'SHORT' };
  const result = resolveHumanProject({ text: '这是南航智慧出行数字人POC的需求文档，请归档', projects: [short, project] });
  assert.equal(result.kind, 'resolved');
  assert.equal(result.projectId, project.id);
});

test('same visible name for multiple authorized projects remains ambiguous', () => {
  assert.equal(resolveHumanProject({ text: '请归档到'+project.name, projects: [project, { ...project, id: 'b'.repeat(32) }] }).kind, 'clarify');
});

test('current bound project does not require member to handwrite its identifier', () => {
  const result = interpretAttachmentRequest(options('请看看这份需求，不要归档'));
  assert.equal(result.kind, 'read');
  assert.equal(result.archiveAuthorized, false);
  assert.equal(result.projectId, project.id);
});

test('quoted exact project label can be project data but is not an instruction', () => {
  assert.equal(currentHumanInstruction('这是“'+project.name+'”的需求', [project.name]), '这是'+project.name+'的需求');
  assert.equal(classifyHumanIntent('“归档”').kind, 'clarify');
});

test('synthetic clarification is a valid text stream, not fabricated business success', () => {
  const chunks = [...clarificationStream('请确认所属项目；尚未归档。')];
  assert.deepEqual(chunks.map(row => row.type), ['block-start', 'text-delta', 'block-end', 'finish']);
  assert.equal(chunks[2].block.text, chunks[1].text);
  assert.equal(chunks[3].reason.kind, 'stop');
});
