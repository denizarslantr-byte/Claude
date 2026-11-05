import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { cleanRerun, decide, HARD_DENY, Runner, killSwitch } from '../../packages/ops/autonomy.js';

const dir = mkdtempSync(path.join(tmpdir(), 'auto-')); const q = path.join(dir, 'Q.md'); const allowed = ['mock_provider_calls', 'paid_api_calls_within_budget'];

test('AUTO-01 kapı doğrulayıcı temiz klasörde koşar (PASS/FAIL)', () => {
  const r = mkdtempSync(path.join(tmpdir(), 'repo-')); execSync('git init -q && git config user.email a@b.c && git config user.name t', { cwd: r });
  writeFileSync(path.join(r, 'package.json'), '{"scripts":{"test":"node -e \\"process.exit(0)\\""}}'); execSync('git add -A && git commit -qm x', { cwd: r });
  assert.equal(cleanRerun(r).status, 'PASS');
  writeFileSync(path.join(r, 'package.json'), '{"scripts":{"test":"node -e \\"process.exit(1)\\""}}'); execSync('git commit -qam y', { cwd: r });
  assert.equal(cleanRerun(r).status, 'FAIL');
});
test('AUTO-02 kill switch STOP dosyası', () => { const f = path.join(dir, 'STOP'); assert.equal(killSwitch(f), false); writeFileSync(f, ''); assert.equal(killSwitch(f), true); });
test('AUTO-03 hard_deny ve zarf dışı iş kuyruğa yazılır, durdurmaz', () => {
  for (const a of HARD_DENY) assert.equal(decide(a, { allowed: [...allowed, a], queueFile: q }), 'DENIED_QUEUED'); // ön yetkiyle bile
  assert.equal(decide('format_disk', { allowed, queueFile: q }), 'DEFERRED'); assert.ok(readFileSync(q, 'utf8').split('\n').length > 10);
});
test('AUTO-04 bütçe 0 → ücretli adım SKIPPED, bütçe > 0 → izinli', () => {
  assert.equal(decide('paid_api_calls_within_budget', { allowed, paid: true, budgetUsd: 0 }), 'SKIPPED'); assert.equal(decide('paid_api_calls_within_budget', { allowed, paid: true, budgetUsd: 1 }), 'ALLOWED');
});
test('AUTO-05 görev 3 denemede BLOCKED, sonrakine geçilir', async () => {
  const r = new Runner(); let n = 0; assert.equal(await r.attempt('a', () => { n++; throw new Error('x'); }), 'BLOCKED'); assert.equal(n, 3);
  assert.equal(await r.attempt('b', () => {}), 'DONE');
});
test('AUTO-06 art arda 5 başarısızlıkta döngü durur', async () => {
  const r = new Runner(); await r.attempt('a', () => { throw new Error(); }); assert.equal(await r.attempt('b', () => { throw new Error(); }), 'HALTED'); assert.equal(await r.attempt('c', () => {}), 'HALTED');
});
test('AUTO-07 geri alma: faz etiketine dönülebilir', () => {
  const r = mkdtempSync(path.join(tmpdir(), 'rb-')); const sh = (c) => execSync(c, { cwd: r, encoding: 'utf8' });
  sh('git init -q && git config user.email a@b.c && git config user.name t'); writeFileSync(path.join(r, 'f'), '1'); sh('git add -A && git commit -qm 1 && git tag phase-F00-pass');
  writeFileSync(path.join(r, 'f'), '2'); sh('git commit -qam 2 && git reset -q --hard phase-F00-pass'); assert.equal(readFileSync(path.join(r, 'f'), 'utf8'), '1');
});
