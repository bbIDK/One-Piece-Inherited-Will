// `npm test`: every island, NPC, quest and dialogue tree must pass the
// content validator (it generates the whole world in Node).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

test('content validates with zero errors', () => {
  let out = '';
  try {
    out = execFileSync(process.execPath, [join(root, 'tools/validate.mjs')], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e) {
    assert.fail(`validator reported errors:\n${e.stdout}\n${e.stderr}`);
  }
  assert.match(out, /0 error\(s\)/);
});
