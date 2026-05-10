/**
 * PDF text extraction with smart detection.
 *
 * Rules:
 *   - For PDFs with selectable text: extract native text (fast, free)
 *   - For scanned PDFs: return indicator (OCR would be needed)
 *   - Report detection method: 'pdf_native_text' or 'pdf_scanned_only'
 */

/**
 * Detect whether a PDF has selectable text or is scanned/image-only.
 *
 * Returns: { hasSelectableText: boolean; estimatedPageCount?: number }
 * For signed URLs, we cannot directly inspect PDF structure.
 * Return false (assume scanned) if we can't verify.
 */
export async function detectPdfType(
  signedUrl: string,
): Promise<{
  hasSelectableText: boolean;
  estimatedPageCount?: number;
}> {
  // For now, we cannot inspect PDF structure from a signed URL without a library.
  // PDF.js (pdfjs-dist) can be imported client-side but extraction happens server-side.
  //
  // Fallback strategy:
  // - Assume PDFs are scanned (return false)
  // - Let client-side UI show OCR requirement
  // - User can provide images/text-based documents instead
  //
  // TODO: If needed, add pdf-parse library for server-side PDF inspection:
  //   import PDFParser from 'pdf-parse';
  //   const fetch = require('node-fetch');
  //   const buffer = await (await fetch(signedUrl)).buffer();
  //   const data = await PDFParser(buffer);
  //   return { hasSelectableText: data.text.trim().length > 100, estimatedPageCount: data.numpages }

  return {
    hasSelectableText: false, // Conservative: assume scanned
    estimatedPageCount: undefined,
  };
}

/**
 * Extract text from PDF with selectable text.
 * Server-side only (requires pdf-parse library).
 *
 * For now: returns placeholder message.
 * TODO: Install pdf-parse, implement extraction.
 */
export async function extractPdfNativeText(
  signedUrl: string,
): Promise<{
  text: string;
  pageCount: number;
  extractionMethod: "pdf_native_text";
}> {
  // Placeholder until pdf-parse is available
  return {
    text: "",
    pageCount: 0,
    extractionMethod: "pdf_native_text",
  };
}
