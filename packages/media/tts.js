// TTS: mock sağlayıcı (ffmpeg sine), gerçek süre ffprobe ile ölçülür; kelime hizalama + SRT/güvenli alan.
import { spawn } from 'node:child_process';
import { normalizeTr } from './tr.js';

const run = (cmd, args) => new Promise((res, rej) => { const p = spawn(cmd, args); let o = '', e = ''; p.stdout.on('data', (d) => (o += d)); p.stderr.on('data', (d) => (e += d)); p.on('error', rej); p.on('close', (c) => (c ? rej(new Error(e.slice(-200))) : res(o))); });
export const measureDuration = async (f) => Number((await run('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f])).trim());

export async function synthMock(text, outFile, dict = {}) {
  const spoken = normalizeTr(text, dict);
  const words = spoken.split(/\s+/).filter(Boolean);
  const sec = Math.max(0.8, words.length * 0.35);
  await run('ffmpeg', ['-y', '-f', 'lavfi', '-t', String(sec), '-i', 'sine=frequency=180:sample_rate=48000', '-c:a', 'libmp3lame', outFile]);
  return { spoken, words, duration: await measureDuration(outFile) };
}

/** Kelime zamanları: ölçülen gerçek süre karakter uzunluğuna orantılı dağıtılır (sağlayıcı zamanı yoksa yedek). */
export function alignWords(words, durationSec) {
  const total = words.reduce((a, w) => a + w.length + 1, 0); let t = 0;
  return words.map((w) => { const d = ((w.length + 1) / total) * durationSec; const r = { word: w, start: Number(t.toFixed(3)), end: Number((t + d).toFixed(3)) }; t += d; return r; });
}
const ts = (s) => { const ms = Math.round(s * 1000); const p = (n, l = 2) => String(n).padStart(l, '0'); return `${p(Math.floor(ms / 3600000))}:${p(Math.floor(ms / 60000) % 60)}:${p(Math.floor(ms / 1000) % 60)},${p(ms % 1000, 3)}`; };
/** SRT: satır başı ≤ maxChars, en çok 2 satır; taşan cue bölünür. */
export function toSrt(aligned, { maxChars = 28, maxWordsPerCue = 6 } = {}) {
  const cues = []; let cur = [];
  const flush = () => { if (cur.length) { cues.push(cur); cur = []; } };
  for (const w of aligned) { const len = [...cur, w].map((x) => x.word).join(' ').length; if (cur.length >= maxWordsPerCue || len > maxChars * 2) flush(); cur.push(w); }
  flush();
  return cues.map((c, i) => {
    const text = c.map((x) => x.word).join(' '); const mid = Math.ceil(c.length / 2);
    const two = text.length > maxChars ? c.slice(0, mid).map((x) => x.word).join(' ') + '\n' + c.slice(mid).map((x) => x.word).join(' ') : text;
    return `${i + 1}\n${ts(c[0].start)} --> ${ts(c[c.length - 1].end)}\n${two}\n`;
  }).join('\n');
}
export const srtOverflow = (srt, maxChars = 28) => srt.split('\n').filter((l) => !/^\d+$/.test(l) && !l.includes('-->') && l).some((l) => l.length > maxChars + 6);
