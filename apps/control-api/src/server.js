// Control API HTTP katmanı: 127.0.0.1, bearer token, JSON.
import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { openStudio, ApiError, maskSecrets } from './core.js';

export function createServer(studio, { token, secrets = [] } = {}) {
  const authed = (req) => {
    const h = req.headers.authorization ?? '';
    const given = Buffer.from(h.replace(/^Bearer /, ''));
    const want = Buffer.from(token ?? '');
    return want.length > 0 && given.length === want.length && timingSafeEqual(given, want);
  };
  const send = (res, status, body) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };

  return http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'GET' && url.pathname === '/health') {
        studio.db.prepare('SELECT 1').get();
        return send(res, 200, { ok: true, db: 'ok' });
      }
      const ok = authed(req);
      let body = {};
      if (req.method === 'POST') {
        const chunks = []; let size = 0;
        for await (const c of req) { size += c.length; if (size > 1e6) throw new ApiError(413, 'TOO_LARGE', 'Gövde çok büyük'); chunks.push(c); }
        try { body = chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}; } catch { throw new ApiError(400, 'BAD_JSON', 'Geçersiz JSON'); }
      }
      const key = req.headers['idempotency-key'];
      const m = (re) => url.pathname.match(re);
      let r;
      if (req.method === 'POST' && url.pathname === '/projects') {
        if (!ok) throw new ApiError(401, 'UNAUTHORIZED', 'Kimlik doğrulama gerekli');
        r = studio.createProject(body, key);
        return send(res, 201, r);
      }
      let g;
      if (req.method === 'GET' && (g = m(/^\/projects\/([\w-]+)$/))) { if (!ok) throw new ApiError(401, 'UNAUTHORIZED', 'Kimlik doğrulama gerekli'); return send(res, 200, studio.getProject(g[1])); }
      if (req.method === 'GET' && (g = m(/^\/jobs\/([\w-]+)$/))) { if (!ok) throw new ApiError(401, 'UNAUTHORIZED', 'Kimlik doğrulama gerekli'); return send(res, 200, studio.getJob(g[1])); }
      if (req.method === 'POST' && (g = m(/^\/projects\/([\w-]+)\/approve-(script|final|publication)$/))) {
        // Yetkisiz kullanıcı onay veremez (API-05): token yoksa 403.
        return send(res, 200, studio.approve(g[1], g[2], body.hash, 'owner', ok, key));
      }
      if (!ok) throw new ApiError(401, 'UNAUTHORIZED', 'Kimlik doğrulama gerekli');
      if (req.method === 'POST' && (g = m(/^\/projects\/([\w-]+)\/import$/))) return send(res, 201, studio.importAsset(g[1], body, key));
      if (req.method === 'POST' && (g = m(/^\/jobs\/([\w-]+)\/reconcile$/))) return send(res, 200, studio.reconcile(g[1], body.provider_status));
      throw new ApiError(404, 'NOT_FOUND', 'Uç nokta yok');
    } catch (e) {
      const status = e instanceof ApiError ? e.status : 500;
      const msg = e instanceof ApiError ? e.message : 'Sunucu hatası';
      if (!(e instanceof ApiError)) console.error(maskSecrets(e.stack ?? e.message, secrets));
      send(res, status, { error: e.code ?? 'INTERNAL', message: maskSecrets(msg, secrets) });
    }
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const token = process.env.API_TOKEN;
  if (!token) { console.error('API_TOKEN gerekli'); process.exit(1); }
  const studio = openStudio(process.env.DB_PATH ?? 'data/studio.sqlite', {
    dailyBudgetUsd: Number(process.env.DAILY_BUDGET_USD ?? 0), projectBudgetUsd: Number(process.env.PROJECT_BUDGET_USD ?? 0),
  });
  createServer(studio, { token, secrets: [token] }).listen(Number(process.env.PORT ?? 8787), '127.0.0.1', () => console.log('Control API 127.0.0.1 üzerinde'));
}
