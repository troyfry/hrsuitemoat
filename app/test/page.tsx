// app/test/page.tsx
"use client";

import React, { useState } from "react";
import { TrustPanel } from "@/components/TrustPanel";
import { TrustBadge, flagTone } from "@/components/TrustBadge";
import Link from "next/link";

type ReviewSource = { name?: string; url?: string; citation?: string; accessed_at?: string };
type ReviewIssue = {
  section?: string;
  title: string;
  description: string;
  severity: "low" | "medium" | "high";
  related_statutes?: string[];
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
  // transparency (may be present)
  confidence_flags?: string[];
};

export default function ReviewTestPage() {
  // shared defaults
  const [revState, setRevState] = useState("CA");
  const [revDocType, setRevDocType] = useState("termination_or_warning_letter");

  // text flow
  const [revText, setRevText] = useState(
    "Sample CA policy excerpt: Non-exempt employees scheduled for six hours receive a 30-minute unpaid meal period that may be waived by mutual consent..."
  );
  const [revFilename, setRevFilename] = useState("sample.txt");

  // results
  const [revRes, setRevRes] = useState<ReviewResponse | null>(null);
  const [revErr, setRevErr] = useState<string | null>(null);
  const [revLoading, setRevLoading] = useState(false);
  const [uploadLoading, setUploadLoading] = useState(false);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);
  const [activeMethod, setActiveMethod] = useState<"upload" | "paste" | null>(null);
  const [uploadCollapsed, setUploadCollapsed] = useState(false);
  const [pasteCollapsed, setPasteCollapsed] = useState(true); // Start collapsed
  const [showPasteForm, setShowPasteForm] = useState(false);

  // ---- handlers ----
  async function runReviewJSON(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRevErr(null);
    setRevRes(null);
    setActiveMethod("paste");
    setUploadCollapsed(true); // Collapse upload section
    setRevLoading(true);
    try {
      const requestData = {
        text: revText,
        state: revState,
        filename: revFilename,
        document_type: revDocType,
      };
      
      // Debug: Log paste request data
      console.log("Paste request data:", requestData);
      
      const r = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestData),
      });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(
          (body && (body.details || body.error)) || `${r.status} ${r.statusText}`
        );
      }
      setRevRes(body as ReviewResponse);
    } catch (err: any) {
      setRevErr(String(err?.message || err));
    } finally {
      setRevLoading(false);
    }
  }

  async function runReviewUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setRevErr(null);
    setRevRes(null);
    setActiveMethod("upload");
    setShowPasteForm(false); // Hide paste form
    setUploadCollapsed(false); // Show upload section
    setUploadLoading(true);
    try {
      const fd = new FormData(e.currentTarget);
      // Add shared configuration to form data
      fd.append("state", revState);
      fd.append("document_type", revDocType);
      
      // Ensure no text field is accidentally included
      // Only send file, state, and document_type for uploads
      
      // Debug: Log form data contents
      console.log("Upload form data:");
      for (const [key, value] of fd.entries()) {
        console.log(`${key}:`, value instanceof File ? `File(${value.name})` : value);
      }
      
      const r = await fetch("/api/review", { method: "POST", body: fd });
      const body = await r.json().catch(() => null);
      if (!r.ok) {
        throw new Error(
          (body && (body.details || body.error)) || `${r.status} ${r.statusText}`
        );
      }
      setRevRes(body as ReviewResponse);
    } catch (err: any) {
      setRevErr(String(err?.message || err));
    } finally {
      setUploadLoading(false);
    }
  }

  async function getRecommendations() {
    setRecommendationsLoading(true);
    try {
      // TODO: Implement recommendations API call
      console.log("Getting recommendations...");
      // Simulate API call
      await new Promise(resolve => setTimeout(resolve, 2000));
      alert("Recommendations feature coming soon!");
    } catch (err: any) {
      setRevErr(String(err?.message || err));
    } finally {
      setRecommendationsLoading(false);
    }
  }

  // Results component
  function ResultsSection() {
    if (!revRes) return null;
    
    return (
      <section className="space-y-4 mt-4">
            <TrustPanel
          confidence={revRes.confidence}
          flags={revRes.confidence_flags}
  extras={[
            { label: "overall_risk", value: revRes.overall_risk },
            { label: "soft_fail", value: Boolean(revRes.soft_fail), tone: revRes.soft_fail ? "warn" : "neutral" },
            { label: "fallback_offered", value: revRes.fallback_offered ?? "none", tone: revRes.fallback_offered === "federal" ? "warn" : "neutral" },
  ]}
          title="Trust Assessment — Review"
/>

            <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-7 space-y-3">
            <h3 className="font-medium">Summary</h3>
                <div className="rounded-lg border bg-white p-3 text-sm whitespace-pre-wrap">
              {revRes.summary}
                </div>

            {/* Inline trust badges under summary */}
                    <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
              {revRes.confidence_flags?.map((f, i) => (
                        <TrustBadge key={i} tone={flagTone(f)} title={`signal: ${f}`}>
                          {f}
                        </TrustBadge>
                      ))}
              <TrustBadge tone="neutral">overall_risk: {revRes.overall_risk}</TrustBadge>
              <TrustBadge tone={revRes.soft_fail ? "warn" : "neutral"}>
                soft_fail: {String(revRes.soft_fail)}
                      </TrustBadge>
              <TrustBadge tone={revRes.fallback_offered === "federal" ? "warn" : "neutral"}>
                fallback_offered: {revRes.fallback_offered ?? "none"}
                      </TrustBadge>
            </div>

            <div className="mt-2 text-[11px] text-slate-500 italic">
              Powered by State-Of-HR GPT — Not legal advice.
            </div>

            <h3 className="font-medium mt-5">Issues</h3>
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
                  {s.url && (
                        <a
                      href={s.url}
                          target="_blank"
                          className="text-blue-600 hover:underline break-all"
                        >
                      {s.url}
                        </a>
                      )}
                  {s.accessed_at && (
                    <div className="text-xs text-slate-500">accessed: {s.accessed_at}</div>
                  )}
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
      </section>
    );
  }

  return (
    <main className="mx-auto max-w-5xl p-6 space-y-8">
      <header className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">HR Suite — Review API Test</h1>
        <p className="text-sm text-slate-600">
          Upload a document or paste text. Results show trust signals and compliance findings from <code>/api/review</code>.
        </p>
        <div className="flex items-center gap-2 mt-3">
          <Link
            href="/test-qa"
            className="inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Open QA Test →
          </Link>
        </div>
      </header>

      {/* Shared Configuration */}
      <section className="rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-4">Configuration</h2>
        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 md:col-span-4">
            <label className="block text-sm font-medium text-slate-700 mb-2">State</label>
            <input
              className="w-full rounded-lg border px-3 py-2"
              value={revState}
              onChange={(e) => setRevState(e.target.value)}
              placeholder="CA"
            />
          </div>
          <div className="col-span-12 md:col-span-8">
            <label className="block text-sm font-medium text-slate-700 mb-2">Document Type</label>
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
          </div>
        </div>
      </section>


      {/* Upload Section */}
      <section className="rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Upload Document</h2>
          {uploadCollapsed && (
            <button
              onClick={() => setUploadCollapsed(false)}
              className="text-sm text-blue-600 hover:underline"
            >
              Show Upload Form
            </button>
          )}
        </div>
        
        {!uploadCollapsed && (
          <form onSubmit={runReviewUpload} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">File (PDF, DOCX, TXT, HTML)</label>
              <input
                name="file"
                type="file"
                className="w-full rounded-lg border px-3 py-2"
                accept=".pdf,.docx,.txt,.html,.htm"
                required
              />
              <p className="text-xs text-slate-500 mt-1">
                Tip: scanned PDFs need OCR; try DOCX/TXT if you hit an extraction warning.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={uploadLoading}
                className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
              >
                {uploadLoading ? "Uploading…" : "Upload & Review"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowPasteForm(true);
                  setPasteCollapsed(false);
                  setUploadCollapsed(true);
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                Rather paste text instead →
              </button>
            </div>
          </form>
        )}
        
        {/* Upload Results */}
        {activeMethod === "upload" && <ResultsSection />}
      </section>

      {/* Paste Section - Only show when requested */}
      {showPasteForm && (
        <section className="rounded-2xl border border-slate-200 p-5 shadow-sm space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold">Paste Text for Review</h2>
            <button
              onClick={() => {
                setShowPasteForm(false);
                setPasteCollapsed(true);
                setUploadCollapsed(false);
              }}
              className="text-sm text-blue-600 hover:underline"
            >
              ← Back to Upload
            </button>
          </div>
          
          <form onSubmit={runReviewJSON} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Filename (for logs)</label>
              <input
                className="w-full rounded-lg border px-3 py-2"
                value={revFilename}
                onChange={(e) => setRevFilename(e.target.value)}
                placeholder="document.txt"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-2">Document Text</label>
              <textarea
                className="w-full rounded-lg border px-3 py-2 min-h-[120px]"
                value={revText}
                onChange={(e) => setRevText(e.target.value)}
                placeholder="Paste your document text here..."
                required
              />
            </div>
            <button
              type="submit"
              disabled={revLoading}
              className="rounded-lg bg-black text-white px-4 py-2 text-sm disabled:opacity-50"
            >
              {revLoading ? "Running…" : "Run Review (Text)"}
            </button>
          </form>
          
          {/* Text Results */}
          {activeMethod === "paste" && <ResultsSection />}
        </section>
      )}

      {/* Recommendations Button */}
      <section className="rounded-2xl border border-slate-200 p-5 shadow-sm">
        <h2 className="text-lg font-semibold mb-3">Get Recommendations</h2>
        <button
          onClick={getRecommendations}
          disabled={recommendationsLoading}
          className="rounded-lg bg-blue-600 text-white px-4 py-2 text-sm disabled:opacity-50 hover:bg-blue-700"
        >
          {recommendationsLoading ? "Getting Recommendations…" : "Get Recommendations"}
        </button>
      </section>

      {/* Error */}
      {revErr && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
          {revErr}
        </div>
      )}

      {/* Results */}
        {revRes && (
        <section className="space-y-4">
            <TrustPanel
  confidence={revRes.confidence}
  flags={revRes.confidence_flags}
  extras={[
    { label: "overall_risk", value: revRes.overall_risk },
              { label: "soft_fail", value: Boolean(revRes.soft_fail), tone: revRes.soft_fail ? "warn" : "neutral" },
              { label: "fallback_offered", value: revRes.fallback_offered ?? "none", tone: revRes.fallback_offered === "federal" ? "warn" : "neutral" },
  ]}
            title="Trust Assessment — Review"
/>

            <div className="grid grid-cols-12 gap-4">
            <div className="col-span-12 lg:col-span-7 space-y-3">
                <h3 className="font-medium">Summary</h3>
                <div className="rounded-lg border bg-white p-3 text-sm whitespace-pre-wrap">
                  {revRes.summary}
                </div>

              {/* Inline trust badges under summary */}
                      <div className="mt-2 flex flex-wrap gap-1 text-[11px]">
                        {revRes.confidence_flags?.map((f, i) => (
                          <TrustBadge key={i} tone={flagTone(f)} title={`signal: ${f}`}>
                            {f}
                          </TrustBadge>
                        ))}
                        <TrustBadge tone="neutral">overall_risk: {revRes.overall_risk}</TrustBadge>
                        <TrustBadge tone={revRes.soft_fail ? "warn" : "neutral"}>
                          soft_fail: {String(revRes.soft_fail)}
                        </TrustBadge>
                        <TrustBadge tone={revRes.fallback_offered === "federal" ? "warn" : "neutral"}>
                  fallback_offered: {revRes.fallback_offered ?? "none"}
                        </TrustBadge>
                      </div>

              <div className="mt-2 text-[11px] text-slate-500 italic">
                Powered by State-Of-HR GPT — Not legal advice.
              </div>

              <h3 className="font-medium mt-5">Issues</h3>
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
                    {s.url && (
                      <a
                        href={s.url}
                        target="_blank"
                        className="text-blue-600 hover:underline break-all"
                      >
                        {s.url}
                      </a>
                    )}
                    {s.accessed_at && (
                      <div className="text-xs text-slate-500">accessed: {s.accessed_at}</div>
                    )}
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
        </section>
        )}
    </main>
  );
}
