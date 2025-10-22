"use client";
import React from "react";

export function TrustBadge({
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

export function flagTone(flag: string): "good" | "warn" | "bad" | "info" | "neutral" {
  const f = flag.toLowerCase();
  if (f === "multiple_authoritative" || f === "authoritative_sources") return "good";
  if (f === "nuance" || f === "speculative_query") return "warn";
  if (f === "fallback" || f === "non_authoritative" || f === "thin_citations") return "bad";
  return "neutral";
}
