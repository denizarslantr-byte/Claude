// F0: ortam envanteri + 60 sn mock render smoke ölçümü. Çıktı: reports/F00_VPS_AUDIT.md
import os from 'node:os';
import { execSync, spawnSync } from 'node:child_process';
import { writeFileSync, mkdirSync, statfsSync, rmSync } from 'node:fs';

const sh = (c) => { try { return execSync(c, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim(); } catch { return 'YOK'; } };
const fs = statfsSync('.');
const freeGb = ((fs.bavail * fs.bsize) / 1e9).toFixed(1);

mkdirSync('reports', { recursive: true });
const out = 'reports/_smoke.mp4';
const t0 = Date.now();
const r = spawnSync('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc2=size=1080x1920:rate=30', '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000',
  '-t', '60', '-c:v', 'libx264', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-c:a', 'aac', out], { encoding: 'utf8' });
const renderSec = ((Date.now() - t0) / 1000).toFixed(1);
const probe = sh(`ffprobe -v error -show_entries stream=codec_name,width,height:format=duration -of csv=p=0 ${out}`);
rmSync(out, { force: true });

const md = `# F00 — Ortam denetimi (otomatik)

- Tarih: ${new Date().toISOString()}
- Platform: ${os.platform()} ${os.release()} (${os.arch()})
- vCPU: ${os.cpus().length}, RAM: ${(os.totalmem() / 1e9).toFixed(1)} GB
- Boş disk: ${freeGb} GB
- Node: ${process.version}
- FFmpeg: ${sh('ffmpeg -version').split('\n')[0]}
- NVENC/GPU: ${sh('nvidia-smi -L') === 'YOK' ? 'NO_GPU' : sh('nvidia-smi -L')}
- 60 sn 1080x1920 mock render: ${r.status === 0 ? 'OK' : 'FAIL'}, süre ${renderSec} sn
- ffprobe: \`${probe.replace(/\n/g, ' | ')}\`

**Not:** Bu ölçüm geliştirme/CI ortamıdır, Windows VPS değildir. VPS'de aynı betiği çalıştırın; RDP-kapalı ve reboot testleri DEFERRED_QUEUE.md'de.
`;
writeFileSync('reports/F00_VPS_AUDIT.md', md);
console.log(md);
process.exit(r.status === 0 ? 0 : 1);
