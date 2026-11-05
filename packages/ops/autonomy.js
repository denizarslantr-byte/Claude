// Otonom mod kontrolleri: kapı doğrulayıcı (temiz klasör), kuyruk, devre kesici, deneme sınırı, hard_deny.
import { execSync } from 'node:child_process';
import { mkdtempSync, appendFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

export const HARD_DENY = ['change_firewall_rdp_vpn_or_account_security', 'touch_other_apps_or_data_on_vps', 'delete_or_overwrite_outside_workspace', 'login_to_social_accounts_or_publish', 'spend_beyond_budget_envelope', 'read_or_log_secrets_in_plain_text', 'automate_google_flow_ui', 'install_software_outside_allowlist', 'permanent_delete_db_or_final_media', 'clone_third_party_voice_without_consent_record'];

/** Git'e işlenmiş içeriği temiz klasöre çıkarıp testleri orada koşar. */
export function cleanRerun(repo = '.', cmd = 'npm test') {
  const tmp = mkdtempSync(path.join(tmpdir(), 'gate-'));
  execSync(`git -C "${repo}" archive HEAD | tar -x -C "${tmp}"`, { stdio: 'ignore' });
  try { execSync(cmd, { cwd: tmp, stdio: 'pipe', timeout: 600000 }); return { status: 'PASS', dir: tmp }; } catch (e) { return { status: 'FAIL', dir: tmp, out: String(e.stdout).slice(-500) }; }
}

export function defer(queueFile, { item, reason, phase, alt, need }) {
  appendFileSync(queueFile, `| ${item} | ${reason} | ${phase} | ${alt} | ${need} |\n`);
}

/** Aksiyon kararı: hard_deny → kuyruğa yazılır, zarf dışı → kuyruğa; bütçe 0 → SKIPPED. */
export function decide(action, { allowed, budgetUsd = 0, paid = false, queueFile }) {
  if (HARD_DENY.includes(action)) { if (queueFile) defer(queueFile, { item: action, reason: 'hard_deny', phase: '-', alt: 'atlandı', need: 'insan kararı' }); return 'DENIED_QUEUED'; }
  if (!allowed.includes(action)) { if (queueFile) defer(queueFile, { item: action, reason: 'zarf dışı', phase: '-', alt: 'mock', need: 'zarf güncelle' }); return 'DEFERRED'; }
  if (paid && !(budgetUsd > 0)) return 'SKIPPED';
  return 'ALLOWED';
}

export class Runner {
  constructor({ maxAttempts = 3, maxConsecutiveFailures = 5 } = {}) { this.max = maxAttempts; this.maxCF = maxConsecutiveFailures; this.cf = 0; this.halted = false; }
  /** Görev en çok 3 kez denenir; sonra BLOCKED. Art arda 5 başarısızlıkta döngü durur. */
  async attempt(task, fn) {
    if (this.halted) return 'HALTED';
    for (let i = 1; i <= this.max; i++) { try { await fn(i); this.cf = 0; return 'DONE'; } catch { this.cf++; if (this.cf >= this.maxCF) { this.halted = true; return 'HALTED'; } } }
    return 'BLOCKED';
  }
}
export const killSwitch = (file = 'STOP') => existsSync(file);
