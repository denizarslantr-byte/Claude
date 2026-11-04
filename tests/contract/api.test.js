import { test } from 'node:test';
import assert from 'node:assert/strict';
import { openStudio, ApiError, sha256, TRANSITIONS, maskSecrets } from '../../apps/control-api/src/core.js';
import { createServer } from '../../apps/control-api/src/server.js';

const H = sha256('video-v1');
const mk = (opts) => openStudio(':memory:', { dailyBudgetUsd: 1, projectBudgetUsd: 1, ...opts });
const reject = (fn, code) => assert.throws(fn, (e) => e instanceof ApiError && (code ? e.status === code : true));

function toState(s, id, path) { for (const st of path) s.transition(id, st); }

test('API-01 geçersiz geçiş 409, DB değişmez', () => {
  const s = mk(); const p = s.createProject({ title: 'T' }, 'k1');
  reject(() => s.transition(p.id, 'PUBLISHED'), 409);
  assert.equal(s.getProject(p.id).status, 'DRAFT');
});

test('API-02 aynı idempotency key tek iş üretir', () => {
  const s = mk(); const a = s.createProject({ title: 'T' }, 'same'); const b = s.createProject({ title: 'T' }, 'same');
  assert.equal(a.id, b.id);
  assert.equal(s.db.prepare('SELECT COUNT(*) c FROM projects').get().c, 1);
  reject(() => s.createProject({ title: 'T' }, undefined), 400);
});

test('API-03 paralel bütçe rezervasyonu limiti aşamaz', async () => {
  const s = mk({ dailyBudgetUsd: 1, projectBudgetUsd: 1 }); const p = s.createProject({ title: 'T' }, 'k');
  const results = await Promise.allSettled([0.6, 0.6, 0.6].map(async (v) => s.reserveBudget(p.id, null, v)));
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  // bütçe 0 → ücretli adım reddedilir
  const z = openStudio(':memory:'); const zp = z.createProject({ title: 'Z' }, 'z');
  reject(() => z.reserveBudget(zp.id, null, 0.01), 402);
});

test('API-04 final hash değişince onaylar geçersiz olur', () => {
  const s = mk(); const p = s.createProject({ title: 'T' }, 'k');
  toState(s, p.id, ['RESEARCHING', 'SCRIPT_REVIEW']);
  s.approve(p.id, 'script', sha256('script'), 'owner', true, 'a1');
  toState(s, p.id, ['MEDIA_PREPARING', 'MEDIA_READY', 'RENDERING', 'QA_REVIEW', 'WAITING_FINAL_APPROVAL']);
  s.approve(p.id, 'final', H, 'owner', true, 'a2');
  const after = s.registerFinalArtifact(p.id, sha256('video-v2'));
  assert.equal(after.status, 'MEDIA_PREPARING');
  assert.equal(after.final_hash, null);
  assert.equal(s.db.prepare("SELECT COUNT(*) c FROM approvals WHERE project_id=? AND kind='final' AND valid=1").get(p.id).c, 0);
});

test('API-05 yetkisiz kullanıcı onay veremez', async () => {
  const s = mk(); const p = s.createProject({ title: 'T' }, 'k');
  toState(s, p.id, ['RESEARCHING', 'SCRIPT_REVIEW']);
  reject(() => s.approve(p.id, 'script', H, 'x', false, 'a'), 403);
  const srv = createServer(s, { token: 'tok-123456' }); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  const r = await fetch(`http://127.0.0.1:${port}/projects/${p.id}/approve-script`, { method: 'POST', headers: { 'idempotency-key': 'z', 'content-type': 'application/json' }, body: JSON.stringify({ hash: H }) });
  assert.equal(r.status, 403);
  srv.close();
});

test('API-06 dış timeout UNKNOWN olur, tekrar yok, reconcile var', async () => {
  const s = mk(); const p = s.createProject({ title: 'T' }, 'k'); const j = s.createJob(p.id, { type: 'tts' }, 'j');
  let calls = 0;
  const res = await s.runExternal(j.id, () => { calls++; return new Promise(() => {}); }, 30);
  assert.equal(res.state, 'UNKNOWN'); assert.equal(calls, 1);
  assert.equal(s.getJob(j.id).state, 'UNKNOWN');
  assert.equal(s.getJob(j.id).attempts, 1);
  assert.equal(s.reconcile(j.id, 'completed').state, 'RECONCILED');
  assert.ok(s.db.prepare("SELECT COUNT(*) c FROM audit_log WHERE action='job.reconcile'").get().c === 1);
  reject(() => s.reconcile(j.id, 'completed'), 409);
});

test('API-07 yol traversal ve lisanssız asset reddedilir', () => {
  const s = mk({ workspaceRoot: '/tmp/ws' }); const p = s.createProject({ title: 'T' }, 'k');
  reject(() => s.importAsset(p.id, { rel_path: '../../etc/passwd', sha256: H, license_terms: 'CC0' }, 'i1'), 400);
  reject(() => s.importAsset(p.id, { rel_path: 'data/a.mp4', sha256: H }, 'i2'), 400);
  reject(() => s.importAsset(p.id, { rel_path: 'data/a.mp4', sha256: 'zz', license_terms: 'CC0' }, 'i3'), 400);
  assert.equal(s.importAsset(p.id, { rel_path: 'data/a.mp4', sha256: H, license_terms: 'CC0' }, 'i4').path, '/tmp/ws/data/a.mp4');
});

test('API-08 sırlar yanıt ve hata çıktısında maskelenir', async () => {
  const secret = 'SUPERSECRET-token-9999';
  assert.equal(maskSecrets(`hata ${secret} oluştu`, [secret]), 'hata *** oluştu');
  const s = mk(); const srv = createServer(s, { token: secret, secrets: [secret] }); await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const { port } = srv.address();
  const h = await (await fetch(`http://127.0.0.1:${port}/health`)).text();
  const bad = await (await fetch(`http://127.0.0.1:${port}/projects/${secret}`, { headers: { authorization: `Bearer ${secret}` } })).text();
  assert.ok(!h.includes(secret) && !bad.includes(secret));
  const unauth = await fetch(`http://127.0.0.1:${port}/projects`, { method: 'POST', body: '{}' });
  assert.equal(unauth.status, 401);
  srv.close();
});

test('durum makinesi: tüm hedefler tanımlı durumlar', () => {
  for (const [from, tos] of Object.entries(TRANSITIONS)) for (const t of tos) assert.ok(t in TRANSITIONS, `${from}→${t}`);
});

test('çift onay callback tek işlem (idempotent)', () => {
  const s = mk(); const p = s.createProject({ title: 'T' }, 'k');
  toState(s, p.id, ['RESEARCHING', 'SCRIPT_REVIEW']);
  s.approve(p.id, 'script', H, 'owner', true, 'same'); s.approve(p.id, 'script', H, 'owner', true, 'same');
  assert.equal(s.db.prepare('SELECT COUNT(*) c FROM approvals').get().c, 1);
});

test('tam mutlu yol DRAFT→PUBLISHED hash onaylarıyla', () => {
  const s = mk(); const p = s.createProject({ title: 'T' }, 'k');
  toState(s, p.id, ['RESEARCHING', 'SCRIPT_REVIEW']); s.approve(p.id, 'script', sha256('s'), 'owner', true, '1');
  toState(s, p.id, ['MEDIA_PREPARING', 'MEDIA_READY', 'RENDERING', 'QA_REVIEW', 'WAITING_FINAL_APPROVAL']); s.approve(p.id, 'final', H, 'owner', true, '2');
  toState(s, p.id, ['EXPORT_READY', 'WAITING_PUBLICATION_APPROVAL']); s.approve(p.id, 'publication', sha256('pkg'), 'owner', true, '3');
  assert.equal(s.transition(p.id, 'PUBLISHED').status, 'PUBLISHED');
});
