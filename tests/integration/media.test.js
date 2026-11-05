import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync, existsSync, readFileSync, copyFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { normalizeTr, numToWords } from '../../packages/media/tr.js';
import { synthMock, alignWords, toSrt, srtOverflow, measureDuration } from '../../packages/media/tts.js';
import { importInbox } from '../../packages/media/importer.js';
import { openStudio } from '../../apps/control-api/src/core.js';

const dir = mkdtempSync(path.join(tmpdir(), 'media-'));
const pack = JSON.parse(readFileSync('config/tts-test-pack.json', 'utf8')); const dict = JSON.parse(readFileSync('config/pronunciation.json', 'utf8'));

test('40 cümlelik paket, rakam kalmaz', () => {
  assert.equal(pack.length, 40);
  for (const s of pack) assert.ok(!/\d/.test(normalizeTr(s, dict)), s);
});
test('sayı okunuşları', () => {
  assert.equal(numToWords(1923), 'bin dokuz yüz yirmi üç'); assert.equal(numToWords(1250), 'bin iki yüz elli');
  assert.equal(normalizeTr('%17,5'), 'yüzde on yedi virgül beş'); assert.equal(normalizeTr('3,14'), 'üç virgül bir dört');
  assert.equal(normalizeTr('1.250 TL'), 'bin iki yüz elli lira'); assert.equal(normalizeTr('TBMM', dict), 'te be em em');
});
test('mock TTS: gerçek süre ölçülür, hizalama süreyi kapsar', async () => {
  const r = await synthMock(pack[0], path.join(dir, 'a.mp3'), dict);
  assert.ok(r.duration > 1); const al = alignWords(r.words, r.duration);
  assert.equal(al.length, r.words.length); assert.ok(Math.abs(al.at(-1).end - r.duration) < 0.01);
  assert.ok(al.every((w, i) => i === 0 || w.start >= al[i - 1].end - 0.002));
});
test('SRT: Türkçe karakter korunur, taşma yok', () => {
  const words = 'Şu çok uzun cümle öğrencilerin güzel yağmurlu İstanbul gecesinde ığdır'.split(' ');
  const srt = toSrt(alignWords(words, 6)); assert.match(srt, /İstanbul/); assert.ok(!srtOverflow(srt)); assert.match(srt, /00:00:00,000 --> /);
});
function mkVideo(f, w, h) { spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', `color=c=blue:s=${w}x${h}:r=30:d=1`, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', f]); }
test('Flow importer: geçerli, yanlış çözünürlük, bozuk, yanlış sahne, lisanssız', async () => {
  const s = openStudio(':memory:', { workspaceRoot: dir }); const p = s.createProject({ title: 'T' }, 'k');
  const inbox = path.join(dir, 'inbox'); mkdirSync(inbox);
  mkVideo(path.join(inbox, 'scene_s1__ok.mp4'), 1080, 1920); mkVideo(path.join(inbox, 'scene_s2__wide.mp4'), 1920, 1080);
  writeFileSync(path.join(inbox, 'scene_s3__bad.mp4'), 'bozuk'); mkVideo(path.join(inbox, 'scene_zz__x.mp4'), 1080, 1920);
  const res = await importInbox(s, p.id, inbox, { sceneIds: ['s1', 's2', 's3'], licenseTerms: 'Flow kendi üretim', flowCredits: 20, waitMs: 50 });
  const by = Object.fromEntries(res.map((r) => [r.name, r]));
  assert.equal(by['scene_s1__ok.mp4'].status, 'IMPORTED'); assert.equal(by['scene_s2__wide.mp4'].status, 'REVIEW_REQUIRED');
  assert.equal(by['scene_s3__bad.mp4'].reason, 'CORRUPT'); assert.equal(by['scene_zz__x.mp4'].reason, 'SCENE_MISMATCH');
  assert.ok(existsSync(path.join(inbox, '_rejected', 'scene_zz__x.mp4')));
  assert.equal(s.db.prepare("SELECT COUNT(*) c FROM assets WHERE license_terms IS NOT NULL").get().c, 2);
  assert.equal(s.db.prepare("SELECT SUM(flow_credits) c FROM ledger").get().c, 40);
  const nl = path.join(dir, 'in2'); mkdirSync(nl); mkVideo(path.join(nl, 'scene_s1__a.mp4'), 1080, 1920);
  assert.equal((await importInbox(s, p.id, nl, { sceneIds: ['s1'], licenseTerms: '', waitMs: 50 }))[0].reason, 'LICENSE_MISSING');
});
test('yarım (büyüyen) dosya reddedilir', async () => {
  const s = openStudio(':memory:', { workspaceRoot: dir }); const p = s.createProject({ title: 'T' }, 'k2');
  const inbox = path.join(dir, 'in3'); mkdirSync(inbox); const f = path.join(inbox, 'scene_s1__grow.mp4'); writeFileSync(f, 'a');
  const t = setInterval(() => writeFileSync(f, 'a'.repeat(Math.random() * 1e5 + 1)), 5);
  const r = await importInbox(s, p.id, inbox, { sceneIds: ['s1'], licenseTerms: 'x', waitMs: 100 }); clearInterval(t);
  assert.equal(r[0].reason, 'INCOMPLETE');
});
