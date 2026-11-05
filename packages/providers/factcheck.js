// Kritik iddia kapısı: CONTRADICTED / kritik INSUFFICIENT iddia yayına geçemez; kaynak metni yoksa SUPPORTED sayılmaz.
export function gateClaims(claims) {
  const blockers = claims.filter((c) => c.status === 'CONTRADICTED' || (c.critical && c.status !== 'SUPPORTED') || (c.status === 'SUPPORTED' && !c.source_url));
  return { pass: blockers.length === 0, blockers: blockers.map((c) => c.id) };
}
/** Güvenilmez dış içerikteki talimat kalıplarını işaretler (prompt injection). */
export const looksLikeInjection = (t) => /(ignore (all|previous) instructions|önceki talimatları (yok say|unut)|system prompt|<\s*script)/i.test(t);
