// 24 görevlik kör benchmark harness'i. Ağırlıklar çalıştırmadan önce sabit; kritik uydurma diskalifiye.
export const WEIGHTS = Object.freeze({ accuracy: 0.35, turkish: 0.25, json: 0.15, cost: 0.15, speed: 0.10 });
export const TASK_SET = [
  ...Array(5).fill('research'), ...Array(5).fill('research'), ...Array(5).fill('script'),
  ...Array(4).fill('seo'), ...Array(3).fill('translate'), ...Array(2).fill('script'),
]; // 5 tarih + 5 bilim + 5 senaryo/director + 4 SEO + 3 çeviri + 2 uzun = 24
export const CATEGORY = ['tarih', 'bilim', 'senaryo_director', 'seo_analitik', 'ceviri', 'uzun_video'];

/** results: {provider: [{schemaOk, criticalFabrication, accuracy(0-1), turkish(0-1), costUsd, latencyMs}] } */
export function scoreProviders(results) {
  const all = Object.values(results).flat();
  const maxCost = Math.max(...all.map((r) => r.costUsd), 1e-9), maxLat = Math.max(...all.map((r) => r.latencyMs), 1);
  const out = Object.entries(results).map(([provider, rs]) => {
    const mean = (f) => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    const disq = rs.some((r) => r.criticalFabrication);
    const s = WEIGHTS.accuracy * mean((r) => r.accuracy) + WEIGHTS.turkish * mean((r) => r.turkish) + WEIGHTS.json * mean((r) => (r.schemaOk ? 1 : 0))
      + WEIGHTS.cost * (1 - mean((r) => r.costUsd) / maxCost) + WEIGHTS.speed * (1 - mean((r) => r.latencyMs) / maxLat);
    return { provider, score: disq ? 0 : Number(s.toFixed(4)), disqualified: disq, schemaPassRate: mean((r) => (r.schemaOk ? 1 : 0)), n: rs.length };
  });
  return out.sort((a, b) => b.score - a.score);
}

/** Kör puanlama için sağlayıcı adlarını karıştırılmış etiketlere çevirir. */
export function blindLabels(providers, seed = 1) {
  let x = seed; const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
  const shuffled = [...providers].sort(() => rnd() - 0.5);
  return Object.fromEntries(shuffled.map((p, i) => [p, `Aday-${String.fromCharCode(65 + i)}`]));
}

export const toCsv = (scores) => ['provider,score,disqualified,schema_pass_rate,n', ...scores.map((s) => `${s.provider},${s.score},${s.disqualified},${s.schemaPassRate.toFixed(2)},${s.n}`)].join('\n') + '\n';

/** Kazananları task_routing'e yazar; diskalifiye veya skor yoksa yazılmaz. */
export function applyRouting(matrix, task, scores) {
  const win = scores.find((s) => !s.disqualified);
  if (win) matrix.task_routing[task] = win.provider;
  return matrix;
}
