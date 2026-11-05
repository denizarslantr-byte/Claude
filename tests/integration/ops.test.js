import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, existsSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStudio } from '../../apps/control-api/src/core.js';
import { DatabaseSync } from 'node:sqlite';
import { backupDb, restoreDb, recoverOnStartup, diskGuard, stopRequested } from '../../packages/ops/backup.js';

const dir = mkdtempSync(path.join(tmpdir(), 'ops-'));

test('yedek → kayıp → restore: veri geri gelir', () => {
  const live = path.join(dir, 'live.sqlite'); const s = openStudio(live);
  const p = s.createProject({ title: 'Önemli' }, 'k');
  const b = backupDb(s.db, path.join(dir, 'bk'), { externalDir: path.join(dir, 'ext') });
  assert.equal(b.external, 'UNAVAILABLE'); // dış hedef yoksa CONDITIONAL
  s.db.close(); rmSync(live); rmSync(live + '-wal', { force: true }); rmSync(live + '-shm', { force: true });
  restoreDb(b.file, b.sha256, live);
  const r = openStudio(live); assert.equal(r.getProject(p.id).title, 'Önemli');
});
test('dış hedef gerçek kopya', async () => {
  const { mkdirSync } = await import('node:fs'); const ext = path.join(dir, 'ext3'); mkdirSync(ext);
  const s = openStudio(':memory:'); s.createProject({ title: 'x' }, 'k');
  const b = backupDb(s.db, path.join(dir, 'bk2'), { externalDir: ext });
  assert.ok(existsSync(b.external));
});
test('bozuk yedek restore edilmez', () => {
  const s = openStudio(':memory:'); const b = backupDb(s.db, path.join(dir, 'bk3'));
  writeFileSync(b.file, readFileSync(b.file).subarray(0, 100));
  assert.throws(() => restoreDb(b.file, b.sha256, path.join(dir, 't.sqlite')), /hash/);
});
test('yeniden başlatma: yarım ücretli iş UNKNOWN olur, tekrar çağrılmaz', () => {
  const s = openStudio(':memory:'); const p = s.createProject({ title: 'T' }, 'k'); const j = s.createJob(p.id, { type: 'tts' }, 'j');
  s.db.prepare("UPDATE jobs SET state='SUBMITTED', attempts=1 WHERE id=?").run(j.id);
  assert.equal(recoverOnStartup(s.db).markedUnknown, 1);
  assert.equal(s.getJob(j.id).state, 'UNKNOWN'); assert.equal(s.getJob(j.id).attempts, 1);
});
test('disk devre kesici ve STOP dosyası', () => {
  assert.equal(diskGuard(dir, 0.0001).stop, true); assert.equal(diskGuard(dir, 100.1).stop, false);
  const f = path.join(dir, 'STOP'); assert.equal(stopRequested(f), false); writeFileSync(f, ''); assert.equal(stopRequested(f), true);
});
test('WAL: yazılmış veri kapatılmadan yeni bağlantıda görünür', () => {
  const f = path.join(dir, 'wal.sqlite'); const s = openStudio(f); s.createProject({ title: 'W' }, 'k');
  const o = new DatabaseSync(f); assert.equal(o.prepare('SELECT COUNT(*) c FROM projects').get().c, 1); o.close();
});
