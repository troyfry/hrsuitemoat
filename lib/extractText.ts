// lib/extractText.ts
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);

type Kind = "pdf" | "docx" | "txt" | "html";

async function getPdfParseFn(): Promise<(buf: Buffer) => Promise<{ text: string }>> {
  // Set up PDF.js to disable workers globally
  try {
    // Try to disable PDF.js workers before importing
    const pdfjsLib = await import("pdfjs-dist");
    if (pdfjsLib.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = null;
    }
    
    // Also try to set worker to null
    if (pdfjsLib.setWorker) {
      pdfjsLib.setWorker(null);
    }
  } catch {}
  
  // Set environment variable to disable workers
  process.env.PDFJS_DISABLE_WORKER = 'true';

  // 1) Try dynamic import (ESM / CJS interoperability)
  try {
    const mod: any = await import("pdf-parse");
    // pdf-parse exports an object with PDFParse function
    const pdfParse = mod?.PDFParse ?? mod?.default?.PDFParse ?? mod?.default ?? mod;
    if (pdfParse && typeof pdfParse === "function") {
      return async (buf: Buffer) => {
        // Configure PDF.js for server-side usage (disable worker)
        const parser = new pdfParse({ 
          data: buf,
          verbosity: 0,
          // Use server-side rendering without workers
          render_page: false
        });
        
        // Disable worker for server-side usage
        if (typeof parser.setWorker === 'function') {
          parser.setWorker(null);
        }
        return await parser.getText();
      };
    }
  } catch {}

  // 2) Fallback to Node CJS require (works with pnpm + Node 22 reliably)
  try {
    const reqAny: any = nodeRequire("pdf-parse");
    const pdfParse = reqAny?.PDFParse ?? reqAny?.default?.PDFParse ?? reqAny?.default ?? reqAny;
    if (pdfParse && typeof pdfParse === "function") {
      return async (buf: Buffer) => {
        // Configure PDF.js for server-side usage (disable worker)
        const parser = new pdfParse({ 
          data: buf,
          verbosity: 0,
          // Use server-side rendering without workers
          render_page: false
        });
        
        // Disable worker for server-side usage
        if (typeof parser.setWorker === 'function') {
          parser.setWorker(null);
        }
        return await parser.getText();
      };
    }
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
    try {
      // Try a simpler approach first - use pdf-parse directly without workers
      const pdfParse = require("pdf-parse");
      const result = await pdfParse(Buffer.from(bytes));
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
