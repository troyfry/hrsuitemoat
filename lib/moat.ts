const DEFAULT_DOMAINS = [
  "dol.gov","eeoc.gov","oag.ca.gov","dir.ca.gov","lni.wa.gov",
  "ny.gov","mass.gov","azleg.gov","capitol.texas.gov","twc.texas.gov",
  "law.cornell.edu","ohr.dc.gov","illinois.gov","leg.state.fl.us",
];

export const ALLOWED_DOMAINS: string[] = (
  process.env.HR_TRUSTED_DOMAINS?.split(",").map(d => d.trim().toLowerCase()).filter(Boolean)
  ?? DEFAULT_DOMAINS
).map(d => d.replace(/^https?:\/\//, ""));

export function hostnameFromUrl(url: string): string | null {
  try { return new URL(url).hostname.toLowerCase(); } catch { return null; }
}
export function domainAllowed(domain: string): boolean {
  const d = domain.toLowerCase();
  return ALLOWED_DOMAINS.some(allowed => d === allowed || d.endsWith(`.${allowed}`));
}
export function enforceDomainWhitelist<T extends { citations: { url: string; domain: string }[] }>(
  payload: T
): { payload: T; restricted: boolean } {
  const filtered = payload.citations.filter(c => {
    const host = hostnameFromUrl(c.url) || c.domain.toLowerCase();
    return domainAllowed(host);
  });
  const restricted = filtered.length !== payload.citations.length;
  (payload as any).citations = filtered;
  (payload as any).sources_restricted = restricted;
  return { payload, restricted };
}
export function nowIso() { return new Date().toISOString(); }
export function requireDisclaimer(disclaimers: string[]): boolean {
  return disclaimers.some(d => d.toLowerCase().includes("not legal advice"));
}
