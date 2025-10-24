// lib/extractText.ts
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);

type Kind = "pdf" | "docx" | "txt" | "html";

async function getPdfParseFn(): Promise<(buf: Buffer) => Promise<{ text: string }>> {
  // 1) Try dynamic import (ESM / CJS interoperability)
  try {
    const mod: any = await import("pdf-parse");
    // pdf-parse exports a default function, but it might be nested
    const fn = mod?.default ?? mod;
    if (typeof fn === "function") return fn;
  } catch {}

  // 2) Fallback to Node CJS require (works with pnpm + Node 22 reliably)
  try {
    const reqAny: any = nodeRequire("pdf-parse");
    const fn = reqAny?.default ?? reqAny;
    if (typeof fn === "function") return fn;
  } catch {}

  throw new Error("pdf-parse module did not export a function");
}

function magic(bytes: Uint8Array) {
  const h4 = Buffer.from(bytes.slice(0, 4)).toString("hex");
  if (h4.startsWith("25504446")) return "pdf" as const;   // %PDF
  if (h4 === "504b0304") return "docx" as const;           // ZIP container
  return null;
}

export async function extractTextFromFile(file: File): Promise<{ text: string; kind: Kind }> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  const mime = (file.type || "").toLowerCase();

  let kind: Kind | null = null;
  const sig = magic(bytes);
  if (sig === "pdf") kind = "pdf";
  else if (sig === "docx") kind = "docx";
  else if (/\.docx$/.test(name)) kind = "docx";
  else if (/\.html?$/.test(name) || /text\/html/.test(mime)) kind = "html";
  else kind = "txt";

  if (kind === "pdf") {
    const pdfParse = await getPdfParseFn();
    const { text } = await pdfParse(Buffer.from(bytes));
    if (!text?.trim()) throw new Error("EMPTY_TEXT_FROM_PDF");
    return { text, kind };
  }

  if (kind === "docx") {
    const mammoth: any = await import("mammoth");
    const res = await mammoth.extractRawText({ buffer: Buffer.from(bytes) });
    const text = String(res?.value ?? "").trim();
    if (!text) throw new Error("EMPTY_TEXT_FROM_DOCX");
    return { text, kind };
  }

  // txt / html
  const text = new TextDecoder().decode(bytes);
  if (!text?.trim()) throw new Error("EMPTY_TEXT");
  return { text, kind };
}
