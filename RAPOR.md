# AI Video Studio V7 — Uygulama Raporu

**Tarih:** 05.11.2026 · **Dal:** `ccr-eed0d143-jl8qnl` · **Spec:** `docs/SPEC_V7.md`
**Test durumu:** `npm test` → 64/64 PASS (Node ≥22.5, bağımlılıksız)

## 1. Tamamlanan fazlar

| Faz | Durum | Ne yapıldı | Kanıt |
| --- | --- | --- | --- |
| F0 | CONDITIONAL | Ortam denetim betiği (`scripts/f0-audit.mjs`), 60 sn mock render ölçümü: 4 vCPU, GPU yok, 13,5 sn | `reports/F00_VPS_AUDIT.md` |
| F2 | PASS | SQLite (6 tablo + idempotency + audit), durum makinesi, bütçe rezervasyonu, hash onayları, Control API (127.0.0.1, bearer token) | `tests/contract/api.test.js` — API-01..08 + 3 ek |
| F3 | PASS | Render worker: timeline doğrulama, ffmpeg ile 1080×1920 H.264/AAC, ffprobe QA, atomik final + sha256 | `tests/integration/render.test.js` — 10 test |
| F4 | CONDITIONAL | LLM soyutlaması (mock + canlı iskelet), 24 görevlik benchmark harness (sabit ağırlık, kör etiket, uydurma = diskalifiye), kritik iddia kapısı, prompt injection işareti, `jobs.model` kaydı | `tests/unit/providers.test.js` — 10 test |
| F7a | CONDITIONAL | Yedek (VACUUM INTO + bütünlük + hash), restore, açılışta yarım işleri UNKNOWN yapma, disk %90 kesici, STOP dosyası | `tests/integration/ops.test.js` — 6 test |

Otomasyon: her 5 saatte bir rutin bu oturumu `PROGRESS.md`'den devam ettirir (kota sıfırlanma sonrası otomatik başlama için).

## 2. Kalan işler

### Yazılım fazları (sıra)
1. **F5** — Türkçe TTS karşılaştırması (40 cümle), Whisper/forced alignment, Flow manuel importer (hash/lisans/kredi kaydı), Remotion + altyazı
2. **F7b** — teknik/olgusal QA, kritik iddia kontrolü, UNKNOWN uzlaştırma, görsel kare incelemesi, disk/arıza testleri
3. **F6** — n8n + Telegram (izinli kullanıcı onayı, çift callback tek işlem)
4. **F8** — yayın paketi (3 başlık, açıklama, AI etiketi, hash onaylı), en az 3 gerçek manuel pilot yayın
5. **F9** — analitik, maliyet, gelir panosu, YPP ilerleme göstergesi
6. **AUTO-01..07** testleri (kapı doğrulayıcı, kill switch, kuyruk, devre kesici, geri alma)
7. Koşullu/opsiyonel: F10 uzun video, F11 çoklu dil

### Senden beklenenler (`DEFERRED_QUEUE.md`)
- API anahtarları: Gemini, Claude, DeepSeek, TTS, Telegram bot token + chat ID (`.env`)
- `AUTONOMY_POLICY.yaml` içinde bütçe > 0 (şu an 0 → canlı çağrılar SKIPPED)
- `BACKUP_TARGET` (dış yedek hedefi)
- Windows VPS'de `npm run audit` çıktısı; RDP kapalı/reboot/NSSM servis testleri (ajan Linux bulutta, VPS erişimi yok)
- Model adı/fiyat/bölge doğrulaması (provider-matrix.json'da şimdilik boş)
- İçerik hattı (Hat A): niş, 10 rakip analizi, ilk Shorts videoları, 3 gerçek yayın, 7 günlük metrik

### Açık teknik notlar
- Canlı LLM adaptörleri henüz yazılmadı (anahtar gelince eklenecek); `task_routing` boş — benchmark yapılmadan kazanan yok.
- Faz etiketleri (`phase-F02-pass`, `phase-F03-pass`, `phase-F04-cond`, `phase-F07a-cond`) yalnızca yerelde; etiket push'u bağlantı hatasıyla başarısız. Dal push'u çalışıyor.
- Remotion henüz kurulmadı; render şimdilik ffmpeg mock.
- Zod yerine elle doğrulama, YAML yerine JSON kullanıldı (`docs/DECISIONS.md`).
- Gerçek MVP kabulü için kanal koşulları (3 yayın, 7 günlük veri) ve açık dış doğrulamalar kapanmalı.

## 3. Güncelleme (devam turu)
F5, F7b, F6, F8, F9 ve AUTO-01..07 yazıldı; 64/64 test geçiyor. Hepsi mock/yerel doğrulandı.
Kalan **yalnızca dış girdi ve kanal** işleri: canlı API anahtarları + bütçe, TTS/Whisper/Remotion kurulumu, Telegram bot + n8n kurulumu (VPS), dış yedek hedefi, gerçek VPS testleri, 3 gerçek pilot yayın ve 7 günlük metrik. Ayrıntı: `DEFERRED_QUEUE.md`.
