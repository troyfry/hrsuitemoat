// app/api/qa/route.ts
export const runtime = "nodejs";

import { NextResponse } from "next/server";
import { getOpenAIKey, QA_MODEL } from "@/lib/openai";
import { enforceDomainWhitelist, nowIso, requireDisclaimer } from "@/lib/moat";
import { QASchemaZ, QASchemaOpenAI } from "@/lib/schemas/qa";
import { logEvent } from "@/lib/telemetry";

// ─────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────
const ALLOWED_DOCUMENT_TYPES = [
  "policy_or_handbook",
  "termination_or_warning_letter",
  "offer_or_onboarding_letter",
  "corrective_action_memo",
  "general_hr_correspondence",
] as const;
type AllowedDocumentType = (typeof ALLOWED_DOCUMENT_TYPES)[number];

type QARequestBody = {
  state: string;
  question: string;
  context?: string;
  document_type: AllowedDocumentType | string;
};

// ─────────────────────────────────────────────────────────────
// Prompts
// ─────────────────────────────────────────────────────────────
function systemPrompt(
  state: string,
  document_type: string,
  allowedDomainsText: string
) {
  return `
You are an HR compliance expert for ${state}.

STRICT RULES (MOAT):
- This is NOT legal advice — include the disclaimer *only inside the JSON field*.
- The document_type is AUTHORITATIVE. Do NOT infer or override it.
- document_type = ${document_type}
- Answer ONLY within that document type's scope.
- Cite ONLY from the approved domain allow-list (server enforced & shown below).
Tone & Bias Checks (mandatory):
• Detect emotional, accusatory, biased, or unprofessional language.
• Ensure neutral, compliant HR-safe tone — no opinions, threats, defensiveness, or blame.
• Output MUST explicitly state whether tone is compliant or risky.
- Output must be valid JSON per QASchema.v1. No prose outside JSON.
- If a practice is recommended but not legally mandatory, say:
  "This is a best practice and not strictly mandated by law."
- Do NOT claim something is "required by law" unless unambiguously mandated.
- If nuance exists, state the conditions.
- Lower confidence below 0.75 when there is nuance/interpretation.

ALLOWED DOMAINS (primary / official):
${allowedDomainsText}
`.trim();
}

function userPrompt(args: {
  state: string;
  question: string;
  jurisdiction: "state" | "federal";
  context?: string;
  document_type: string;
}) {
  const { state, question, jurisdiction, context, document_type } = args;
  return `
State: ${state}
Jurisdiction to answer under: ${jurisdiction.toUpperCase()}
Document Type (authoritative): ${document_type}
Question: ${question}
${context ? `Context: ${context}` : ""}

Return JSON ONLY that conforms exactly to QASchema.v1 (strict). No extra text.
`.trim();
}

// Human-readable allow-list for the system prompt
function domainsText(): string {
  const domains =
    process.env.HR_TRUSTED_DOMAINS?.split(",")
      .map((d) => d.trim())
      .filter(Boolean) ?? [];
  const list = domains.length
    ? domains
    : [
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
  return list.map((d) => `- *.${d.replace(/^https?:\/\//, "")}`).join("\n");
}

// ─────────────────────────────────────────────────────────────
// Evaluative confidence (dynamic) + flags
// ─────────────────────────────────────────────────────────────
type Flag =
  | "nuance"
  | "fallback"
  | "thin_citations"
  | "non_authoritative"
  | "authoritative_sources"
  | "multiple_authoritative"
  | "speculative_query"
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

function isPrimaryGov(u?: string) {
  if (!u) return false;
  return /(\.gov(?:\.[a-z]{2})?|\.ca\.gov|\.us)(\/|$)/i.test(u);
}

function hasStatuteLikeSignal(title?: string, domain?: string) {
  const s = `${title ?? ""} ${domain ?? ""}`;
  return /\b(§|cfr|code|stat\.|lab\.|u\.s\.c\.)\b/i.test(s);
}

/**
 * Evaluative scoring:
 * - Start with model-provided confidence (clamped 0..1)
 * - Add bonuses for authoritative sourcing
 * - Subtract for thin/non-authoritative/nuance/fallback/speculative
 * - Final clamp to [0.55..0.95] to keep UX stable
 * - Emit confidence_flags detailing what influenced the score
 */
function evaluateConfidence(qa: {
  confidence: number;
  question?: string;
  answer?: string;
  key_points?: string[];
  citations?: Array<{ title?: string; url?: string; domain?: string }>;
  fallback_used?: boolean;
}) {
  const flags: Flag[] = [];

  // Base from model
  let score = Math.min(Math.max(qa.confidence ?? 0, 0), 1);

  const nuanced =
    textHasNuance(qa.answer) ||
    (Array.isArray(qa.key_points) && qa.key_points.some(textHasNuance));

  const citations = Array.isArray(qa.citations) ? qa.citations : [];
  const thin = citations.length < 2;

  const authoritative = citations.filter((c) => {
    const u = (c?.url || c?.domain || "").toString();
    return isPrimaryGov(u) || hasStatuteLikeSignal(c?.title, c?.domain);
  });
  const anyAuthoritative = authoritative.length >= 1;
  const multiAuthoritative = authoritative.length >= 2;

  // Speculative language in the original question
  const q = (qa.question || "").toLowerCase();
  const speculative =
    /\b(reddit|blog|forum|i read online|someone said|tiktok|youtube)\b/i.test(q);

  // Bonuses
  if (multiAuthoritative) {
    score += 0.10;
    flags.push("multiple_authoritative");
  } else if (anyAuthoritative) {
    score += 0.05;
    flags.push("authoritative_sources");
  }

  // Penalties
  if (qa.fallback_used) {
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
  if (speculative && !multiAuthoritative) {
    score -= 0.04;
    flags.push("speculative_query");
  }

  // Clamp to a sane band so UX feels consistent
  // (you can widen later once you’re happy with behavior)
  const FINAL_MIN = 0.55;
  const FINAL_MAX = 0.95;
  score = Math.max(FINAL_MIN, Math.min(FINAL_MAX, score));

  if (flags.length === 0) flags.push("none");

  return { confidence: Number(score.toFixed(2)), flags };
}

// ─────────────────────────────────────────────────────────────
// Single call to OpenAI with schema + moat
// ─────────────────────────────────────────────────────────────
async function callOnce(args: {
  state: string;
  question: string;
  context?: string;
  document_type: string;
  jurisdiction: "state" | "federal";
}) {
  const apiKey = getOpenAIKey();

  const resp = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: QA_MODEL,
      temperature: 0.2,
      response_format: { type: "json_schema", json_schema: QASchemaOpenAI },
      messages: [
        {
          role: "system",
          content: systemPrompt(args.state, args.document_type, domainsText()),
        },
        { role: "user", content: userPrompt(args) },
      ],
    }),
  });

  if (!resp.ok) {
    const t = await resp.text().catch(() => "");
    throw new Error(`OpenAI error ${resp.status}: ${t.slice(0, 600)}`);
  }

  const data = await resp.json();
  let raw = data?.choices?.[0]?.message?.content ?? "{}";

  // Tolerate ```json fences
  if (typeof raw === "string" && raw.startsWith("```")) {
    raw = raw.replace(/^```(?:json)?\n?/, "").replace(/```$/, "");
  }

  let parsed: any;
  try {
    parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch {
    throw new Error("OpenAI returned non-JSON content");
  }

  // Normalize + fill metadata we control authoritatively
  parsed.version = "QASchema.v1";
  parsed.state = args.state;
  parsed.jurisdiction = args.jurisdiction;
  parsed.question = args.question;
  parsed.generated_at = nowIso();
  parsed.model = QA_MODEL;
  parsed.fallback_used = Boolean(parsed.fallback_used);

  // Zod validation (hard fail if malformed)
  const safe = QASchemaZ.parse(parsed);

  // Enforce trusted domains; mark sources_restricted
  const { payload, restricted } = enforceDomainWhitelist(safe);
  payload.sources_restricted = restricted;

  // Evaluative confidence + transparent flags
  const { confidence, flags } = evaluateConfidence({
    confidence: payload.confidence,
    question: payload.question,
    answer: payload.answer,
    key_points: payload.key_points,
    citations: payload.citations,
    fallback_used: payload.fallback_used,
  });
  payload.confidence = confidence;
  (payload as any).confidence_flags = flags;

  // Disclaimer must include “not legal advice”
  if (!requireDisclaimer(payload.disclaimers)) {
    throw new Error(
      "Disclaimer requirement failed: Must include 'not legal advice'."
    );
  }

  return payload;
}

// ─────────────────────────────────────────────────────────────
// Route handler
// ─────────────────────────────────────────────────────────────
export async function POST(req: Request) {
  try {
    // Quick health diag
    const url = new URL(req.url);
    if (url.searchParams.get("diag") === "1") {
      return NextResponse.json(
        { ok: true, route: "qa", ts: Date.now() },
        { status: 200 }
      );
    }

    const { state, question, context, document_type } =
      (await req.json()) as QARequestBody;

    // Fast input checks
    if (!state || !question) {
      return NextResponse.json(
        { error: "state and question are required" },
        { status: 400 }
      );
    }
    if (!document_type) {
      return NextResponse.json(
        { error: "document_type missing" },
        { status: 400 }
      );
    }
    if (!ALLOWED_DOCUMENT_TYPES.includes(document_type as AllowedDocumentType)) {
      return NextResponse.json(
        {
          error: `Invalid document_type. Allowed: ${ALLOWED_DOCUMENT_TYPES.join(
            ", "
          )}`,
        },
        { status: 400 }
      );
    }

    // Try state-level first
    let result = await callOnce({
      state,
      question,
      context,
      document_type,
      jurisdiction: "state",
    });

    // If no trusted citations remain, try federal fallback
    if (!Array.isArray(result.citations) || result.citations.length === 0) {
      const fed = await callOnce({
        state,
        question,
        context,
        document_type,
        jurisdiction: "federal",
      });
      fed.fallback_used = true;
      result = fed;
    }

    // Still nothing? Return a structured error (no free text)
    if (!result.citations || result.citations.length === 0) {
      return NextResponse.json(
        {
          error:
            "No trusted citations available for this query at the moment. Try narrowing the topic or rephrasing.",
        },
        { status: 502 }
      );
    }

    logEvent({
      ts: new Date().toISOString(),
      route: "qa",
      state,
      docType: document_type,
      jurisdiction: result.jurisdiction,
      confidence: result.confidence,
      flags: (result as any).confidence_flags,
      sources_restricted: Boolean(result.sources_restricted),
      fallback_used: Boolean(result.fallback_used),
      ok: true,
    });
    

    return NextResponse.json(result, { status: 200 });
  } catch (e: any) {
    console.error("[/api/qa] error:", e?.stack || e);
    logEvent({
      ts: new Date().toISOString(),
      route: "qa",
      state: undefined,
      docType: undefined,
      jurisdiction: undefined,
      confidence: undefined,
      flags: undefined,
      sources_restricted: undefined,
      fallback_used: undefined,
      ok: false,
      err: e?.message || "QA processing failed",
    });
    
    return NextResponse.json(
      { error: e?.message || "QA processing failed" },
      { status: 500 }
    );
  }
}
