import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { openStudio, sha256 } from '../../apps/control-api/src/core.js';
import { handleUpdate, dailyDigest } from '../../packages/telegram/handler.js';
import { buildPackage, recordPublication } from '../../packages/publish/package.js';
import { yppProgress, revenueSummary, profitability, medianViews } from '../../packages/analytics/report.js';
import { readFileSync } from 'node:fs';

const dir = mkdtempSync(path.join(tmpdir(), 'tg-')); const AUTH = { allowedChatId: 111, allowedUserId: 7, stopFile: path.join(dir, 'STOP') };
const H = sha256('script');
function review() { const s = openStudio(':memory:'); const p = s.createProject({ title: 'T' }, 'k'); s.transition(p.id, 'RESEARCHING'); s.transition(p.id, 'SCRIPT_REVIEW'); return { s, p }; }
const cb = (id, p, chat = 111, user = 7) => ({ callback_query: { id, from: { id: user }, message: { chat: { id: chat } }, data: `approve:script:${p.id}:${H}` } });

test('Telegram: izinli kullanıcı onaylar', () => { const { s, p } = review(); const r = handleUpdate(s, cb('c1', p), AUTH); assert.equal(r.status, 'SCRIPT_APPROVED'); });
test('Telegram: yetkisiz chat/kullanıcı reddedilir', () => {
  const { s, p } = review(); assert.equal(handleUpdate(s, cb('c2', p, 999), AUTH).reason, 'UNAUTHORIZED'); assert.equal(handleUpdate(s, cb('c3', p, 111, 8), AUTH).reason, 'UNAUTHORIZED');
  assert.equal(s.getProject(p.id).status, 'SCRIPT_REVIEW');
});
test('Telegram: çift callback tek işlem', () => {
  const { s, p } = review(); handleUpdate(s, cb('dup', p), AUTH); handleUpdate(s, cb('dup', p), AUTH);
  assert.equal(s.db.prepare('SELECT COUNT(*) c FROM approvals').get().c, 1);
});
test('Telegram: /stop STOP dosyası yazar; bozuk callback reddedilir', () => {
  const { s } = review(); handleUpdate(s, { message: { text: '/stop', chat: { id: 111 }, from: { id: 7 } } }, AUTH); assert.ok(existsSync(AUTH.stopFile));
  assert.equal(handleUpdate(s, { callback_query: { id: 'x', from: { id: 7 }, message: { chat: { id: 111 } }, data: 'approve:script:../../x:zz' } }, AUTH).reason, 'BAD_CALLBACK');
  assert.match(dailyDigest(s), /Günlük özet/);
});
test('n8n workflow geçerli JSON, ücretli çağrıda retry kapalı, API localhost', () => {
  const w = JSON.parse(readFileSync('workflows/n8n/idea-to-approval.json', 'utf8'));
  assert.ok(w.nodes.every((n) => n.retryOnFail !== true)); assert.ok(w.nodes.filter((n) => n.parameters.url).every((n) => n.parameters.url.includes('127.0.0.1')));
});
const pk = () => buildPackage({ title: 'Roma', titles: ['A', 'B', 'C'], description: 'd', sources: ['https://kaynak'], finalHash: 'f'.repeat(64) });
function toPubApproved(s, p, pkg) {
  s.approve(p.id, 'script', H, 'o', true, 's');
  ['MEDIA_PREPARING', 'MEDIA_READY', 'RENDERING', 'QA_REVIEW', 'WAITING_FINAL_APPROVAL'].forEach((x) => s.transition(p.id, x));
  s.approve(p.id, 'final', pkg.finalHash, 'o', true, 'f'); ['EXPORT_READY', 'WAITING_PUBLICATION_APPROVAL'].forEach((x) => s.transition(p.id, x));
  s.approve(p.id, 'publication', pkg.packageHash, 'o', true, 'p');
}
test('F8: paket kuralları (3 başlık, kaynak, AI etiketi)', () => {
  const x = pk(); assert.match(x.description, /yapay zekâ/); assert.match(x.packageHash, /^[0-9a-f]{64}$/);
  assert.throws(() => buildPackage({ title: 't', titles: ['a'], sources: ['x'], description: '' }), { code: 'TITLES' });
  assert.throws(() => buildPackage({ title: 't', titles: ['a', 'b', 'c'], sources: [], description: '' }), { code: 'SOURCES' });
});
test('F8: onaysız yayın engellenir; yanlış URL/hash reddedilir; geçerli URL PUBLISHED', () => {
  const { s, p } = review(); const pkg = pk();
  assert.throws(() => recordPublication(s, p.id, 'https://youtu.be/abcdefg', pkg), { code: 'NOT_APPROVED' });
  toPubApproved(s, p, pkg);
  assert.throws(() => recordPublication(s, p.id, 'https://youtu.be/abcdefg', { ...pkg, packageHash: 'x' }), { code: 'HASH_MISMATCH' });
  assert.throws(() => recordPublication(s, p.id, 'https://evil.example/x', pkg), { code: 'BAD_URL' });
  assert.equal(recordPublication(s, p.id, 'https://youtube.com/shorts/abc123XYZ', pkg).status, 'PUBLISHED');
});
test('F9: veri yoksa DATA_UNAVAILABLE, tahmin ayrı, başabaş', () => {
  assert.equal(yppProgress({ subs: null }).subs_pct, 'DATA_UNAVAILABLE'); assert.equal(yppProgress({ subs: 500, watchHours365: 4000, shorts90: 1e6 }).hours_pct, 50);
  assert.deepEqual(revenueSummary([{ amount: 10, verified: true }, { amount: 5, verified: false }]), { verified_usd: 10, estimate_usd: 5, label: 'ESTIMATE_INCLUDED_SEPARATELY' });
  const f = profitability({ revenue: 100, vps: 20, api: 10, videos: 10, hours: 5, hourlyRate: 4 }); assert.equal(f.net, 70); assert.equal(f.net_with_labor, 50); assert.equal(f.breakeven_videos, 3);
  assert.equal(profitability({ revenue: 0, vps: 20, api: 10, videos: 10 }).breakeven_videos, null);
  assert.equal(medianViews([]), 'DATA_UNAVAILABLE'); assert.equal(medianViews([1, 9, 5, 3]), 4);
});
