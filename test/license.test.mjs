import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
test('MIT license is declared and included without enabling npm publication', () => {
  const metadata = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
  const license = readFileSync(new URL('../LICENSE', import.meta.url), 'utf8');
  assert.equal(metadata.license, 'MIT');
  assert.equal(metadata.private, true);
  assert.ok(metadata.files.includes('LICENSE'));
  for (const newline of ['\n', '\r\n']) {
    const checked = license.replace(/\r?\n/g, newline);
    assert.match(checked, /^MIT License\r?\n\r?\nCopyright \(c\) 2026 Lafinger\r?\n/);
  }
  assert.ok(license.includes('Permission is hereby granted, free of charge'));
  assert.ok(license.includes('THE SOFTWARE IS PROVIDED "AS IS"'));
});
