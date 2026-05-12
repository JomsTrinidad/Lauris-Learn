/**
 * Document text extraction service.
 *
 * Default provider: OpenAI (Responses API).
 *   - Images (JPEG, PNG, WebP, GIF): OPENAI_IEP_IMAGE_MODEL (default: gpt-4o-mini)
 *   - PDFs: OPENAI_IEP_PDF_MODEL (default: gpt-4.1-mini) via file input
 *
 * Backward compat: IEP_EXTRACTION_PROVIDER=openai_vision is treated as openai.
 *
 * Contract: never return fake text. Always be explicit about provider status.
 * Checks guardrails before processing (file size, page count).
 */

import type { ExtractionResult } from "./types";
import { checkFileSize, checkPdfPageCount, truncateForAi } from "@/lib/extraction-guardrails/guardrails";
import { getExtractionConfig } from "@/lib/extraction-guardrails/config";
import { detectPdfType } from "@/lib/extraction-guardrails/pdf-extractor";

/**
 * Extract text from a document via storage path.
 * Placeholder — real extraction happens in the API route after a signed URL is
 * fetched. Call extractFromUrl directly from the route.
 */
export async function extractDocumentText(
  _storagePath: string | null,
  _mimeType: string | null,
): Promise<ExtractionResult> {
  return {
    status: "not_configured",
    message:
      "Text extraction requires a signed URL. Call extractFromUrl from the API route.",
  };
}

/**
 * Safely pull the assistant text out of an OpenAI Responses API response body.
 *
 * The Responses API can return text in two places:
 *   1. data.output_text  — top-level shortcut added when there is a single text output
 *   2. data.output[i].content[j].text  — inside a "message" item, inside an "output_text" block
 *
 * Both paths are walked to guard against API shape changes between model versions.
 * Returns empty string when no text is found so callers can treat it as an empty extraction.
 */
function extractOpenAIResponseText(data: unknown): string {
  if (!data || typeof data !== "object") return "";
  const d = data as Record<string, unknown>;

  // Fast path: top-level shortcut provided by the Responses API
  if (typeof d.output_text === "string" && d.output_text.trim()) {
    return d.output_text.trim();
  }

  // Walk output[] → message items → content[] → output_text blocks
  const output = d.output;
  if (!Array.isArray(output)) return "";

  for (const item of output) {
    if (!item || typeof item !== "object") continue;
    const it = item as Record<string, unknown>;
    if (it.type !== "message") continue;
    const content = it.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      if (b.type === "output_text" && typeof b.text === "string" && b.text.trim()) {
        return b.text.trim();
      }
    }
  }

  return "";
}

/**
 * Extract text from a document via signed URL.
 *
 * Supports images (JPEG, PNG, WebP, GIF) and PDFs.
 * Checks guardrails (file size, page count) before processing.
 *
 * @param signedUrl     - Signed/public URL to the file
 * @param mimeType      - MIME type of the file
 * @param fileSizeBytes - File size in bytes (for guardrail check)
 */
export async function extractFromUrl(
  signedUrl: string,
  mimeType: string | null,
  fileSizeBytes?: number,
): Promise<ExtractionResult> {
  if (!signedUrl) {
    return {
      status: "not_configured",
      message: "No document URL provided.",
    };
  }

  // File size guardrail
  if (fileSizeBytes !== undefined) {
    const fileSizeCheck = checkFileSize(fileSizeBytes);
    if (fileSizeCheck.status === "hard_limit") {
      return {
        status: "not_configured",
        message: fileSizeCheck.message,
      };
    }
    if (fileSizeCheck.status === "soft_limit") {
      console.warn("[iep-extraction] File size soft limit exceeded, proceeding...");
    }
  }

  // Normalize provider aliases
  const rawProvider = process.env.IEP_EXTRACTION_PROVIDER?.trim();
  const provider = rawProvider === "openai_vision" ? "openai" : rawProvider;

  if (!provider || provider === "none") {
    return {
      status: "not_configured",
      message:
        "To automatically extract text, configure OpenAI by setting " +
        "OPENAI_API_KEY and IEP_EXTRACTION_PROVIDER=openai.",
    };
  }

  // PDF handling
  if (mimeType === "application/pdf") {
    const pdfType = await detectPdfType(signedUrl);

    // Page count guardrail (only when detectable — detectPdfType currently always returns
    // estimatedPageCount: undefined until a PDF-parsing library is added)
    if (pdfType.estimatedPageCount !== undefined) {
      const pageCheck = checkPdfPageCount(pdfType.estimatedPageCount);
      if (pageCheck.status === "hard_limit") {
        return {
          status: "not_configured",
          message: pageCheck.message,
        };
      }
    }

    // OpenAI handles both scanned and native-text PDFs via the Responses API file input
    if (provider === "openai") {
      return extractWithOpenAI(signedUrl, mimeType);
    }

    // Fallback for unknown providers: block scanned PDFs
    if (!pdfType.hasSelectableText) {
      return {
        status: "not_configured",
        message:
          "This PDF appears to be scanned or image-only. " +
          "To extract text, configure OpenAI by setting " +
          "OPENAI_API_KEY and IEP_EXTRACTION_PROVIDER=openai.",
        extractionMethod: "pdf_scanned",
        pageCount: pdfType.estimatedPageCount,
        skippedReason: "pdf_scanned_no_ocr",
      };
    }

    return {
      status: "not_configured",
      message:
        "PDF text extraction requires an AI provider. Set IEP_EXTRACTION_PROVIDER=openai.",
    };
  }

  // Image types
  if (provider === "openai") {
    return extractWithOpenAI(signedUrl, mimeType);
  }

  return {
    status: "not_configured",
    message: `Unknown extraction provider: ${provider}. Check IEP_EXTRACTION_PROVIDER configuration.`,
  };
}

/**
 * Extract text using OpenAI Responses API.
 *
 * - Images: input_image content block; OPENAI_IEP_IMAGE_MODEL (default: gpt-4o-mini)
 * - PDFs:   input_file content block with file_url; OPENAI_IEP_PDF_MODEL (default: gpt-4.1-mini)
 *
 * Response text is parsed via extractOpenAIResponseText() which handles both the
 * top-level output_text shortcut and the nested output[].content[].text path.
 */
async function extractWithOpenAI(
  signedUrl: string,
  mimeType: string | null,
): Promise<ExtractionResult> {
  const config = getExtractionConfig();
  if (!config.ocrEnabled) {
    return {
      status: "not_configured",
      message: "Image/OCR extraction is disabled. Set REPORT_OCR_ENABLED=true to enable.",
      extractionMethod: "image_ocr",
    };
  }

  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    return {
      status: "not_configured",
      message:
        "To automatically extract text, configure OpenAI by setting " +
        "OPENAI_API_KEY and IEP_EXTRACTION_PROVIDER=openai.",
    };
  }

  const supportedTypes = [
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "application/pdf",
  ];
  if (mimeType && !supportedTypes.includes(mimeType)) {
    return {
      status: "not_configured",
      message: `Unsupported file type: ${mimeType}. Supported: JPEG, PNG, GIF, WebP, PDF.`,
    };
  }

  const isPdf = mimeType === "application/pdf";
  const model = isPdf
    ? (process.env.OPENAI_IEP_PDF_MODEL?.trim() || "gpt-4.1-mini")
    : (process.env.OPENAI_IEP_IMAGE_MODEL?.trim() || "gpt-4o-mini");

  // Responses API content block: input_file for PDFs, input_image for images
  const fileInput = isPdf
    ? { type: "input_file", file_url: signedUrl, filename: "document.pdf" }
    : { type: "input_image", image_url: signedUrl };

  try {
    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        input: [
          {
            role: "user",
            content: [
              fileInput,
              {
                type: "input_text",
                text:
                  "Extract all readable text from this document. " +
                  "Return only the extracted text, preserving structure " +
                  "(headings, lists, paragraphs) where possible. " +
                  "Do not add commentary, interpretation, or summaries.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      const errBody = await response.json().catch(() => ({}));
      const openaiMessage = (errBody as any)?.error?.message ?? response.statusText;
      console.error("[iep-extraction] OpenAI API error", {
        provider: "openai",
        model,
        httpStatus: response.status,
        openaiMessage,
      });
      return {
        status: "not_configured",
        message: `OpenAI API error: ${openaiMessage}`,
      };
    }

    const data = await response.json();
    const extractedText = extractOpenAIResponseText(data);

    if (!extractedText) {
      return {
        status: "not_configured",
        message:
          "No text extracted from document. Document may be blank or unreadable.",
        extractionMethod: isPdf ? "pdf_scanned" : "image_ocr",
        imageCount: isPdf ? undefined : 1,
        skippedReason: "empty_extraction",
      };
    }

    const { text: aiText, characterCount: aiChars } = truncateForAi(extractedText);

    return {
      status: "done",
      text: aiText,
      extractionMethod: isPdf ? "pdf_scanned" : "image_ocr",
      imageCount: isPdf ? undefined : 1,
      extractedCharCount: extractedText.length,
      aiCharCount: aiChars,
    };
  } catch (err) {
    console.error("[iep-extraction] Fetch failed", {
      provider: "openai",
      model,
      error: err instanceof Error ? err.message : String(err),
    });
    return {
      status: "not_configured",
      message: `Extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`,
      extractionMethod: isPdf ? "pdf_scanned" : "image_ocr",
      imageCount: isPdf ? undefined : 1,
    };
  }
}
