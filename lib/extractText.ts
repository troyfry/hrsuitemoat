// lib/extractText.ts
import { createRequire } from "node:module";
const nodeRequire = createRequire(import.meta.url);

type Kind = "pdf" | "docx" | "txt" | "html";

// Import pdfjs-dist directly to avoid pdf-parse worker issues
let pdfjsLib: any = null;
try {
  pdfjsLib = require("pdfjs-dist");
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
      if (!pdfjsLib) {
        throw new Error("pdfjs-dist module not available");
      }
      
      // Disable workers for server-side usage
      pdfjsLib.GlobalWorkerOptions.workerSrc = null;
      
      // Load the PDF document
      const loadingTask = pdfjsLib.getDocument({
        data: Buffer.from(bytes),
        verbosity: 0
      });
      
      const pdf = await loadingTask.promise;
      let text = "";
      
      // Extract text from all pages
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items
          .map((item: any) => item.str)
          .join(" ");
        text += pageText + "\n";
      }
      
      const trimmedText = text.trim();
      
      // Debug information
      console.log("PDF extraction result:", {
        hasText: !!trimmedText,
        textLength: trimmedText.length,
        pages: pdf.numPages
      });
      
      if (!trimmedText) {
        // Provide more helpful error message for scanned PDFs
        throw new Error("PDF appears to contain scanned images or is not text-extractable. Please try a different PDF or convert to text format.");
      }
      
      return { text: trimmedText, kind };
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
