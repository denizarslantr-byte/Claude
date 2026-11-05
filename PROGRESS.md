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
| F6, F8, F9 | SIRADA | n8n/Telegram, yayın paketi, analitik |

Çalıştırma: `npm test` (Node ≥22.5, bağımlılıksız: node:sqlite + node:test).
Kararlar: Zod yerine elle doğrulama (bağımlılık yok); Remotion F5'te eklenecek.
Otomatik devam: her 5 saatte bir rutin (kota sıfırlanınca) bu dosyadan sürdürür.
