import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { repository } from '../scripts/release-policy.mjs';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const metadata = JSON.parse(read('package.json'));
const base = `github:${repository}`;
const expected = `${base}#v${metadata.version}`;
const SPEC = new RegExp(`github:${repository.replace('/', '\\/')}#(v[0-9A-Za-z.-]+)`, 'g');
const specsIn = text => [...new Set([...text.matchAll(SPEC)].map(match => match[0]))];

/** The install instructions a member reads, cut out of README's own section. */
function installSection(text) {
  const header = '## 从 GitHub 安装';
  const start = text.indexOf(header);
  assert.ok(start >= 0, 'README must keep a 从 GitHub 安装 section');
  const rest = text.slice(start + header.length);
  const end = rest.indexOf('\n## ');
  return end < 0 ? rest : rest.slice(0, end);
}

test('the install section pins the fixed source to the package version so it never goes stale', () => {
  const section = installSection(read('README.md'));
  assert.ok(section.includes(base), 'The untagged default-branch source must stay documented');
  assert.deepEqual(specsIn(section), [expected], 'The fixed install source is stale or unknown');
});

test('RELEASE.md documents the same fixed source and keeps the tag form as the recommended one', () => {
  const text = read('docs/RELEASE.md');
  assert.ok(text.includes(base), 'RELEASE.md must show the untagged default-branch form');
  assert.deepEqual(specsIn(text), [expected], 'RELEASE.md pins a stale or unknown install source');
});

test('the current release note states the exact install source a member types', () => {
  const path = `docs/RELEASE-${metadata.version}.md`;
  assert.ok(existsSync(new URL('../' + path, import.meta.url)),
    `Each release needs ${path} so the install source is stated, not inferred from CI`);
  const note = read(path);
  assert.ok(note.includes(expected), `${path} must contain ${expected}`);
  assert.deepEqual(specsIn(note), [expected], `${path} pins a stale or unknown install source`);
});
