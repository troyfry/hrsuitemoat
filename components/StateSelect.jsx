"use client";

import Link from "next/link";
import { STATES } from "@/lib/states.js";

export default function StateSelect() {
  return (
    <div className="space-y-3">
      <label className="block text-sm font-medium">Choose a state</label>
      <ul className="grid grid-cols-2 gap-2">
        {STATES.map((s) => (
          <li key={s.code}>
            <Link
              className="block rounded border px-3 py-2 hover:bg-gray-50"
              href={`/dashboard/${s.code.toLowerCase()}`}
            >
              {s.name}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}


