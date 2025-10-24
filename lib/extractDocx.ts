// lib/extractDocx.ts
export async function extractRawText(buffer: Buffer): Promise<string> {
  try {
    const mammoth = await import("mammoth");
    const result = await mammoth.extractRawText({ buffer });
    const text = String(result?.value ?? "").trim();
    if (!text) throw new Error("EMPTY_TEXT_FROM_DOCX");
    return text;
  } catch (err) {
    throw new Error(`DOCX_PARSE_ERROR: ${err instanceof Error ? err.message : String(err)}`);
  }
}
