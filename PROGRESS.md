# İlerleme (V7 otonom mod) — spec: docs/SPEC_V7.md

| Faz | Durum | Kanıt |
| --- | --- | --- |
| F0 | CONDITIONAL | reports/F00_VPS_AUDIT.md (Linux bulut ölçümü; gerçek VPS/RDP/reboot testleri DEFERRED_QUEUE.md) |
| F2 | PASS | tests/contract/api.test.js — API-01..08 + durum makinesi, 11 test |
| F3 | PASS | tests/integration/render.test.js — 10 test, 60 sn mock MP4 + ffprobe QA (Remotion yerine ffmpeg mock; DECISIONS) |
| F4 | SIRADA | LLM adaptörleri (mock), benchmark seti; canlı benchmark bütçe 0 → SKIPPED |
| F7a, F5, F7b, F6, F8, F9 | BEKLİYOR | |

Çalıştırma: `npm test` (Node ≥22.5, bağımlılıksız: node:sqlite + node:test).
Kararlar: Zod yerine elle doğrulama (bağımlılık yok); Remotion F5'te eklenecek.
Otomatik devam: her 5 saatte bir rutin (kota sıfırlanınca) bu dosyadan sürdürür.
