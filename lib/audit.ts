// lib/audit.ts
type BaseEvent = {
    ts: string;                 // ISO timestamp
    route: "qa" | "review";
    org: string;                // tenant/org identifier (future-proofed)
    model?: string;
    state?: string;
    docType?: string;
    // QA
    jurisdiction?: string;
    fallback_used?: boolean;
    sources_restricted?: boolean;
    sources_count?: number;
    // Review
    fallback_offered?: "federal" | "none";
    soft_fail?: boolean;
    // Common trust signals
    confidence?: number;
    flags?: string[];           // confidence_flags
    // Error
    ok: boolean;
    err?: string;
  };
  
  export function auditEvent(ev: Omit<BaseEvent, "org" | "ts"> & { ts?: string; org?: string }) {
    const org = ev.org ?? process.env.HR_ORG ?? "default";
    const row: BaseEvent = {
      ts: ev.ts ?? new Date().toISOString(),
      org,
      route: ev.route,
      ok: ev.ok,
      model: ev.model,
      state: ev.state,
      docType: ev.docType,
      jurisdiction: ev.jurisdiction,
      confidence: ev.confidence,
      flags: ev.flags,
      fallback_used: ev.fallback_used,
      sources_restricted: ev.sources_restricted,
      sources_count: ev.sources_count,
      fallback_offered: ev.fallback_offered,
      soft_fail: ev.soft_fail,
      err: ev.err,
    };
  
    // Current sink: console.table (visible during dev)
    // Later: replace with a DB/file sink, e.g., writeNDJSON(row) or insertSupabase(row)
    try {
      console.table([{
        ...row,
        flags: Array.isArray(row.flags) ? row.flags.join(",") : row.flags,
        confidence: typeof row.confidence === "number" ? Number(row.confidence.toFixed(2)) : row.confidence,
      }]);
    } catch {
      // never break the app due to logging
    }
  }
  