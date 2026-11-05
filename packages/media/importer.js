// Flow/stok dosya içe aktarma: tamamlanma, tür, çözünürlük, hash, sahne eşleşmesi, lisans, kredi kaydı.
import { readdirSync, statSync, readFileSync, renameSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { probe } from '../../apps/render-worker/src/render.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
/** Boyut sabitlenene dek bekle (yarım dosya reddi). */
export async function isStable(f, waitMs = 300) { const a = statSync(f).size; await sleep(waitMs); return a === statSync(f).size && a > 0; }

/** Dosya adı: scene_<sceneId>__<ad>.<ext>  */
export async function importInbox(studio, projectId, inboxDir, { sceneIds, licenseTerms, flowCredits = 0, waitMs = 300 }) {
  const out = [];
  for (const name of readdirSync(inboxDir).filter((n) => !n.startsWith('.'))) {
    const f = path.join(inboxDir, name); const r = { name, status: 'IMPORTED', reason: null };
    try {
      const m = name.match(/^scene_([\w-]+?)__/);
      if (!m || !sceneIds.includes(m[1])) { r.status = 'REJECTED'; r.reason = 'SCENE_MISMATCH'; }
      else if (!(await isStable(f, waitMs))) { r.status = 'REJECTED'; r.reason = 'INCOMPLETE'; }
      else if (!licenseTerms) { r.status = 'REJECTED'; r.reason = 'LICENSE_MISSING'; }
      else {
        let info; try { info = await probe(f); } catch { r.status = 'REJECTED'; r.reason = 'CORRUPT'; }
        if (info) {
          const v = info.video; const portrait = v && v.height > v.width;
          const hash = createHash('sha256').update(readFileSync(f)).digest('hex');
          r.status = portrait && v.width >= 720 ? 'IMPORTED' : 'REVIEW_REQUIRED'; r.reason = r.status === 'REVIEW_REQUIRED' ? 'BAD_RESOLUTION' : null;
          const rel = path.relative(studio.workspaceRoot, f);
          studio.importAsset(projectId, { scene_id: m[1], rel_path: rel.startsWith('..') ? path.basename(f) : rel, sha256: hash, media_type: 'video', license_terms: licenseTerms }, `imp-${hash}`);
          if (flowCredits) studio.db.prepare("INSERT INTO ledger(project_id,entry_type,flow_credits,created_at) VALUES(?,?,?,?)").run(projectId, 'FLOW_CREDITS', flowCredits, new Date().toISOString());
          if (r.status === 'REVIEW_REQUIRED') studio.db.prepare("UPDATE assets SET status='REVIEW_REQUIRED' WHERE sha256=?").run(hash);
        }
      }
    } catch (e) { r.status = 'REJECTED'; r.reason = e.code ?? 'ERROR'; }
    if (r.status === 'REJECTED') { mkdirSync(path.join(inboxDir, '_rejected'), { recursive: true }); renameSync(f, path.join(inboxDir, '_rejected', name)); }
    out.push(r);
  }
  return out;
}
