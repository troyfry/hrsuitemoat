// app/api/review/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ReviewSchemaZ, ReviewSchemaOpenAI } from "@/lib/schemas/review";
import { logEvent } from "@/lib/telemetry";


/* ─────────────────────────────────────────────────────────────
   Evaluative confidence (dynamic) + flags
   ──────────────────────────────────────────────────────────── */
type RFlag =
  | "nuance"
  | "fallback"
  | "thin_citations"
  | "non_authoritative"
  | "authoritative_sources"
  | "multiple_authoritative"
  | "none";

function textHasNuance(s?: string) {
  const t = (s || "").toLowerCase();
  return (
    t.includes("best practice") ||
    t.includes("not strictly mandated") ||
    t.includes("may be required") ||
    t.includes("depends on") ||
    t.includes("context-specific") ||
    t.includes("generally required") ||
    t.includes("recommended")
  );
}

function isPrimaryGovUrl(u?: string) {
  if (!u) return false;
  return /(\.gov(?:\.[a-z]{2})?|\.ca\.gov|\.us)(\/|$)/i.test(u);
}

function hasStatuteLike(s?: string) {
  return /\b(§|cfr|code|stat\.|lab\.|u\.s\.c\.)\b/i.test(String(s || ""));
}

function evaluateConfidenceReview(review: {
  confidence: number;
  summary?: string;
  issues?: Array<{ description?: string }>;
  sources?: Array<{ url?: string; citation?: string }>;
  legal_citations?: string[];
  fallback_offered?: "federal" | "none";
}) {
  const flags: RFlag[] = [];
  let score = Math.min(Math.max(review.confidence ?? 0, 0), 1);

  const nuanced =
    textHasNuance(review.summary) ||
    (Array.isArray(review.issues) &&
      review.issues.some((i) => textHasNuance(i?.description)));

  const sources = Array.isArray(review.sources) ? review.sources : [];
  const thin = sources.length < 2;

  const anyPrimary = sources.some((s) => isPrimaryGovUrl(s?.url));
  const statuteFromSources = sources.some((s) => hasStatuteLike(s?.citation));
  const statuteFromList = (review.legal_citations || []).some((c) =>
    hasStatuteLike(c)
  );
  const anyAuthoritative = anyPrimary || statuteFromSources || statuteFromList;
  const multiAuthoritative =
    sources.filter((s) => isPrimaryGovUrl(s?.url) || hasStatuteLike(s?.citation))
      .length >= 2;

  // Bonuses
  if (multiAuthoritative) {
    score += 0.10;
    flags.push("multiple_authoritative");
  } else if (anyAuthoritative) {
    score += 0.05;
    flags.push("authoritative_sources");
  }

  // Penalties
  if (review.fallback_offered === "federal") {
    score -= 0.08;
    flags.push("fallback");
  }
  if (thin && !anyAuthoritative) {
    score -= 0.06;
    flags.push("thin_citations");
  }
  if (!anyAuthoritative) {
    score -= 0.05;
    flags.push("non_authoritative");
  }
  if (nuanced) {
    score -= 0.06;
    flags.push("nuance");
  }

  const FINAL_MIN = 0.55;
  const FINAL_MAX = 0.95;
  score = Math.max(FINAL_MIN, Math.min(FINAL_MAX, score));

  if (flags.length === 0) flags.push("none");
  return { confidence: Number(score.toFixed(2)), flags };
}

/* ─────────────────────────────────────────────────────────────
   Models & Env
   ──────────────────────────────────────────────────────────── */
const MODEL =
  process.env.OPENAI_REVIEW_MODEL ||
  process.env.OPENAI_QA_MODEL ||
  "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string | undefined;

/* ─────────────────────────────────────────────────────────────
   Trusted domains (whitelist)
   ──────────────────────────────────────────────────────────── */
const DEFAULT_DOMAINS = [
  "dol.gov",
  "eeoc.gov",
  "dir.ca.gov",
  "law.cornell.edu",
  "ohr.dc.gov",
  "illinois.gov",
  "leg.state.fl.us",
  "ny.gov",
  "mass.gov",
  "azleg.gov",
  "capitol.texas.gov",
  "twc.texas.gov",
  "lni.wa.gov",
];

const ALLOWED_DOMAINS: string[] = (
  process.env.HR_TRUSTED_DOMAINS
    ? process.env.HR_TRUSTED_DOMAINS.split(",")
        .map((d) => d.trim().toLowerCase())
        .filter(Boolean)
    : DEFAULT_DOMAINS
).map((d) => d.replace(/^https?:\/\//, ""));

function hostnameFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return null;
  }
}

function domainAllowed(domain: string): boolean {
  const d = domain.toLowerCase();
  return ALLOWED_DOMAINS.some(
    (allowed) => d === allowed || d.endsWith(`.${allowed}`)
  );
}

function enforceSourceWhitelist(review: any) {
  const sources = Array.isArray(review.sources) ? review.sources : [];
  const filtered = sources.filter((s: any) => {
    const host = hostnameFromUrl(String(s.url || "")) || "";
    return domainAllowed(host);
  });
  const restricted = filtered.length !== sources.length;
  review.sources = filtered;
  return { restricted, hasAny: filtered.length > 0 };
}

/* ─────────────────────────────────────────────────────────────
   Route types
   ──────────────────────────────────────────────────────────── */
type ReviewRequestBody = {
  text: string;
  filename?: string;
  state: string;
  document_type?: string; // prompt-time context only
};

/* ─────────────────────────────────────────────────────────────
   Handler
   ──────────────────────────────────────────────────────────── */
export async function POST(req: Request) {
  try {
    // Health diag
    const url = new URL(req.url);
    if (url.searchParams.get("diag") === "1") {
      return NextResponse.json(
        { ok: true, route: "review", ts: Date.now() },
        { status: 200 }
      );
    }

    if (!OPENAI_API_KEY) {
      console.error("[/api/review] OPENAI_API_KEY missing");
      return NextResponse.json({ error: "OPENAI_API_KEY missing" }, { status: 500 });
    }

    const { text, filename, state, document_type } =
      (await req.json()) as ReviewRequestBody;

    if (!text || !state) {
      return NextResponse.json(
        { error: "Missing required fields: text, state" },
        { status: 400 }
      );
    }

    const s = String(state).toUpperCase();
    const file = filename || "document";

    // System prompt (shows the curated whitelist to the model)
    const allowedTextBlock = ALLOWED_DOMAINS.map((d) => `- *.${d}`).join("\n");
    const systemPrompt = `
You are "State Of HR GPT" performing an HR compliance document review.

TONE & SCOPE
- Tone: professional / enterprise, advisory.
- Include a brief disclaimer that this is not legal advice (inside JSON field only).
- Scope findings to the user's jurisdiction when provided.

SOURCE POLICY (STRICT)
- Cite ONLY from this domain allow-list (primary government/official sources):
${allowedTextBlock}
- Prefer primary sources (statutes, regs, official agency pages).
- Link to the most specific page relevant to the finding (not just a homepage).
- Include at least one usable source (name + url) with ISO8601 "accessed_at".

OUTPUT POLICY (ReviewSchema.v1 ONLY)
- Produce a concise "summary" of the document's compliance posture.
- Set "overall_risk" realistically (low/medium/high) and "confidence" 0–1.
- Populate "issues[]" with short titles, explanations, severity, and "related_statutes" when applicable.
- Add real legal citations (e.g., "29 CFR § 785.18", "Cal. Lab. Code § 226.7").
- If not enough authority is available, return a soft-fail with guidance.
Return ONLY JSON matching ReviewSchema.v1; no prose outside JSON.
`.trim();

    const userPayload = {
      jurisdiction: s,
      filename: file,
      document_text: text,
      context: { document_type: document_type ?? null }, // prompt hint only
    };

    // OpenAI call with strict schema
    const openaiResp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        temperature: 0.1,
        max_tokens: 1400,
        response_format: { type: "json_schema", json_schema: ReviewSchemaOpenAI },
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: JSON.stringify(userPayload),
          },
        ],
      }),
    });

    if (!openaiResp.ok) {
      const t = await openaiResp.text().catch(() => "");
      console.error("[/api/review] upstream error:", openaiResp.status, t);
      return NextResponse.json(
        { error: "Model error", details: t.slice(0, 2000) },
        { status: 502 }
      );
    }

    const data = (await openaiResp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = data?.choices?.[0]?.message?.content ?? "";

    // Unfence ```json
    if (typeof raw === "string" && raw.startsWith("```")) {
      raw = raw.replace(/^```(?:json)?\n?/, "").replace(/```$/, "");
    }

    let parsed: unknown;
    try {
      parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    } catch {
      return NextResponse.json(
        { error: "Upstream returned non-JSON content", raw },
        { status: 502 }
      );
    }
    
    // Zod validation
    const result = ReviewSchemaZ.safeParse(parsed);
    if (!result.success) {
      logEvent({
        ts: new Date().toISOString(),
        route: "review",
        state,
        docType: document_type ?? undefined,
        jurisdiction: undefined,
        confidence: undefined,
        flags: undefined,
        sources_restricted: undefined,
        fallback_used: undefined,
        fallback_offered: undefined,
        ok: false,
        err: "Schema validation failed",
      });
      return NextResponse.json(
        { error: "Schema validation failed", issues: result.error.flatten() },
        { status: 422 }
      );
    }

    

    // Whitelist enforcement
    const review = { ...result.data };
    const { restricted, hasAny } = enforceSourceWhitelist(review);

    // If nothing remains after whitelist, soft-fail with guidance
    if (!hasAny) {
      const guidance =
        "I cannot verify this fully from official sources on the approved registry. " +
        "I can check federal baseline guidance or request clarification — would you like me to proceed?";

      // Evaluative confidence + flags (even on soft-fail)
      const evalResult = evaluateConfidenceReview({
        confidence: review.confidence,
        summary: review.summary,
        issues: review.issues,
        sources: review.sources,
        legal_citations: review.legal_citations,
        fallback_offered: "federal",
      });

      logEvent({
        ts: new Date().toISOString(),
        route: "review",
        state,
        docType: document_type ?? undefined,
        jurisdiction: undefined,
        confidence: evalResult.confidence,
        flags: evalResult.flags,
        sources_restricted: undefined,
        fallback_used: undefined,
        fallback_offered: "federal",
        ok: true,
      });
      
      

      return NextResponse.json(
        {
          ...review,
          summary: guidance,
          soft_fail: true,
          fallback_offered: "federal",
          sources: [],
          confidence: evalResult.confidence,
          // attach transparency (outside schema)
          confidence_flags: evalResult.flags,
        } as any,
        { status: 200 }
      );
    }

    // Ensure disclaimers exist
    const hasDisclaimer =
      Array.isArray(review.disclaimers) &&
      review.disclaimers.some((d: unknown) =>
        String(d).toLowerCase().includes("not legal advice")
      );
    if (!hasDisclaimer) {
      review.disclaimers = [
        ...(review.disclaimers ?? []),
        "This is not legal advice.",
      ];
    }

    // Evaluative confidence + flags (normal path)
    const { confidence, flags } = evaluateConfidenceReview(review);
    review.confidence = confidence;

    return NextResponse.json(
      {
        ...review,
        // attach transparency (outside schema)
        confidence_flags: flags,
      } as any,
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[/api/review] error:", err?.stack || err);
    logEvent({
      ts: new Date().toISOString(),
      route: "review",
      state: undefined,
      docType: undefined,
      jurisdiction: undefined,
      confidence: undefined,
      flags: undefined,
      sources_restricted: undefined,
      fallback_used: undefined,
      fallback_offered: undefined,
      ok: false,
      err: err?.message || "Review processing failed",
    });
    return NextResponse.json(
      { error: "Unexpected error", details: String(err?.message ?? err) },
      { status: 500 }
    );
  }
}
