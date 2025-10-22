// app/test/page.tsx
"use client";

import React from "react";
import { TrustPanel } from "../../components/TrustPanel";
import { TrustBadge } from "../../components/TrustBadge";


type QARequest = {
  state: string;
  question: string;
  context?: string;
  document_type: string;
};

type QACitation = { title?: string; url?: string; domain?: string };
type QAResponse = {
  version: "QASchema.v1";
  state: string;
  jurisdiction: "state" | "federal";
  question: string;
  answer: string;
  key_points: string[];
  risk_level: "low" | "medium" | "high";
  actions: string[];
  citations: QACitation[];
  disclaimers: string[];
  compliance_notes: string[];
  sources_restricted: boolean;
  fallback_used: boolean;
  confidence: number;
  generated_at: string;
  model: string;
  // transparency
  confidence_flags?: string[];
};

type ReviewSource = { name: string; url: string; citation: string; accessed_at: string };
type ReviewIssue = {
  section?: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  related_statutes: string[];
};
type ReviewResponse = {
  schema_version: "ReviewSchema.v1";
  jurisdiction: string;
  filename: string;
  summary: string;
  overall_risk: "low" | "medium" | "high";
  issues: ReviewIssue[];
  legal_citations: string[];
  sources: ReviewSource[];
  disclaimers: string[];
  confidence: number;
  soft_fail: boolean;
  fallback_offered: "federal" | "none";
  // transparency
  confidence_flags?: string[];
};

function Badge({
  children,
  tone = "neutral",
  title,
}: {
  children: React.ReactNode;
  tone?: "neutral" | "good" | "warn" | "bad" | "info";
  title?: string;
}) {
  const palette =
    tone === "good"
      ? "bg-emerald-50 text-emerald-700 ring-emerald-200"
      : tone === "warn"
      ? "bg-amber-50 text-amber-700 ring-amber-200"
      : tone === "bad"
      ? "bg-rose-50 text-rose-700 ring-rose-200"
      : tone === "info"
      ? "bg-blue-50 text-blue-700 ring-blue-200"
      : "bg-slate-50 text-slate-700 ring-slate-200";
  return (
    <span
      title={title}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ring-1 ${palette}`}
    >
      {children}
    </span>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-12 gap-3">
      <div className="col-span-3 text-sm text-slate-500 pt-2">{label}</div>
      <div className="col-span-9">{children}</div>
    </div>
  );
}

function flagTone(flag: string): "good" | "warn" | "bad" | "info" | "neutral" {
  const f = flag.toLowerCase();
  if (f === "multiple_authoritative" || f === "authoritative_sources") return "good";
  if (f === "nuance") return "warn";
  if (f === "fallback" || f === "non_authoritative" || f === "thin_citations") return "bad";
  if (f === "speculative_query") return "warn";
  return "neutral";
}

export default function TestPage() {
  const [qaReq, setQaReq] = React.useState<QARequest>({
    state: "CA",
    question: "Do we need meal breaks for 6-hour shifts?",
    document_type: "policy_or_handbook",
  });
  const [qaRes, setQaRes] = React.useState<QAResponse | null>(null);
  const [qaLoading, setQaLoading] = React.useState(false);
  const [qaErr, setQaErr] = React.useState<string | null>(null);

  const [revText, setRevText] = React.useState(
    "Acme policy excerpt: Non-exempt employees scheduled for six hours receive a 30-minute unpaid meal period that may be waived by mutual consent..."
  );
  const [revState, setRevState] = React.useState("CA");
  const [revDocType, setRevDocType] = React.useState("policy_or_handbook");
  const [revFilename, setRevFilename] = React.useState("acme_policy.pdf");
  const [revRes, setRevRes] = React.useState<ReviewResponse | null>(null);
  const [revLoading, setRevLoading] = React.useState(false);
  const [revErr, setRevErr] = React.useState<string | null>(null);

  async function runQA(e: React.FormEvent) {
    e.preventDefault();
    setQaErr(null);
    setQaRes(null);
    setQaLoading(true);
    try {
      const r = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(qaReq),
      });
      const body = await r.json();
      if (!r.ok) throw new Error(body?.error || "Bad response");
      setQaRes(body as QAResponse);
    } catch (err: any) {
      setQaErr(String(err?.message || err));
    } finally {
      setQaLoading(false);
    }
  }

  async function runReview(e: React.FormEvent) {
    e.preventDefault();
    setRevErr(null);
    setRevRes(null);
    setRevLoading(true);
    try {
      const r = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: revText,
          state: revState,
          filename: revFilename,
          document_type: revDocType,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        const msg =
          (body && (body.details || body.error)) ||
          `${r.status} ${r.statusText}`;
        throw new Error(msg);
      }
      setRevRes(body as ReviewResponse);
    } catch (err: any) {
      setRevErr(String(err?.message || err));
    } finally {
      setRevLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-12">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">HR Suite — API Test Console</h1>
        <p className="text-sm text-slate-600">
          Quick harness to exercise <code>/api/qa</code> and <code>/api/review</code> with visible
          moat signals (confidence, fallback, source restrictions, flags).
        </p>
      </header>

      {/* QA PANEL */}
      <section className="rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold">QA Endpoint</h2>
        <form onSubmit={runQA} className="space-y-4">
          <Row label="State">
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={qaReq.state}
              onChange={(e) => setQaReq({ ...qaReq, state: e.target.value })}
              placeholder="CA"
              required
            />
          </Row>
          <Row label="Document Type">
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={qaReq.document_type}
              onChange={(e) => setQaReq({ ...qaReq, document_type: e.target.value })}
            >
              <option>policy_or_handbook</option>
              <option>termination_or_warning_letter</option>
              <option>offer_or_onboarding_letter</option>
              <option>corrective_action_memo</option>
              <option>general_hr_correspondence</option>
            </select>
          </Row>
          <Row label="Question">
            <textarea
              className="w-full rounded-lg border px-3 py-2 min-h-[80px]"
              value={qaReq.question}
              onChange={(e) => setQaReq({ ...qaReq, question: e.target.value })}
              placeholder="Ask a clear, scoped HR compliance question…"
              required
            />
          </Row>
          <Row label="Context (optional)">
            <textarea
              className="w-full rounded-lg border px-3 py-2 min-h-[60px]"
              value={qaReq.context || ""}
              onChange={(e) => setQaReq({ ...qaReq, context: e.target.value })}
              placeholder="Extra doc or scenario context…"
            />
          </Row>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={qaLoading}
              className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {qaLoading ? "Running…" : "Run QA"}
            </button>
            {qaErr && <span className="text-sm text-rose-600">{qaErr}</span>}
          </div>
        </form>

        {qaRes && (
          <div className="mt-4 space-y-3">
            <TrustPanel
  confidence={qaRes.confidence}
  flags={qaRes.confidence_flags}
  extras={[
    { label: "fallback_used", value: qaRes.fallback_used, tone: qaRes.fallback_used ? "warn" : "neutral" },
    { label: "sources_restricted", value: qaRes.sources_restricted, tone: qaRes.sources_restricted ? "warn" : "neutral" },
  ]}
/>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 lg:col-span-7 space-y-2">
                <h3 className="font-medium">Answer</h3>
                <div className="rounded-lg border bg-white p-3 text-sm whitespace-pre-wrap">
                  {qaRes.answer}
                </div>

                {/* Inline trust badges under the answer */}
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                      {/* flags */}
                      {qaRes.confidence_flags?.map((f, i) => (
                        <TrustBadge key={i} tone={flagTone(f)} title={`signal: ${f}`}>
                          {f}
                        </TrustBadge>
                      ))}
                      {/* extras */}
                      <TrustBadge tone={qaRes.fallback_used ? "warn" : "neutral"}>
                        fallback_used: {String(qaRes.fallback_used)}
                      </TrustBadge>
                      <TrustBadge tone={qaRes.sources_restricted ? "warn" : "neutral"}>
                        sources_restricted: {String(qaRes.sources_restricted)}
                      </TrustBadge>
                    </div>


                <h3 className="font-medium mt-4">Key Points</h3>
                <ul className="list-disc pl-5 text-sm">
                  {qaRes.key_points.map((k, i) => (
                    <li key={i}>{k}</li>
                  ))}
                </ul>

                <h3 className="font-medium mt-4">Actions</h3>
                <ul className="list-decimal pl-5 text-sm">
                  {qaRes.actions.map((a, i) => (
                    <li key={i}>{a}</li>
                  ))}
                </ul>
              </div>

              <div className="col-span-12 lg:col-span-5 space-y-3">
                <h3 className="font-medium">Citations</h3>
                <ul className="space-y-2">
                  {qaRes.citations.map((c, i) => (
                    <li key={i} className="rounded-lg border bg-white p-3 text-sm">
                      <div className="font-medium">{c.title || c.domain}</div>
                      {c.url && (
                        <a
                          href={c.url}
                          target="_blank"
                          className="text-blue-600 hover:underline break-all"
                        >
                          {c.url}
                        </a>
                      )}
                      {c.domain && <div className="text-slate-500">{c.domain}</div>}
                    </li>
                  ))}
                </ul>

                <h3 className="font-medium mt-4">Disclaimers</h3>
                <ul className="list-disc pl-5 text-xs text-slate-600">
                  {qaRes.disclaimers.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-slate-600">Raw JSON</summary>
              <pre className="mt-2 rounded-lg border bg-slate-50 p-3 text-xs overflow-auto">
{JSON.stringify(qaRes, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>

      {/* REVIEW PANEL */}
      <section className="rounded-2xl border border-slate-200 p-5 space-y-4 shadow-sm">
        <h2 className="text-lg font-semibold">Review Endpoint</h2>
        <form onSubmit={runReview} className="space-y-4">
          <Row label="State">
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={revState}
              onChange={(e) => setRevState(e.target.value)}
              placeholder="CA"
              required
            />
          </Row>
          <Row label="Filename">
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={revFilename}
              onChange={(e) => setRevFilename(e.target.value)}
              placeholder="document.pdf"
            />
          </Row>
          <Row label="Document Type">
            <select
              className="w-full rounded-lg border px-3 py-2"
              value={revDocType}
              onChange={(e) => setRevDocType(e.target.value)}
            >
              <option>policy_or_handbook</option>
              <option>termination_or_warning_letter</option>
              <option>offer_or_onboarding_letter</option>
              <option>corrective_action_memo</option>
              <option>general_hr_correspondence</option>
            </select>
          </Row>
          <Row label="Document Text">
            <textarea
              className="w-full rounded-lg border px-3 py-2 min-h-[120px]"
              value={revText}
              onChange={(e) => setRevText(e.target.value)}
              required
            />
          </Row>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              disabled={revLoading}
              className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {revLoading ? "Running…" : "Run Review"}
            </button>
            {revErr && <span className="text-sm text-rose-600">{revErr}</span>}
          </div>
        </form>

        {revRes && (
          <div className="mt-4 space-y-3">
            <TrustPanel
  confidence={revRes.confidence}
  flags={revRes.confidence_flags}
  extras={[
    { label: "fallback_offered", value: revRes.fallback_offered, tone: revRes.fallback_offered === "federal" ? "warn" : "neutral" },
    { label: "soft_fail", value: revRes.soft_fail, tone: revRes.soft_fail ? "warn" : "neutral" },
    { label: "overall_risk", value: revRes.overall_risk },
  ]}
/>

            <div className="grid grid-cols-12 gap-4">
              <div className="col-span-12 lg:col-span-7 space-y-2">
                <h3 className="font-medium">Summary</h3>
                <div className="rounded-lg border bg-white p-3 text-sm whitespace-pre-wrap">
                  {revRes.summary}
                </div>

                {/* Inline trust badges under the summary */}
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                        {/* flags */}
                        {revRes.confidence_flags?.map((f, i) => (
                          <TrustBadge key={i} tone={flagTone(f)} title={`signal: ${f}`}>
                            {f}
                          </TrustBadge>
                        ))}
                        {/* extras */}
                        <TrustBadge tone="neutral">overall_risk: {revRes.overall_risk}</TrustBadge>
                        <TrustBadge tone={revRes.soft_fail ? "warn" : "neutral"}>
                          soft_fail: {String(revRes.soft_fail)}
                        </TrustBadge>
                        <TrustBadge tone={revRes.fallback_offered === "federal" ? "warn" : "neutral"}>
                          fallback_offered: {revRes.fallback_offered}
                        </TrustBadge>
                      </div>


                <h3 className="font-medium mt-4">Issues</h3>
                <ul className="space-y-2">
                  {revRes.issues.map((i, idx) => (
                    <li key={idx} className="rounded-lg border bg-white p-3">
                      <div className="text-sm font-medium">
                        {i.title} <span className="text-slate-500">({i.severity})</span>
                      </div>
                      <div className="text-sm mt-1">{i.description}</div>
                      {i.related_statutes?.length ? (
                        <div className="mt-1 text-xs text-slate-600">
                          Statutes: {i.related_statutes.join(", ")}
                        </div>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="col-span-12 lg:col-span-5 space-y-3">
                <h3 className="font-medium">Sources</h3>
                <ul className="space-y-2">
                  {revRes.sources.map((s, i) => (
                    <li key={i} className="rounded-lg border bg-white p-3 text-sm">
                      <div className="font-medium">{s.citation || s.name}</div>
                      <a
                        href={s.url}
                        target="_blank"
                        className="text-blue-600 hover:underline break-all"
                      >
                        {s.url}
                      </a>
                      <div className="text-xs text-slate-500">accessed: {s.accessed_at}</div>
                    </li>
                  ))}
                </ul>

                <h3 className="font-medium mt-4">Disclaimers</h3>
                <ul className="list-disc pl-5 text-xs text-slate-600">
                  {revRes.disclaimers.map((d, i) => (
                    <li key={i}>{d}</li>
                  ))}
                </ul>
              </div>
            </div>

            <details className="mt-4">
              <summary className="cursor-pointer text-sm text-slate-600">Raw JSON</summary>
              <pre className="mt-2 rounded-lg border bg-slate-50 p-3 text-xs overflow-auto">
{JSON.stringify(revRes, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </section>
    </main>
  );
}
