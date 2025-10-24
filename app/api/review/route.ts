// app/api/review/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { ReviewSchemaZ, ReviewSchemaOpenAI } from "@/lib/schemas/review";
import { auditEvent } from "@/lib/audit";

/* -------------------------------------------
   Model / Env
------------------------------------------- */
const MODEL =
  process.env.OPENAI_REVIEW_MODEL ||
  process.env.OPENAI_QA_MODEL ||
  "gpt-4o-mini";
const OPENAI_API_KEY = process.env.OPENAI_API_KEY as string | undefined;

/* -------------------------------------------
   Domain allow-list (whitelist)
------------------------------------------- */
const DEFAULT_DOMAINS = [
  "dol.gov",
  "eeoc.gov",
  "oag.ca.gov",
  "dir.ca.gov",
  "lni.wa.gov",
  "ny.gov",
  "mass.gov",
  "azleg.gov",
  "capitol.texas.gov",
  "twc.texas.gov",
  "law.cornell.edu",
  "ohr.dc.gov",
  "illinois.gov",
  "leg.state.fl.us",
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

/* -------------------------------------------
   Evaluative confidence (Option B)
   - compute dynamic penalties + positive signals
------------------------------------------- */
function isNuancedText(s: string) {
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

function evaluateConfidence(review: {
  confidence: number;
  summary?: string;
  issues?: Array<{ description?: string }>;
  sources?: Array<{ title?: string; domain?: string; url?: string }>;
  fallback_offered?: "federal" | "none";
}) {
  const flags: string[] = [];
  const sources = Array.isArray(review.sources) ? review.sources : [];

  const thin = sources.length < 2;
  if (thin) flags.push("thin_citations");

  // Primary gov if single .gov/.ca.gov/.us
  let isPrimaryGov = false;
  if (sources.length === 1) {
    const first = sources[0] as { url?: unknown; domain?: unknown };
    const urlStr =
      typeof first?.url === "string"
        ? first.url
        : typeof first?.domain === "string"
        ? String(first.domain)
        : "";
    if (urlStr && /(\.gov(?:\.[a-z]{2})?|\.ca\.gov|\.us)(\/|$)/i.test(urlStr)) {
      isPrimaryGov = true;
    }
  }

  const hasStatuteLike = sources.some((s) =>
    /\b(§|cfr|code|stat\.|lab\.|u\.s\.c\.)\b/i.test(
      `${s?.title ?? ""} ${s?.domain ?? ""}`
    )
  );
  if (!hasStatuteLike) flags.push("non_statute");

  const nuanced =
    isNuancedText(review.summary || "") ||
    (Array.isArray(review.issues) &&
      review.issues.some((i) => isNuancedText(i?.description || "")));
  if (nuanced) flags.push("nuance");

  if (review.fallback_offered === "federal") {
    flags.push("fallback");
  }

  // Positive signals
  if (!thin && hasStatuteLike) flags.push("authoritative_sources");
  if (sources.length >= 3) flags.push("multiple_authoritative");

  // Start from model’s reported confidence (clamped)
  let c = Math.max(0, Math.min(1, review.confidence ?? 1));

  // Apply dynamic adjustments (mild penalties/bonuses)
  // Penalties
  if (thin && !isPrimaryGov) c = Math.min(c, 0.78);
  if (!hasStatuteLike) c = Math.min(c, 0.76);
  if (nuanced) c = Math.min(c, 0.74);
  if (review.fallback_offered === "federal") c = Math.min(c, 0.72);

  // Bonuses (don’t exceed 0.90 total to keep humility)
  if (!thin && hasStatuteLike) c = Math.min(0.90, c + 0.03);
  if (sources.length >= 3) c = Math.min(0.90, c + 0.02);

  return { confidence: c, flags };
}

/* -------------------------------------------
   Types
------------------------------------------- */
type ReviewRequestBody = {
  text: string;
  filename?: string;
  state: string; // jurisdiction/state code
  document_type?: string; // optional; passthrough context only
};

/* -------------------------------------------
   Route
------------------------------------------- */
export async function POST(req: Request) {
  try {
    // quick health check
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

    // Support multipart (file upload) AND JSON
    let text: string | undefined;
    let filename: string | undefined;
    let state: string | undefined;
    let document_type: string | undefined;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data")) {
      const form = await req.formData();
      const file = form.get("file");

      state = String(form.get("state") || "");
      document_type = String(form.get("document_type") || "");
      filename =
        (file && typeof file === "object" && "name" in file)
          ? (file as File).name
          : String(form.get("filename") || "document");

      if (!(file instanceof File)) {
        return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
      }

      try {
        const { extractTextFromFile } = await import("@/lib/extractText");
        const out = await extractTextFromFile(file);

        // Allow short samples for TXT/HTML; keep higher bar for PDF/DOCX
        const minLen = out.kind === "txt" || out.kind === "html" ? 5 : 20;
        if (!out.text || out.text.trim().length < minLen) {
          return NextResponse.json(
            {
              error: "Could not extract readable text from the file.",
              hint:
                out.kind === "pdf"
                  ? "If this is a scanned or secured PDF, upload a DOCX/TXT/HTML version or run OCR first."
                  : "Please provide a slightly longer sample or use DOCX/PDF.",
              details: { kind: out.kind, filename },
            },
            { status: 400 }
          );
        }

        text = out.text;
      } catch (ex: any) {
        console.error("[/api/review] extract error:", ex?.stack || ex);
        return NextResponse.json(
          { error: "Failed to extract text from uploaded file.", details: String(ex?.message ?? ex) },
          { status: 400 }
        );
      }
    } else {
      const body = (await req.json()) as ReviewRequestBody;
      text = body.text;
      filename = body.filename || "document";
      state = body.state;
      document_type = body.document_type;
    }

    if (!text || !state) {
      return NextResponse.json(
        { error: "Missing required fields: text, state" },
        { status: 400 }
      );
    }

    const s = String(state).toUpperCase();
    const file = filename || "document";
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
      context: { document_type: document_type ?? null },
    };

    // ---- OpenAI call (strict JSON schema) ----
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
          { role: "user", content: JSON.stringify(userPayload) },
        ],
      }),
    });

    if (!openaiResp.ok) {
      const t = await openaiResp.text().catch(() => "");
      console.error("[/api/review] upstream error:", openaiResp.status, t);
      auditEvent({ route: "review", ok: false, err: `Upstream: ${openaiResp.status}` });
      return NextResponse.json(
        { error: "Model error", details: t.slice(0, 2000) },
        { status: 502 }
      );
    }

    const data = (await openaiResp.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    let raw = data?.choices?.[0]?.message?.content ?? "";

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

    // ---- Zod validation ----
    const result = ReviewSchemaZ.safeParse(parsed);
    if (!result.success) {
      return NextResponse.json(
        { error: "Schema validation failed", issues: result.error.flatten() },
        { status: 422 }
      );
    }

    // ---- Whitelist enforcement ----
    const review = { ...result.data };
    const { restricted, hasAny } = enforceSourceWhitelist(review);

    // If nothing remains after whitelist, return soft-fail guidance
    if (!hasAny) {
      const guidance =
        "I cannot verify this fully from official sources on the approved registry. " +
        "I can check federal baseline guidance or request clarification — would you like me to proceed?";

      const evalResult = evaluateConfidence({
        confidence: Number(review.confidence ?? 0) || 0,
        summary: guidance,
        issues: [],
        sources: [],
        fallback_offered: "federal",
      });

      auditEvent({
        route: "review",
        ok: true,
        model: MODEL,
        state,
        docType: document_type ?? undefined,
        confidence: evalResult.confidence,
        flags: evalResult.flags,
        fallback_offered: "federal",
        soft_fail: true,
        sources_count: 0,
      });

      return NextResponse.json(
        {
          ...review,
          summary: guidance,
          soft_fail: true,
          fallback_offered: "federal",
          sources: [],
          confidence: evalResult.confidence,
          confidence_flags: evalResult.flags, // transparency for UI
        },
        { status: 200 }
      );
    }

    // Ensure disclaimer exists
    const hasDisclaimer =
      Array.isArray(review.disclaimers) &&
      review.disclaimers.some((d) =>
        String(d).toLowerCase().includes("not legal advice")
      );
    if (!hasDisclaimer) {
      review.disclaimers = [
        ...(review.disclaimers ?? []),
        "This is not legal advice.",
      ];
    }

    // Evaluate confidence + attach flags
    const { confidence, flags } = evaluateConfidence({
      confidence: Number(review.confidence ?? 0) || 0,
      summary: review.summary,
      issues: review.issues,
      sources: review.sources,
      fallback_offered: review.fallback_offered,
    });

    auditEvent({
      route: "review",
      ok: true,
      model: MODEL,
      state,
      docType: document_type ?? undefined,
      confidence,
      flags,
      fallback_offered: review.fallback_offered,
      soft_fail: Boolean(review.soft_fail),
      sources_count: Array.isArray(review.sources) ? review.sources.length : 0,
    });

    return NextResponse.json(
      { ...review, confidence, confidence_flags: flags },
      { status: 200 }
    );
  } catch (err: any) {
    console.error("[/api/review] error:", err?.stack || err);
    auditEvent({ route: "review", ok: false, err: String(err?.message ?? err) });
    return NextResponse.json(
      { error: String(err?.message ?? "Unexpected error") },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  if (url.searchParams.get("diag") === "1") {
    return NextResponse.json({ ok: true, route: "review", ts: Date.now() }, { status: 200 });
  }
  return NextResponse.json({ error: "Use POST for this endpoint" }, { status: 405 });
}
