# Ertelenen işler kuyruğu

| İş | Neden | Etkilenen faz | Ajanın alternatifi | Kullanıcıdan beklenen |
| --- | --- | --- | --- | --- |
| Windows VPS keşfi (RDP kapalı/reboot testi, NSSM servis) | Ajan Linux bulutunda çalışıyor, VPS erişimi yok | F0 | `scripts/f0-audit.mjs` ile bu ortam ölçüldü; VPS'de aynı betik çalıştırılabilir | VPS'de `npm run audit` çıktısını `reports/` altına koymak |
| Gerçek LLM/TTS/Telegram anahtarları, bütçe > 0 | Girdi paketi yok, bütçe 0 | F4, F5, F6 | Mock sağlayıcı, canlı testler `SKIPPED` | `.env` ve `AUTONOMY_POLICY.yaml` bütçesi |
| Dış yedek hedefi | Tanımsız | F7a | Yerel yedek, `CONDITIONAL` | `BACKUP_TARGET` |
| Canlı LLM adaptörleri + 24 görev benchmark, provider-matrix model/fiyat | Anahtar yok, bütçe 0, fiyat/model F0'da doğrulanmadı | F4 | Mock + harness hazır; routing boş (varsayılan kazanan yok) | API anahtarları, bütçe > 0 |
| Dış yedek hedefi + gerçek reboot/RDP-kapalı testi | BACKUP_TARGET tanımsız, VPS yok | F7a | Yerel yedek+restore testi PASS; dış kopya mantığı test edildi | BACKUP_TARGET, VPS erişimi |
| Canlı TTS karşılaştırması, Whisper/forced alignment, Remotion altyazılı render | TTS anahtarı yok; Python/Whisper ve Remotion kurulumu allowlist'te ama model indirme/ağ gerekir | F5 | Mock TTS, orantılı hizalama, SRT üretimi hazır | TTS anahtarı + ticari hak bilgisi |
| Görsel kare incelemesi (DS-04, 50 kare) | Görsel model anahtarı yok | F7b | ffmpeg tabanlı teknik QA tamam | LLM anahtarı |
| n8n + Telegram canlı kurulum, bot token/chat ID | Token yok, VPS yok | F6 | Handler + workflow JSON test edildi | TELEGRAM_BOT_TOKEN, chat ID |
| 3 gerçek pilot yayın, 7 günlük analitik, gelir | Kanal kapısı (kullanıcı) | F8, F9 | Paket + analitik kodu hazır | Videoları üret/yayınla, URL ve metrik gir |
