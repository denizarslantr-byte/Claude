// F7b: ffmpeg tabanlı teknik QA (siyah kare, donuk kare, sessizlik, kırpılma) + yayın kapısı.
import { spawn } from 'node:child_process';
import { gateClaims } from '../providers/factcheck.js';

const ff = (args) => new Promise((res, rej) => { const p = spawn('ffmpeg', ['-hide_banner', '-nostats', ...args]); let e = ''; p.stderr.on('data', (d) => (e += d)); p.on('error', rej); p.on('close', () => res(e)); });

export async function analyze(file) {
  const log = await ff(['-i', file, '-vf', 'blackdetect=d=0.5:pix_th=0.10,freezedetect=n=-60dB:d=2', '-af', 'silencedetect=n=-45dB:d=2,volumedetect', '-f', 'null', '-']);
  const count = (re) => (log.match(re) ?? []).length;
  const maxVol = Number((log.match(/max_volume: (-?[\d.]+) dB/) ?? [])[1] ?? -99);
  return { black: count(/black_start/g), freeze: count(/freeze_start/g), silence: count(/silence_start/g), maxVolumeDb: maxVol, clipping: maxVol >= -0.1 };
}

/** Sonuç: FAIL (kırpılma), REVIEW (siyah/donuk/sessiz), PASS. */
export async function technicalQa(file) {
  const a = await analyze(file); const issues = [];
  if (a.clipping) issues.push({ level: 'FAIL', code: 'CLIPPING' });
  if (a.black) issues.push({ level: 'REVIEW', code: 'BLACK_FRAMES' });
  if (a.freeze) issues.push({ level: 'REVIEW', code: 'FROZEN_FRAMES' });
  if (a.silence) issues.push({ level: 'REVIEW', code: 'LONG_SILENCE' });
  const verdict = issues.some((i) => i.level === 'FAIL') ? 'FAIL' : issues.length ? 'REVIEW' : 'PASS';
  return { verdict, issues, metrics: a };
}

/** Yayın öncesi kapı: teknik QA + iddia kapısı + lisans + hash onayı eşleşmesi. */
export function publishGate({ qa, claims, assets, approvedHash, actualHash }) {
  const reasons = [];
  if (qa.verdict === 'FAIL') reasons.push('QA_FAIL');
  const g = gateClaims(claims); if (!g.pass) reasons.push(`CLAIMS:${g.blockers.join(',')}`);
  if (assets.some((a) => !a.license_terms)) reasons.push('LICENSE_MISSING');
  if (!approvedHash || approvedHash !== actualHash) reasons.push('HASH_MISMATCH');
  return { allowed: reasons.length === 0, reasons, needsHumanReview: qa.verdict === 'REVIEW' };
}
