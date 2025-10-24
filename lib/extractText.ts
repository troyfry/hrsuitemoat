// lib/extractText.ts
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);

type Kind = "pdf" | "docx" | "txt" | "html";

// Use pdf-parse with a simpler approach to avoid worker issues
let pdfParse: any = null;
try {
  pdfParse = require("pdf-parse");
} catch (e) {
  // Will be handled in the function
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
    try {
      if (!pdfParse) {
        throw new Error("pdf-parse module not available");
      }
      
      // Use pdf-parse PDFParse class with minimal configuration
      const PDFParse = pdfParse.PDFParse;
      const parser = new PDFParse({ data: Buffer.from(bytes) });
      const result = await parser.getText();
      
      const text = result?.text?.trim() || "";
      
      // Debug information
      console.log("PDF extraction result:", {
        hasText: !!text,
        textLength: text.length,
        resultKeys: Object.keys(result || {}),
        pages: (result as any)?.numpages || 0
      });
      
      if (!text) {
        // Provide more helpful error message for scanned PDFs
        throw new Error("PDF appears to contain scanned images or is not text-extractable. Please try a different PDF or convert to text format.");
      }
      
      return { text, kind };
    } catch (error: any) {
      if (error.message.includes("scanned images")) {
        throw error;
      }
      throw new Error(`PDF extraction failed: ${error.message}`);
    }
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
