import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
test('client package targets installed DSH 0.2.0-rc.2, not the rejected 0.1.5 runtime', () => {
  assert.equal(metadata.peerDependencies['@deepseek-ai/dsh-llm'], '0.2.0-rc.2');
  assert.equal(metadata.peerDependencies['@deepseek-ai/dsh-session'], '0.2.0-rc.2');
  assert.equal(metadata.peerDependencies['@deepseek-ai/cordis'], '4.0.4');
  assert.equal(metadata.peerDependencies['@deepseek-ai/schemastery'], '3.18.4');
  assert.equal(metadata.version, '0.1.2');
});
