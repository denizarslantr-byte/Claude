// Control API çekirdeği: SQLite (node:sqlite), durum makinesi, bütçe, idempotency, ledger.
import { DatabaseSync } from 'node:sqlite';
import { randomUUID, createHash } from 'node:crypto';
import path from 'node:path';

export const TRANSITIONS = {
  DRAFT: ['RESEARCHING', 'CANCELLED'],
  RESEARCHING: ['SCRIPT_REVIEW', 'PAUSED', 'FAILED'],
  SCRIPT_REVIEW: ['DRAFT', 'SCRIPT_APPROVED', 'CANCELLED'],
  SCRIPT_APPROVED: ['MEDIA_PREPARING'],
  MEDIA_PREPARING: ['MEDIA_READY', 'PAUSED', 'FAILED', 'UNKNOWN'],
  MEDIA_READY: ['RENDERING'],
  RENDERING: ['QA_REVIEW', 'FAILED'],
  QA_REVIEW: ['MEDIA_PREPARING', 'WAITING_FINAL_APPROVAL'],
  WAITING_FINAL_APPROVAL: ['FINAL_APPROVED', 'MEDIA_PREPARING'],
  FINAL_APPROVED: ['EXPORT_READY'],
  EXPORT_READY: ['WAITING_PUBLICATION_APPROVAL', 'CANCELLED'],
  WAITING_PUBLICATION_APPROVAL: ['PUBLICATION_APPROVED'],
  PUBLICATION_APPROVED: ['PUBLISHED'],
  PUBLISHED: ['ANALYZING'],
  FAILED: ['RESEARCHING', 'MEDIA_PREPARING'],
  UNKNOWN: ['MEDIA_PREPARING'],
  PAUSED: ['RESEARCHING', 'MEDIA_PREPARING'],
  ANALYZING: [], CANCELLED: [],
};

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (v INTEGER NOT NULL);
CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, title TEXT NOT NULL, topic TEXT, format TEXT NOT NULL DEFAULT 'short_9x16',
  status TEXT NOT NULL DEFAULT 'DRAFT', target_platform TEXT NOT NULL DEFAULT 'youtube', script_hash TEXT, final_hash TEXT,
  publication_hash TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS scenes (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), order_no INTEGER NOT NULL,
  narration TEXT, prompt_version TEXT, start_ms INTEGER, end_ms INTEGER, status TEXT NOT NULL DEFAULT 'NEW');
CREATE TABLE IF NOT EXISTS assets (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), scene_id TEXT, path TEXT NOT NULL,
  sha256 TEXT NOT NULL, media_type TEXT, source_url TEXT, license_terms TEXT, status TEXT NOT NULL DEFAULT 'CREATED');
CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), type TEXT NOT NULL, provider TEXT,
  model TEXT, external_operation_id TEXT, state TEXT NOT NULL DEFAULT 'CREATED', request_hash TEXT, attempts INTEGER NOT NULL DEFAULT 0,
  error_code TEXT, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS approvals (id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id), kind TEXT NOT NULL,
  artifact_hash TEXT NOT NULL, approved_by TEXT NOT NULL, decision TEXT NOT NULL, valid INTEGER NOT NULL DEFAULT 1, decided_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS ledger (id INTEGER PRIMARY KEY AUTOINCREMENT, project_id TEXT, job_id TEXT, entry_type TEXT NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD', reserved REAL NOT NULL DEFAULT 0, actual REAL NOT NULL DEFAULT 0, flow_credits INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS idempotency (key TEXT PRIMARY KEY, response TEXT NOT NULL, created_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS audit_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor TEXT, action TEXT NOT NULL, project_id TEXT, detail TEXT, at TEXT NOT NULL);
INSERT INTO schema_version SELECT 1 WHERE NOT EXISTS (SELECT 1 FROM schema_version);
`;

const now = () => new Date().toISOString();
export const sha256 = (s) => createHash('sha256').update(s).digest('hex');

export function openStudio(file = ':memory:', opts = {}) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  db.exec(SCHEMA);
  return new Studio(db, opts);
}

export class Studio {
  constructor(db, { dailyBudgetUsd = 0, projectBudgetUsd = 0, workspaceRoot = process.cwd() } = {}) {
    this.db = db; this.dailyBudgetUsd = dailyBudgetUsd; this.projectBudgetUsd = projectBudgetUsd;
    this.workspaceRoot = path.resolve(workspaceRoot);
  }
  tx(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const r = fn(); this.db.exec('COMMIT'); return r; } catch (e) { this.db.exec('ROLLBACK'); throw e; }
  }
  audit(actor, action, projectId, detail) {
    this.db.prepare('INSERT INTO audit_log(actor,action,project_id,detail,at) VALUES(?,?,?,?,?)').run(actor, action, projectId ?? null, detail ? JSON.stringify(detail) : null, now());
  }
  /** Idempotency: aynı anahtar aynı yanıtı döner, ikinci kez işlem üretmez (API-02). */
  idempotent(key, fn) {
    if (!key) throw new ApiError(400, 'IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key gerekli');
    return this.tx(() => {
      const hit = this.db.prepare('SELECT response FROM idempotency WHERE key=?').get(key);
      if (hit) return JSON.parse(hit.response);
      const res = fn();
      this.db.prepare('INSERT INTO idempotency(key,response,created_at) VALUES(?,?,?)').run(key, JSON.stringify(res), now());
      return res;
    });
  }
  getProject(id) {
    const p = this.db.prepare('SELECT * FROM projects WHERE id=?').get(id);
    if (!p) throw new ApiError(404, 'NOT_FOUND', 'Proje bulunamadı');
    return { ...p };
  }
  createProject({ title, topic, format, target_platform }, key) {
    if (typeof title !== 'string' || !title.trim() || title.length > 200) throw new ApiError(400, 'INVALID', 'title geçersiz');
    return this.idempotent(key, () => {
      const id = randomUUID();
      this.db.prepare('INSERT INTO projects(id,title,topic,format,target_platform,created_at) VALUES(?,?,?,?,?,?)')
        .run(id, title.trim(), topic ?? null, format ?? 'short_9x16', target_platform ?? 'youtube', now());
      this.audit('user', 'project.create', id);
      return this.getProject(id);
    });
  }
  /** Geçerli geçiş matrisi dışı → 409, DB değişmez (API-01). */
  transition(id, to, actor = 'system') {
    return this.tx(() => {
      const p = this.getProject(id);
      if (!(TRANSITIONS[p.status] ?? []).includes(to)) throw new ApiError(409, 'INVALID_TRANSITION', `${p.status} → ${to} izinli değil`);
      this.db.prepare('UPDATE projects SET status=? WHERE id=?').run(to, id);
      this.audit(actor, `transition.${p.status}.${to}`, id);
      return this.getProject(id);
    });
  }
  /** İnsan onayı: yetki + hash. Onay yalnız beklenen durumda ve sadece actor=ALLOWED ise. */
  approve(id, kind, hash, actor, isAuthorized, key) {
    if (!isAuthorized) throw new ApiError(403, 'FORBIDDEN', 'Yetkisiz kullanıcı onay veremez');
    if (!/^[0-9a-f]{64}$/.test(hash ?? '')) throw new ApiError(400, 'INVALID_HASH', 'sha256 hash gerekli');
    const map = {
      script: { from: 'SCRIPT_REVIEW', to: 'SCRIPT_APPROVED', col: 'script_hash' },
      final: { from: 'WAITING_FINAL_APPROVAL', to: 'FINAL_APPROVED', col: 'final_hash' },
      publication: { from: 'WAITING_PUBLICATION_APPROVAL', to: 'PUBLICATION_APPROVED', col: 'publication_hash' },
    }[kind];
    return this.idempotent(key, () => {
      const p = this.getProject(id);
      if (p.status !== map.from) throw new ApiError(409, 'INVALID_TRANSITION', `${p.status} durumunda ${kind} onayı verilemez`);
      this.db.prepare(`UPDATE projects SET status=?, ${map.col}=? WHERE id=?`).run(map.to, hash, id);
      this.db.prepare('INSERT INTO approvals(id,project_id,kind,artifact_hash,approved_by,decision,decided_at) VALUES(?,?,?,?,?,?,?)')
        .run(randomUUID(), id, kind, hash, actor, 'APPROVED', now());
      this.audit(actor, `approve.${kind}`, id, { hash });
      return this.getProject(id);
    });
  }
  /** Final değişirse final ve yayın onayları geçersiz olur (API-04). */
  registerFinalArtifact(id, newHash) {
    return this.tx(() => {
      const p = this.getProject(id);
      if (p.final_hash && p.final_hash !== newHash) {
        this.db.prepare("UPDATE approvals SET valid=0 WHERE project_id=? AND kind IN ('final','publication')").run(id);
        this.db.prepare('UPDATE projects SET final_hash=NULL, publication_hash=NULL, status=? WHERE id=?').run('MEDIA_PREPARING', id);
        this.audit('system', 'approval.invalidated', id, { old: p.final_hash, new: newHash });
      }
      return this.getProject(id);
    });
  }
  /** Bütçe rezervasyonu: tek transaction içinde limit kontrolü (API-03). */
  reserveBudget(projectId, jobId, usd) {
    return this.tx(() => {
      const day = new Date().toISOString().slice(0, 10);
      const spentDay = this.db.prepare("SELECT COALESCE(SUM(reserved+actual),0) s FROM ledger WHERE substr(created_at,1,10)=?").get(day).s;
      const spentProj = this.db.prepare('SELECT COALESCE(SUM(reserved+actual),0) s FROM ledger WHERE project_id=?').get(projectId).s;
      if (spentDay + usd > this.dailyBudgetUsd || spentProj + usd > this.projectBudgetUsd) {
        throw new ApiError(402, 'BUDGET_EXCEEDED', 'Bütçe limiti aşılır; adım SKIPPED');
      }
      this.db.prepare("INSERT INTO ledger(project_id,job_id,entry_type,reserved,created_at) VALUES(?,?,'RESERVE',?,?)").run(projectId, jobId, usd, now());
      return { reserved: usd };
    });
  }
  createJob(projectId, { type, provider = 'mock', model = null }, key) {
    return this.idempotent(key, () => {
      this.getProject(projectId);
      const id = randomUUID();
      this.db.prepare('INSERT INTO jobs(id,project_id,type,provider,model,created_at) VALUES(?,?,?,?,?,?)').run(id, projectId, type, provider, model, now());
      return { ...this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id) };
    });
  }
  getJob(id) {
    const j = this.db.prepare('SELECT * FROM jobs WHERE id=?').get(id);
    if (!j) throw new ApiError(404, 'NOT_FOUND', 'İş bulunamadı');
    return { ...j };
  }
  /** Dış çağrı: zaman aşımı → UNKNOWN, otomatik tekrar yok (API-06). */
  async runExternal(jobId, fn, timeoutMs = 5000) {
    this.db.prepare("UPDATE jobs SET state='SUBMITTED', attempts=attempts+1 WHERE id=?").run(jobId);
    let timer;
    try {
      const res = await Promise.race([fn(), new Promise((_, rej) => { timer = setTimeout(() => rej(new Error('TIMEOUT')), timeoutMs); })]);
      this.db.prepare("UPDATE jobs SET state='COMPLETED' WHERE id=?").run(jobId);
      return res;
    } catch (e) {
      const state = e.message === 'TIMEOUT' ? 'UNKNOWN' : 'FAILED';
      this.db.prepare('UPDATE jobs SET state=?, error_code=? WHERE id=?').run(state, e.message === 'TIMEOUT' ? 'TIMEOUT' : 'ERROR', jobId);
      this.audit('system', `job.${state.toLowerCase()}`, null, { jobId });
      return { state };
    } finally { clearTimeout(timer); }
  }
  reconcile(jobId, providerStatus) {
    return this.tx(() => {
      const j = this.getJob(jobId);
      if (j.state !== 'UNKNOWN') throw new ApiError(409, 'NOT_UNKNOWN', 'Yalnız UNKNOWN iş uzlaştırılır');
      const next = providerStatus === 'completed' ? 'RECONCILED' : 'FAILED';
      this.db.prepare('UPDATE jobs SET state=? WHERE id=?').run(next, jobId);
      this.audit('system', 'job.reconcile', j.project_id, { jobId, providerStatus });
      return this.getJob(jobId);
    });
  }
  /** Yol traversal ve türetilmiş kontrol (API-07). */
  safeWorkspacePath(rel) {
    const full = path.resolve(this.workspaceRoot, rel);
    if (full !== this.workspaceRoot && !full.startsWith(this.workspaceRoot + path.sep)) throw new ApiError(400, 'PATH_TRAVERSAL', 'Geçersiz dosya yolu');
    return full;
  }
  importAsset(projectId, { scene_id, rel_path, sha256: hash, media_type, source_url, license_terms }, key) {
    if (!license_terms) throw new ApiError(400, 'LICENSE_REQUIRED', 'Lisans kaydı zorunlu');
    if (!/^[0-9a-f]{64}$/.test(hash ?? '')) throw new ApiError(400, 'INVALID_HASH', 'sha256 gerekli');
    const full = this.safeWorkspacePath(rel_path);
    return this.idempotent(key, () => {
      this.getProject(projectId);
      const id = randomUUID();
      this.db.prepare('INSERT INTO assets(id,project_id,scene_id,path,sha256,media_type,source_url,license_terms) VALUES(?,?,?,?,?,?,?,?)')
        .run(id, projectId, scene_id ?? null, full, hash, media_type ?? null, source_url ?? null, license_terms);
      return { ...this.db.prepare('SELECT * FROM assets WHERE id=?').get(id) };
    });
  }
}

/** Sırları maskeler (API-08). */
export function maskSecrets(text, secrets) {
  let out = String(text);
  for (const s of secrets.filter((x) => x && x.length >= 6)) out = out.split(s).join('***');
  return out;
}
