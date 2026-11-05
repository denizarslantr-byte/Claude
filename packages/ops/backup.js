// F7a: yedek/restore, açılışta kurtarma, disk devre kesici, kill switch.
import { copyFileSync, existsSync, mkdirSync, statSync, statfsSync, readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

const sha = (f) => createHash('sha256').update(readFileSync(f)).digest('hex');

/** Tutarlı yedek (VACUUM INTO) + bütünlük kontrolü + hash. Hedef tutarsa şifresiz kopya dış hedefe. */
export function backupDb(db, destDir, { externalDir } = {}) {
  mkdirSync(destDir, { recursive: true });
  const name = `studio-${new Date().toISOString().replace(/[:.]/g, '-')}.sqlite`;
  const file = path.join(destDir, name);
  db.exec(`VACUUM INTO '${file.replace(/'/g, "''")}'`);
  const chk = new DatabaseSync(file, { readOnly: true });
  const integrity = chk.prepare('PRAGMA integrity_check').get().integrity_check; chk.close();
  if (integrity !== 'ok') throw new Error('Yedek bütünlük hatası');
  const res = { file, sha256: sha(file), external: null };
  if (externalDir) {
    if (!existsSync(externalDir)) res.external = 'UNAVAILABLE';
    else { const ext = path.join(externalDir, name); copyFileSync(file, ext); res.external = sha(ext) === res.sha256 ? ext : 'MISMATCH'; }
  }
  return res;
}

/** Restore: hash doğrula, hedefe kopyala (mevcut dosyanın üstüne yazmadan önce .bak). */
export function restoreDb(backupFile, expectedSha, targetFile) {
  if (sha(backupFile) !== expectedSha) throw new Error('Yedek hash uyuşmuyor');
  if (existsSync(targetFile)) copyFileSync(targetFile, targetFile + '.bak');
  copyFileSync(backupFile, targetFile);
  return targetFile;
}

/** Servis yeniden başlarken yarım kalan ücretli işler UNKNOWN olur (kör tekrar yok). */
export function recoverOnStartup(db) {
  const r = db.prepare("UPDATE jobs SET state='UNKNOWN', error_code='RESTART' WHERE state IN ('SUBMITTED','PROCESSING')").run();
  db.prepare("INSERT INTO audit_log(actor,action,detail,at) VALUES('system','startup.recover',?,?)").run(JSON.stringify({ unknown: r.changes }), new Date().toISOString());
  return { markedUnknown: Number(r.changes) };
}

export function diskGuard(dir, stopPct = 90) {
  const s = statfsSync(dir); const used = (1 - s.bavail / s.blocks) * 100;
  return { usedPct: Number(used.toFixed(1)), stop: used >= stopPct };
}

export const stopRequested = (stopFile = 'STOP') => existsSync(stopFile);
export const fileSize = (f) => statSync(f).size;
