"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STATES = ["AZ", "CA", "TX"];

export default function HRHeader({ title }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // read state from ?state=XX (default AZ)
  const qpState = useMemo(() => {
    const s = (searchParams.get("state") || "").toUpperCase();
    return STATES.includes(s) ? s : "AZ";
  }, [searchParams]);

  const [state, setState] = useState(qpState);

  // keep local state in sync if URL param changes (e.g., from links)
  useEffect(() => {
    if (state !== qpState) setState(qpState);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [qpState]);

  function updateUrlState(next) {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("state", next);
    router.replace(`${pathname}?${sp.toString()}`);
  }

  function onStateChange(next) {
    setState(next);
    updateUrlState(next);
  }

  return (
    <div className="flex items-center justify-between">
      <h1 className="text-xl font-semibold">{title}</h1>

      <div className="flex items-center gap-3">
        {/* Back to location picker */}
        <Link
          href="/select-location"
          className="text-xs underline hover:no-underline"
        >
          ◀ Back
        </Link>

        {/* State switcher */}
        <label className="text-xs flex items-center gap-1">
          <span className="sr-only">Select state</span>
          <span className="hidden sm:inline">State:</span>
          <select
            className="border rounded px-2 py-1 text-xs"
            value={state}
            onChange={(e) => onStateChange(e.target.value)}
          >
            {STATES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {/* Quick nav (preserves state) */}
        <Link
          href={`/hr/qa?state=${state}`}
          className="text-xs underline hover:no-underline"
          title="Ask compliance questions"
        >
          Q&amp;A
        </Link>

        <Link
          href={`/hr/templates?state=${state}`}
          className="text-xs underline hover:no-underline"
          title="Policy templates"
        >
          Templates
        </Link>
      </div>
    </div>
  );
}
