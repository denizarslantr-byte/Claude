# Ertelenen işler kuyruğu

| İş | Neden | Etkilenen faz | Ajanın alternatifi | Kullanıcıdan beklenen |
| --- | --- | --- | --- | --- |
| Windows VPS keşfi (RDP kapalı/reboot testi, NSSM servis) | Ajan Linux bulutunda çalışıyor, VPS erişimi yok | F0 | `scripts/f0-audit.mjs` ile bu ortam ölçüldü; VPS'de aynı betik çalıştırılabilir | VPS'de `npm run audit` çıktısını `reports/` altına koymak |
| Gerçek LLM/TTS/Telegram anahtarları, bütçe > 0 | Girdi paketi yok, bütçe 0 | F4, F5, F6 | Mock sağlayıcı, canlı testler `SKIPPED` | `.env` ve `AUTONOMY_POLICY.yaml` bütçesi |
| Dış yedek hedefi | Tanımsız | F7a | Yerel yedek, `CONDITIONAL` | `BACKUP_TARGET` |
