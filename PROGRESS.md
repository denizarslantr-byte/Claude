# İlerleme (V7 otonom mod) — spec: docs/SPEC_V7.md

| Faz | Durum | Kanıt |
| --- | --- | --- |
| F0 | CONDITIONAL | reports/F00_VPS_AUDIT.md (Linux bulut ölçümü; gerçek VPS/RDP/reboot testleri DEFERRED_QUEUE.md) |
| F2 | PASS | tests/contract/api.test.js — API-01..08 + durum makinesi, 11 test |
| F3 | PASS | tests/integration/render.test.js — 10 test, 60 sn mock MP4 + ffprobe QA (Remotion yerine ffmpeg mock; DECISIONS) |
| F4 | CONDITIONAL | Teknik testler PASS (10 test: adaptör, router, 24 görev harness, kör etiket, iddia kapısı, jobs.model). Canlı benchmark + gerçek fiyat/model SKIPPED (anahtar yok, bütçe 0) |
| F7a | CONDITIONAL | 6 test PASS: yedek→kayıp→restore, hash/bütünlük, açılışta UNKNOWN kurtarma, disk %90 kesici, STOP dosyası, WAL. Dış yedek hedefi (BACKUP_TARGET) ve reboot/RDP testleri bekliyor |
| F5 | CONDITIONAL | 6 test PASS: TR normalizasyon (40 cümle paketi), mock TTS + ffprobe süre, kelime hizalama, SRT/taşma, Flow importer (yarım/bozuk/yanlış sahne/lisanssız/çözünürlük, kredi kaydı). Canlı TTS, Whisper, Remotion SKIPPED |
| F7b | PASS (teknik) | 6 test: siyah/donuk/sessizlik/kırpılma enjekte hata tespiti, yayın kapısı (QA, iddia, lisans, hash) |
| F6 | CONDITIONAL | 5 test PASS: izinli chat/user, çift callback tek işlem, /stop, n8n JSON (retry kapalı, localhost). Canlı Telegram + n8n kurulumu SKIPPED |
| F8 | CONDITIONAL | 2 test PASS: paket kuralları, onaysız yayın engeli, URL/hash doğrulama. 3 gerçek pilot yayın kanal kapısı (kullanıcı) |
| F9 | CONDITIONAL | 1 test PASS: YPP ilerleme, DATA_UNAVAILABLE/ESTIMATE, başabaş. 7 günlük gerçek veri kanal kapısı |
| AUTO-01..07 | PASS | tests/integration/auto.test.js (temiz klasör kapısı, kill switch, hard_deny, bütçe 0, 3 deneme, 5 hata durdurma, geri alma) |

**Tüm teknik kapılar tamam (64/64 test).** Kalanlar yalnızca dış girdi/kanal: bkz. DEFERRED_QUEUE.md ve RAPOR.md.

Çalıştırma: `npm test` (Node ≥22.5, bağımlılıksız: node:sqlite + node:test).
Kararlar: Zod yerine elle doğrulama (bağımlılık yok); Remotion F5'te eklenecek.
Otomatik devam: her 5 saatte bir rutin (kota sıfırlanınca) bu dosyadan sürdürür.
