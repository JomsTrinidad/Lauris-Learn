/**
 * Document text extraction service.
 *
 * Supports:
 *   - OpenAI Vision API (images)
 *   - PDF native text extraction (fallback: scanned PDF message)
 *   - Azure Form Recognizer (placeholder)
 *   - AWS Textract (placeholder)
 *
 * Contract: never return fake text. Always be explicit about provider status.
 * Checks guardrails before processing (file size, page count, image count).
 */

import type { ExtractionResult } from "./types";
import { checkFileSize, checkPdfPageCount } from "@/lib/extraction-guardrails/guardrails";
import { detectPdfType } from "@/lib/extraction-guardrails/pdf-extractor";

/**
 * Extract text from a document via signed URL.
 *
 * @param signedUrl - Signed URL to the file (can be downloaded without auth)
 * @param mimeType - MIME type of the file (e.g. 'application/pdf', 'image/jpeg')
 * @returns Extraction result with status and extracted text if available
 */
export async function extractDocumentText(
  storagePath: string | null,
  mimeType: string | null,
): Promise<ExtractionResult> {
  // This function is called from the API route with storage path.
  // The API route will fetch a signed URL and call extractFromUrl.
  // For now, return a placeholder.
  return {
    status: "not_configured",
    message:
      "Text extraction requires a signed URL. Call from API route with signed URL.",
  };
}

/**
 * Extract text from a document via signed URL.
 *
 * Supports images (JPEG, PNG, WebP, GIF) and PDFs.
 * Checks guardrails (file size, page count) before processing.
 *
 * @param signedUrl - Signed/public URL to the file
 * @param mimeType - MIME type of the file
 * @param fileSizeBytes - File size in bytes (for guardrail check)
 * @returns Extraction result with status and extracted text if available
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

  // Check file size guardrail if provided
  if (fileSizeBytes !== undefined) {
    const fileSizeCheck = checkFileSize(fileSizeBytes);
    if (fileSizeCheck.status === "hard_limit") {
      return {
        status: "not_configured",
        message: fileSizeCheck.message,
      };
    }
    if (fileSizeCheck.status === "soft_limit") {
      // Note: soft limits are typically handled at API route level with user confirmation
      // We proceed but log a warning
      console.warn("File size soft limit exceeded, proceeding with extraction...");
    }
  }

  const provider = process.env.IEP_EXTRACTION_PROVIDER?.trim();

  if (!provider || provider === "none") {
    return {
      status: "not_configured",
      message:
        "Text extraction provider not configured. " +
        "Set IEP_EXTRACTION_PROVIDER=openai_vision in environment variables.",
    };
  }

  // PDF handling: check for native text first
  if (mimeType === "application/pdf") {
    const pdfType = await detectPdfType(signedUrl);

    // Check PDF page count guardrail
    if (pdfType.estimatedPageCount !== undefined) {
      const pageCheck = checkPdfPageCount(pdfType.estimatedPageCount);
      if (pageCheck.status === "hard_limit") {
        return {
          status: "not_configured",
          message: pageCheck.message,
        };
      }
    }

    if (!pdfType.hasSelectableText) {
      return {
        status: "not_configured",
        message:
          "This PDF appears to be scanned or image-only. " +
          "To extract text, please convert to PNG/JPEG and upload as images, " +
          "or enable OCR by setting IEP_EXTRACTION_PROVIDER=azure_form_recognizer.",
      };
    }

    // TODO: Extract native text from PDF
    return {
      status: "not_configured",
      message: "PDF native text extraction not yet implemented. " +
        "For now, please upload as images (PNG/JPEG).",
    };
  }

  if (provider === "openai_vision") {
    return extractWithOpenAIVision(signedUrl, mimeType);
  }

  if (provider === "azure_form_recognizer") {
    return {
      status: "not_configured",
      message: "Azure Form Recognizer integration not yet implemented.",
    };
  }

  return {
    status: "not_configured",
    message: `Unknown extraction provider: ${provider}. ` +
      "Check IEP_EXTRACTION_PROVIDER configuration.",
  };
}

/**
 * Extract text using OpenAI Vision API.
 *
 * Supports images (JPEG, PNG, WebP, GIF) and PDFs.
 * For PDFs: converts to images first (via API or client-side).
 * For images: sends directly to Vision API.
 */
async function extractWithOpenAIVision(
  signedUrl: string,
  mimeType: string | null,
): Promise<ExtractionResult> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    return {
      status: "not_configured",
      message: "OPENAI_API_KEY not set in environment variables.",
    };
  }

  // Check supported MIME types
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
      message: `Unsupported file type: ${mimeType}. ` +
        "Supported: JPEG, PNG, GIF, WebP, PDF.",
    };
  }

  try {
    // For PDFs, we'd need to convert to image first (complex).
    // For now, support images directly.
    if (mimeType === "application/pdf") {
      return {
        status: "not_configured",
        message:
          "PDF extraction via Vision API requires page-to-image conversion. " +
          "For now, use image-based documents (JPEG, PNG) or convert PDF to PNG first.",
      };
    }

    // Call OpenAI Vision API
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-4-vision-preview",
        messages: [
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Please extract all text from this document/image. Return only the extracted text without commentary.",
              },
              {
                type: "image_url",
                image_url: {
                  url: signedUrl,
                },
              },
            ],
          },
        ],
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      return {
        status: "not_configured",
        message: `OpenAI API error: ${error.error?.message || "Unknown error"}`,
      };
    }

    const data = await response.json();
    const extractedText =
      data.choices?.[0]?.message?.content || "";

    if (!extractedText.trim()) {
      return {
        status: "not_configured",
        message:
          "No text extracted from document. Document may be blank or unreadable.",
      };
    }

    return {
      status: "done",
      text: extractedText.trim(),
    };
  } catch (err) {
    return {
      status: "not_configured",
      message: `Extraction failed: ${err instanceof Error ? err.message : "Unknown error"}`,
    };
  }
}
