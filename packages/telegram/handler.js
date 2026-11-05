// Telegram güncellemelerini işler: izinli chat/user, callback dedupe (idempotency), /stop kill switch.
import { writeFileSync } from 'node:fs';
import { ApiError } from '../../apps/control-api/src/core.js';

/** callback_data: "approve:<kind>:<projectId>:<hash>" */
export function handleUpdate(studio, update, { allowedChatId, allowedUserId, stopFile = 'STOP' }) {
  const msg = update.message ?? update.callback_query?.message;
  const from = update.message?.from ?? update.callback_query?.from;
  const chatId = msg?.chat?.id;
  if (String(chatId) !== String(allowedChatId) || (allowedUserId && String(from?.id) !== String(allowedUserId))) {
    studio.audit('telegram', 'rejected.unauthorized', null, { chatId });
    return { ok: false, reason: 'UNAUTHORIZED' };
  }
  if (update.message?.text?.trim() === '/stop') { writeFileSync(stopFile, new Date().toISOString()); studio.audit('telegram', 'kill_switch', null); return { ok: true, action: 'STOP' }; }
  const cb = update.callback_query;
  if (cb) {
    const m = /^approve:(script|final|publication):([\w-]+):([0-9a-f]{64})$/.exec(cb.data ?? '');
    if (!m) return { ok: false, reason: 'BAD_CALLBACK' };
    try {
      const p = studio.approve(m[2], m[1], m[3], `telegram:${from.id}`, true, `tg-cb-${cb.id}`);
      return { ok: true, action: 'APPROVED', status: p.status };
    } catch (e) { if (e instanceof ApiError) return { ok: false, reason: e.code }; throw e; }
  }
  return { ok: true, action: 'IGNORED' };
}

/** Günlük özet: yanıt gerektirmez. */
export function dailyDigest(studio) {
  const c = (sql) => studio.db.prepare(sql).get().c;
  return [`📋 Günlük özet`, `Bekleyen onay: ${c("SELECT COUNT(*) c FROM projects WHERE status LIKE 'WAITING_%' OR status='SCRIPT_REVIEW'")}`,
    `UNKNOWN iş: ${c("SELECT COUNT(*) c FROM jobs WHERE state='UNKNOWN'")}`, `Harcama (USD): ${studio.db.prepare('SELECT COALESCE(SUM(reserved+actual),0) s FROM ledger').get().s.toFixed(2)}`].join('\n');
}
