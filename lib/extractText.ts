// lib/extractText.ts
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);

type Kind = "pdf" | "docx" | "txt" | "html";

// For now, disable PDF parsing to avoid worker issues
// TODO: Implement proper PDF parsing without workers

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
    // Temporarily disable PDF parsing due to worker issues
    throw new Error("PDF parsing is temporarily disabled due to worker compatibility issues. Please convert your PDF to DOCX, TXT, or HTML format and try again. You can use online converters or tools like Adobe Acrobat to export your PDF as a text-based format.");
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
