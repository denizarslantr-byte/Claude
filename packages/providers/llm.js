// LLMProvider soyutlaması: mock + canlı (anahtar/bütçe/model yoksa SKIPPED). Model adı koda gömülmez.
import { readFileSync } from 'node:fs';

export const TASKS = ['ideas', 'research', 'script', 'director', 'fact_check', 'seo', 'analytics', 'translate', 'frame_review'];

export class SkippedError extends Error { constructor(why) { super(why); this.code = 'SKIPPED'; } }

export const loadMatrix = (p = 'config/provider-matrix.json') => JSON.parse(readFileSync(p, 'utf8'));

/** Basit şema doğrulama: {alan: 'string'|'number'|'array'|'object'} */
export function validateSchema(data, schema) {
  if (!data || typeof data !== 'object') return false;
  return Object.entries(schema).every(([k, t]) => (t === 'array' ? Array.isArray(data[k]) : typeof data[k] === t));
}

export function createProvider(name, matrix, env = process.env) {
  const cfg = matrix.providers[name];
  if (!cfg) throw new Error(`Bilinmeyen sağlayıcı: ${name}`);
  if (cfg.kind === 'mock') {
    return {
      name, model: cfg.model,
      async generateStructured(req) {
        const data = req.mockResponse ? req.mockResponse(name) : { text: `mock:${req.task}` };
        return { data, usage: { inputTokens: 100, outputTokens: 50 }, model: cfg.model, operationId: `op-${name}-${Date.now()}` };
      },
    };
  }
  // Canlı: anahtar yok, model/fiyat doğrulanmamış veya bütçe 0 ise çağrı yapılmaz.
  return {
    name, model: cfg.model,
    async generateStructured(req) {
      if (!env[cfg.env_key]) throw new SkippedError(`${cfg.env_key} yok`);
      if (!cfg.model || cfg.price_in_per_1m == null) throw new SkippedError('model/fiyat doğrulanmadı (F0 policy-register)');
      if (!(req.budgetUsd > 0)) throw new SkippedError('bütçe 0');
      throw new SkippedError('canlı adaptör henüz uygulanmadı (DEFERRED_QUEUE)');
    },
  };
}

/** Görev yönlendirme: yalnız benchmark sonucuna (task_routing) göre; yoksa hata, "ilk aday" varsayımı yok. */
export function routeTask(task, matrix) {
  const p = matrix.task_routing[task];
  if (!p) throw new SkippedError(`'${task}' için benchmark kazananı yok`);
  return p;
}

/** Çağrıyı jobs.model ile kaydederek yapar. */
export async function callAndRecord(studio, projectId, provider, req) {
  const job = studio.createJob(projectId, { type: req.task, provider: provider.name, model: provider.model }, `llm-${projectId}-${req.task}-${req.promptVersion}-${provider.name}`);
  try {
    const r = await provider.generateStructured(req);
    if (req.schema && !validateSchema(r.data, req.schema)) {
      studio.db.prepare("UPDATE jobs SET state='FAILED', error_code='SCHEMA' WHERE id=?").run(job.id);
      throw Object.assign(new Error('Şema doğrulaması başarısız'), { code: 'SCHEMA' });
    }
    studio.db.prepare("UPDATE jobs SET state='COMPLETED', model=?, external_operation_id=?, attempts=attempts+1 WHERE id=?").run(r.model, r.operationId ?? null, job.id);
    return { ...r, jobId: job.id };
  } catch (e) {
    if (e.code === 'SKIPPED') studio.db.prepare("UPDATE jobs SET state='CANCELLED', error_code='SKIPPED' WHERE id=?").run(job.id);
    throw e;
  }
}
