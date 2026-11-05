// F8: yayın paketi. Hash onayı olmadan EXPORT_READY'den öteye geçmez; PUBLISHED yalnız doğrulanmış URL ile.
import { createHash } from 'node:crypto';
import { ApiError } from '../../apps/control-api/src/core.js';

export function buildPackage({ title, description, titles, sources, aiLabel = true, finalHash, platform = 'youtube', scheduledAt = null }) {
  if (!Array.isArray(titles) || titles.length < 3) throw new ApiError(400, 'TITLES', 'En az 3 başlık gerekli');
  if (!sources?.length) throw new ApiError(400, 'SOURCES', 'Kaynak listesi zorunlu');
  if (titles.concat(title).some((t) => t.length > 100)) throw new ApiError(400, 'TITLE_LEN', 'Başlık 100 karakteri aşamaz');
  const desc = `${description}\n\nKaynaklar:\n${sources.map((s) => `- ${s}`).join('\n')}${aiLabel ? '\n\nBu videoda yapay zekâ ile üretilmiş görsel/ses kullanılmıştır.' : ''}`;
  const pkg = { platform, title, titles, description: desc, aiLabel, finalHash, scheduledAt };
  return { ...pkg, packageHash: createHash('sha256').update(JSON.stringify(pkg)).digest('hex') };
}

const URL_RE = { youtube: /^https:\/\/(www\.)?youtube\.com\/(shorts\/|watch\?v=)[\w-]{6,}$|^https:\/\/youtu\.be\/[\w-]{6,}$/ };
/** Manuel yayın kaydı: URL doğrulanmadan PUBLISHED yazılmaz. */
export function recordPublication(studio, projectId, url, pkg) {
  const p = studio.getProject(projectId);
  if (p.status !== 'PUBLICATION_APPROVED') throw new ApiError(409, 'NOT_APPROVED', 'Yayın onayı yok');
  if (p.publication_hash !== pkg.packageHash) throw new ApiError(409, 'HASH_MISMATCH', 'Paket onaylı hash ile eşleşmiyor');
  if (!URL_RE[pkg.platform]?.test(url)) throw new ApiError(400, 'BAD_URL', 'Geçersiz yayın URL');
  studio.db.prepare('INSERT OR REPLACE INTO idempotency(key,response,created_at) VALUES(?,?,?)').run(`pub-${projectId}`, JSON.stringify({ url }), new Date().toISOString());
  studio.audit('owner', 'publication.recorded', projectId, { url });
  return studio.transition(projectId, 'PUBLISHED', 'owner');
}
