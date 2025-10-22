// components/TrustPanel.tsx
"use client";
import React from "react";
import { TrustBadge, flagTone } from "@/components/TrustBadge";

function percent(conf: number) {
  const v = Math.max(0, Math.min(1, conf));
  return Math.round(v * 100);
}

function barTone(conf: number) {
  if (conf >= 0.8) return "bg-emerald-500";
  if (conf >= 0.7) return "bg-amber-500";
  return "bg-rose-500";
}

export function TrustPanel({
  confidence,
  flags,
  extras,
  title = "Trust Assessment",
}: {
  confidence: number;
  flags?: string[];
  extras?: Array<{ label: string; value: string | boolean | number; tone?: "neutral"|"good"|"warn"|"bad"|"info" }>;
  title?: string;
}) {
  const pct = percent(confidence);
  const tone = barTone(confidence);

  return (
    <div className="w-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-slate-600">{title}</div>
          <div className="mt-1 flex items-end gap-2">
            <div className="text-3xl font-semibold leading-none">{confidence.toFixed(2)}</div>
            <div className="text-xs text-slate-500 pb-1">confidence</div>
          </div>
        </div>

        {/* Primary flags as badges */}
        <div className="flex flex-wrap gap-2 justify-end">
          {flags?.map((f, i) => (
            <TrustBadge key={i} tone={flagTone(f)} title={`signal: ${f}`}>
              {f}
            </TrustBadge>
          ))}
        </div>
      </div>

      {/* Confidence bar */}
      <div className="mt-3">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-2 ${tone} transition-all`}
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-xs text-slate-500">{pct}% strength</div>
      </div>

      {/* Extras (fallback, sources_restricted, overall_risk, etc.) */}
      {extras && extras.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {extras.map((e, i) => (
            <TrustBadge key={`x-${i}`} tone={e.tone ?? "neutral"}>
              {e.label}: {String(e.value)}
            </TrustBadge>
          ))}
        </div>
      )}
    </div>
  );
}
