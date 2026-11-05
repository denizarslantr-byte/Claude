import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { technicalQa, publishGate } from '../../packages/quality/qa.js';

const dir = mkdtempSync(path.join(tmpdir(), 'qa-'));
const mk = (name, v, a) => { const f = path.join(dir, name); const r = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', v, '-f', 'lavfi', '-i', a, '-t', '4', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', f]); assert.equal(r.status, 0); return f; };
const V = 'testsrc2=size=360x640:rate=30', A = 'sine=frequency=300:sample_rate=48000';

test('temiz video PASS', async () => assert.equal((await technicalQa(mk('ok.mp4', V, 'sine=frequency=300:sample_rate=48000,volume=0.3'))).verdict, 'PASS'));
test('siyah kare tespit', async () => assert.ok((await technicalQa(mk('black.mp4', 'color=c=black:s=360x640:r=30', A + ',volume=0.3'))).issues.some((i) => i.code === 'BLACK_FRAMES')));
test('donuk kare tespit', async () => assert.ok((await technicalQa(mk('freeze.mp4', 'color=c=red:s=360x640:r=30', A + ',volume=0.3'))).issues.some((i) => i.code === 'FROZEN_FRAMES')));
test('sessizlik tespit', async () => assert.ok((await technicalQa(mk('sil.mp4', V, 'anullsrc=r=48000:cl=mono'))).issues.some((i) => i.code === 'LONG_SILENCE')));
test('ses kırpılması FAIL', async () => { const r = await technicalQa(mk('clip.mp4', V, A + ',volume=8')); assert.equal(r.verdict, 'FAIL'); });
test('yayın kapısı: her ihlal ayrı engeller', () => {
  const ok = { qa: { verdict: 'PASS' }, claims: [{ id: 1, status: 'SUPPORTED', source_url: 'https://k', critical: true }], assets: [{ license_terms: 'CC0' }], approvedHash: 'h', actualHash: 'h' };
  assert.ok(publishGate(ok).allowed);
  assert.deepEqual(publishGate({ ...ok, actualHash: 'x' }).reasons, ['HASH_MISMATCH']);
  assert.deepEqual(publishGate({ ...ok, assets: [{}] }).reasons, ['LICENSE_MISSING']);
  assert.match(publishGate({ ...ok, claims: [{ id: 9, status: 'CONTRADICTED' }] }).reasons[0], /CLAIMS:9/);
  assert.ok(publishGate({ ...ok, qa: { verdict: 'FAIL' } }).reasons.includes('QA_FAIL'));
  assert.equal(publishGate({ ...ok, qa: { verdict: 'REVIEW' } }).needsHumanReview, true);
});
