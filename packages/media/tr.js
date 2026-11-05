// Türkçe metin normalizasyonu: sayı → yazı, yüzde, TL, yıl; telaffuz sözlüğü.
const ONES = ['', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz'];
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan'];
export function numToWords(n) {
  if (!Number.isInteger(n) || n < 0) throw new Error('desteklenmeyen sayı');
  if (n === 0) return 'sıfır';
  const grp = (x) => { const h = Math.floor(x / 100), t = Math.floor((x % 100) / 10), o = x % 10; return `${h ? (h === 1 ? '' : ONES[h] + ' ') + 'yüz ' : ''}${TENS[t] ? TENS[t] + ' ' : ''}${ONES[o] ? ONES[o] + ' ' : ''}`; };
  const parts = []; const bil = Math.floor(n / 1e9), mil = Math.floor((n % 1e9) / 1e6), bin = Math.floor((n % 1e6) / 1e3), rest = n % 1e3;
  if (bil) parts.push(grp(bil) + 'milyar'); if (mil) parts.push(grp(mil) + 'milyon');
  if (bin) parts.push((bin === 1 ? '' : grp(bin)) + 'bin'); if (rest) parts.push(grp(rest));
  return parts.join(' ').replace(/\s+/g, ' ').trim();
}
export function normalizeTr(text, dict = {}) {
  let t = text;
  t = t.replace(/%\s?(\d+)(?:,(\d+))?/g, (_, a, b) => `yüzde ${numToWords(+a)}${b ? ' virgül ' + [...b].map((d) => numToWords(+d)).join(' ') : ''}`);
  t = t.replace(/(\d{1,3}(?:\.\d{3})+|\d+)\s?TL/g, (_, a) => `${numToWords(+a.replace(/\./g, ''))} lira`);
  t = t.replace(/(\d+),(\d+)/g, (_, a, b) => `${numToWords(+a)} virgül ${[...b].map((d) => numToWords(+d)).join(' ')}`);
  t = t.replace(/\d{1,3}(?:\.\d{3})+/g, (m) => numToWords(+m.replace(/\./g, '')));
  t = t.replace(/\d+/g, (m) => numToWords(+m));
  for (const [k, v] of Object.entries(dict)) t = t.split(k).join(v);
  return t.replace(/\s+/g, ' ').trim();
}
