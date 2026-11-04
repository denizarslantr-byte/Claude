// Render worker (mock): timeline doğrulama → ffmpeg → ffprobe QA → atomik final + sha256.
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { renameSync, createReadStream, rmSync, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';

export function validateTimeline(t) {
  const errs = [];
  if (!t || typeof t !== 'object') return ['timeline nesne olmalı'];
  if (!Array.isArray(t.scenes) || t.scenes.length === 0) errs.push('scenes boş');
  else t.scenes.forEach((s, i) => {
    if (!Number.isInteger(s.duration_ms) || s.duration_ms < 500 || s.duration_ms > 120000) errs.push(`scene ${i}: duration_ms geçersiz`);
    if (!/^#[0-9a-fA-F]{6}$/.test(s.color ?? '')) errs.push(`scene ${i}: color geçersiz`);
  });
  if (t.width !== 1080 || t.height !== 1920) errs.push('çözünürlük 1080x1920 olmalı');
  return errs;
}

const run = (cmd, args) => new Promise((resolve, reject) => {
  const p = spawn(cmd, args); let out = '', err = '';
  p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (err += d));
  p.on('error', reject); p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(`${cmd} kod ${code}: ${err.slice(-300)}`))));
});

export async function probe(file) {
  const j = JSON.parse(await run('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file]));
  const v = j.streams.find((s) => s.codec_type === 'video'); const a = j.streams.find((s) => s.codec_type === 'audio');
  return { video: v, audio: a, duration: Number(j.format.duration) };
}

/** Teknik QA kapıları (Bölüm 7.5). */
export async function qa(file, expectedSec, tolSec = 1) {
  const checks = []; let info;
  try { info = await probe(file); } catch (e) { return { pass: false, checks: [{ name: 'okunabilir', pass: false, detail: e.message.slice(0, 120) }] }; }
  const add = (name, pass, detail) => checks.push({ name, pass, detail });
  add('kodek', info.video?.codec_name === 'h264' && info.audio?.codec_name === 'aac', `${info.video?.codec_name}/${info.audio?.codec_name}`);
  add('çözünürlük', info.video?.width === 1080 && info.video?.height === 1920, `${info.video?.width}x${info.video?.height}`);
  add('süre', Math.abs(info.duration - expectedSec) <= tolSec, `${info.duration.toFixed(2)}s`);
  return { pass: checks.every((c) => c.pass), checks, info: { duration: info.duration } };
}

export const sha256File = (f) => new Promise((res, rej) => {
  const h = createHash('sha256'); createReadStream(f).on('data', (d) => h.update(d)).on('end', () => res(h.digest('hex'))).on('error', rej);
});

export async function renderMock(timeline, outFile) {
  const errs = validateTimeline(timeline);
  if (errs.length) throw Object.assign(new Error('Timeline geçersiz: ' + errs.join('; ')), { code: 'INVALID_TIMELINE' });
  mkdirSync(path.dirname(outFile), { recursive: true });
  const tmp = `${outFile}.part`;
  const total = timeline.scenes.reduce((a, s) => a + s.duration_ms, 0) / 1000;
  const args = ['-y'];
  timeline.scenes.forEach((s) => args.push('-f', 'lavfi', '-t', String(s.duration_ms / 1000), '-i', `color=c=${s.color.replace('#', '0x')}:s=1080x1920:r=30`));
  args.push('-f', 'lavfi', '-t', String(total), '-i', 'sine=frequency=220:sample_rate=48000');
  const n = timeline.scenes.length;
  args.push('-filter_complex', `${timeline.scenes.map((_, i) => `[${i}:v]`).join('')}concat=n=${n}:v=1:a=0[v]`,
    '-map', '[v]', '-map', `${n}:a`, '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', '-f', 'mp4', tmp);
  const t0 = Date.now(); const rss0 = process.memoryUsage().rss;
  try { await run('ffmpeg', args); } catch (e) { rmSync(tmp, { force: true }); throw e; }
  const report = await qa(tmp, total);
  if (!report.pass) { rmSync(tmp, { force: true }); throw Object.assign(new Error('QA başarısız'), { code: 'QA_FAIL', report }); }
  renameSync(tmp, outFile);
  return { file: outFile, sha256: await sha256File(outFile), bytes: statSync(outFile).size, render_ms: Date.now() - t0, rss_delta: process.memoryUsage().rss - rss0, qa: report };
}
