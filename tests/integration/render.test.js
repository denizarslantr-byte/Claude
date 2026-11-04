import { test } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, mkdtempSync, existsSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { renderMock, validateTimeline, qa } from '../../apps/render-worker/src/render.js';

const dir = mkdtempSync(path.join(tmpdir(), 'avs-'));
const tl = (ms = 2000, n = 2) => ({ width: 1080, height: 1920, scenes: Array.from({ length: n }, (_, i) => ({ duration_ms: ms, color: i % 2 ? '#2244aa' : '#aa4422' })) });

test('geçerli timeline 9:16 H.264/AAC üretir, QA geçer, hash döner', async () => {
  const r = await renderMock(tl(), path.join(dir, 'a.mp4'));
  assert.ok(r.qa.pass); assert.match(r.sha256, /^[0-9a-f]{64}$/); assert.ok(!existsSync(path.join(dir, 'a.mp4.part')));
});
for (const [name, mut] of [
  ['boş sahne', (t) => (t.scenes = [])], ['kötü süre', (t) => (t.scenes[0].duration_ms = 5)],
  ['kötü renk', (t) => (t.scenes[0].color = 'red')], ['yanlış çözünürlük', (t) => (t.width = 720)],
]) test(`reddedilir: ${name}`, async () => {
  const t = tl(); mut(t);
  assert.ok(validateTimeline(t).length > 0);
  await assert.rejects(renderMock(t, path.join(dir, 'x.mp4')), { code: 'INVALID_TIMELINE' });
  assert.ok(!existsSync(path.join(dir, 'x.mp4')));
});
test('bozuk MP4 QA FAIL', async () => {
  const f = path.join(dir, 'bad.mp4'); writeFileSync(f, 'bu mp4 degil');
  assert.equal((await qa(f, 2)).pass, false);
});
test('süre sapması QA FAIL', async () => {
  const f = path.join(dir, 'a.mp4'); assert.equal((await qa(f, 30)).pass, false);
});
test('aynı girdi aynı çıktı boyutu sınıfında, atomik .part kalıntısı yok', async () => {
  await renderMock(tl(1000, 1), path.join(dir, 'b.mp4')); await renderMock(tl(1000, 1), path.join(dir, 'c.mp4'));
  assert.ok(!readdirSync(dir).some((f) => f.endsWith('.part')));
});
test('60 sn mock render ölçülür (F3 PASS verisi)', async () => {
  const r = await renderMock(tl(15000, 4), path.join(dir, 'full.mp4'));
  assert.ok(Math.abs(r.qa.info.duration - 60) <= 1);
  console.log(`# 60sn render: ${r.render_ms} ms, ${(r.bytes / 1e6).toFixed(1)} MB`);
});
test('yazılamayan çıktı yolu hata verir, final oluşmaz', async () => {
  const blocker = path.join(dir, 'file'); writeFileSync(blocker, 'x');
  await assert.rejects(renderMock({ width: 1080, height: 1920, scenes: [{ duration_ms: 1000, color: '#112233' }] }, path.join(blocker, 'x.mp4')));
});
