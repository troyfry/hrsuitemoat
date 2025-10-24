// app/test-qa/page.tsx
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { TrustPanel } from "@/components/TrustPanel";
import { TrustBadge, flagTone } from "@/components/TrustBadge";

type QACitation = { title?: string; url?: string; domain?: string };
type QAResponse = {
  version?: string;
  state?: string;
  jurisdiction?: "state" | "federal";
  document_type?: string;
  question?: string;
  context?: string;
  answer: string;
  key_points?: string[];
  citations?: QACitation[];
  confidence: number;
  confidence_flags?: string[];
  fallback_used?: boolean;
  sources_restricted?: boolean;
  disclaimers?: string[];
  model?: string;
  // tolerant to extras
  [k: string]: any;
};

export default function QATestPage() {
  const [state, setState] = useState("CA");
  const [documentType, setDocumentType] = useState("policy_or_handbook");
  const [question, setQuestion] = useState("Do we need meal breaks for 6-hour shifts?");
  const [context, setContext] = useState("");

  const [res, setRes] = useState<QAResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function runQA(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setErr(null);
    setRes(null);
    setLoading(true);
    try {
      const r = await fetch("/api/qa", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          state,
          question,
          context: context || undefined,
          document_type: documentType,
        }),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error((body && (body.details || body.error)) || `${r.status} ${r.statusText}`);
      }
      setRes(body as QAResponse);
    } catch (e: any) {
      setErr(String(e?.message || e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold">HR Suite — QA API Test</h1>
        <p className="text-sm text-slate-600">
          Ask a scoped HR question. This page posts to <code>/api/qa</code> and shows trust signals.
        </p>
        <div className="mt-2">
          <Link
            href="/test"
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            ← Back to Review Test
          </Link>
        </div>
      </header>

      {/* Form */}
      <section className="rounded-2xl border border-slate-200 p-5 shadow-sm">
        <form onSubmit={runQA} className="space-y-3">
          <div className="grid grid-cols-12 gap-3">
            <div className="col-span-12 md:col-span-3">
              <label className="block text-xs text-slate-600 mb-1">State</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={state}
                onChange={(e) => setState(e.target.value)}
                required
              />
            </div>
            <div className="col-span-12 md:col-span-5">
              <label className="block text-xs text-slate-600 mb-1">Document Type</label>
              <select
                className="w-full rounded-lg border px-3 py-2"
                value={documentType}
                onChange={(e) => setDocumentType(e.target.value)}
              >
                <option>policy_or_handbook</option>
                <option>termination_or_warning_letter</option>
                <option>offer_or_onboarding_letter</option>
                <option>corrective_action_memo</option>
                <option>general_hr_correspondence</option>
              </select>
            </div>
            <div className="col-span-12 md:col-span-4">
              <label className="block text-xs text-slate-600 mb-1">Model (readonly)</label>
              <input className="w-full rounded-lg border px-3 py-2 bg-slate-50" value="server-configured" readOnly />
            </div>
          </div>

          <label className="block text-xs text-slate-600 mb-1">Question</label>
          <input
            className="w-full rounded-lg border px-3 py-2"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            required
          />

          <label className="block text-xs text-slate-600 mb-1">Context (optional)</label>
          <textarea
            className="w-full rounded-lg border px-3 py-2 min-h-[80px]"
            value={context}
            onChange={(e) => setContext(e.target.value)}
            placeholder="Paste policy snippet or relevant facts (optional)"
          />

          <button
            type="submit"
            disabled={loading}
            className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            {loading ? "Running…" : "Run QA"}
          </button>
        </form>
      </section>

      {/* Error */}
      {err && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {err}
        </div>
      )}

      {/* Result */}
      {res && (
        <section className="space-y-4">
          <TrustPanel
            confidence={res.confidence}
            flags={res.confidence_flags}
            extras={[
              { label: "fallback_used", value: Boolean(res.fallback_used), tone: res.fallback_used ? "warn" : "neutral" },
              { label: "sources_restricted", value: Boolean(res.sources_restricted), tone: res.sources_restricted ? "warn" : "neutral" },
              { label: "jurisdiction", value: res.jurisdiction ?? "state" },
            ]}
            title="Trust Assessment — QA"
          />

          <h3 className="font-medium">Answer</h3>
          <div className="rounded-lg border bg-white p-3 text-sm whitespace-pre-wrap">
            {res.answer}
          </div>

          {/* Inline badges under the answer */}
          <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
            {res.confidence_flags?.map((f: string, i: number) => (
              <TrustBadge key={i} tone={flagTone(f)} title={`signal: ${f}`}>
                {f}
              </TrustBadge>
            ))}
            <TrustBadge tone={res.fallback_used ? "warn" : "neutral"}>
              fallback_used: {String(Boolean(res.fallback_used))}
            </TrustBadge>
            <TrustBadge tone={res.sources_restricted ? "warn" : "neutral"}>
              sources_restricted: {String(Boolean(res.sources_restricted))}
            </TrustBadge>
          </div>

          <div className="mt-2 text-[11px] text-slate-500 italic">
            Powered by State-Of-HR GPT — Not legal advice.
          </div>

          {/* Key points */}
          {Array.isArray(res.key_points) && res.key_points.length > 0 && (
            <>
              <h3 className="font-medium mt-4">Key Points</h3>
              <ul className="list-disc pl-5 text-sm">
                {res.key_points.map((k: string, i: number) => (
                  <li key={i}>{k}</li>
                ))}
              </ul>
            </>
          )}

          {/* Citations */}
          {Array.isArray(res.citations) && res.citations.length > 0 && (
            <>
              <h3 className="font-medium mt-4">Citations</h3>
              <ul className="space-y-2">
                {res.citations.map((c: QACitation, i: number) => (
                  <li key={i} className="rounded-lg border bg-white p-3 text-sm">
                    <div className="font-medium">{c.title || c.domain || c.url || "Source"}</div>
                    {(c.url || c.domain) && (
                      <a
                        href={c.url || (c.domain ? `https://${c.domain}` : undefined)}
                        target="_blank"
                        className="text-blue-600 hover:underline break-all"
                      >
                        {c.url || c.domain}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </main>
  );
}
