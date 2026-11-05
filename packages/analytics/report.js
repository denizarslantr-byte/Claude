// F9: metrik, maliyet ve gelir defteri; YPP ilerlemesi. Veri yoksa DATA_UNAVAILABLE, tahmin ESTIMATE.
export const YPP_NEW = { subs: 1000, watchHours365: 8000, shorts90: 20_000_000, shortsShare90: 10_000_000 };

export function yppProgress({ subs, watchHours365, shorts90 }) {
  const f = (v, t) => (v == null ? 'DATA_UNAVAILABLE' : Number(Math.min(100, (v / t) * 100).toFixed(1)));
  const longPath = Math.min(f(subs, YPP_NEW.subs) === 'DATA_UNAVAILABLE' ? 0 : f(subs, YPP_NEW.subs), 100);
  return { subs_pct: f(subs, YPP_NEW.subs), hours_pct: f(watchHours365, YPP_NEW.watchHours365), shorts_pct: f(shorts90, YPP_NEW.shorts90), note: 'Yollar toplanmaz: biri tam karşılanmalı', longPath };
}

/** entries: {amount, currency, verified, month} */
export function revenueSummary(entries) {
  const sum = (arr) => arr.reduce((a, e) => a + e.amount, 0);
  const verified = entries.filter((e) => e.verified), est = entries.filter((e) => !e.verified);
  return { verified_usd: sum(verified), estimate_usd: sum(est), label: est.length ? 'ESTIMATE_INCLUDED_SEPARATELY' : 'VERIFIED_ONLY' };
}
export function profitability({ revenue, vps = 0, api = 0, tts = 0, stock = 0, other = 0, hours = 0, hourlyRate = 0, videos = 0 }) {
  const net = revenue - (vps + api + tts + stock + other);
  const varCost = videos ? (api + tts + stock) / videos : 0, avgRev = videos ? revenue / videos : 0, contrib = avgRev - varCost;
  return { net, net_with_labor: net - hours * hourlyRate, contribution_per_video: contrib, breakeven_videos: contrib > 0 ? Math.ceil((vps + other) / contrib) : null };
}
export function medianViews(views) { if (!views.length) return 'DATA_UNAVAILABLE'; const s = [...views].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
