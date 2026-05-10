/**
 * Cost guardrails and daily limit enforcement.
 *
 * Checks:
 *   - File size (soft warn, hard block)
 *   - PDF page count (soft warn, hard block)
 *   - Image count (soft warn, hard block)
 *   - Character count to send to AI (truncate if needed)
 *   - Daily AI summary limits per child and organization
 *
 * Returns clear status: OK, SOFT_LIMIT (warn user), or HARD_LIMIT (block).
 */

import { getExtractionConfig } from "./config";

export type GuardrailStatus = "ok" | "soft_limit" | "hard_limit";

export interface GuardrailCheckResult {
  status: GuardrailStatus;
  message: string;
  details?: {
    actualValue: number;
    softLimit: number;
    hardLimit: number;
  };
}

export interface DailyLimitCheckResult {
  status: GuardrailStatus;
  message: string;
  used: number;
  limit: number;
}

/**
 * Check file size against guardrails.
 */
export function checkFileSize(
  fileSizeBytes: number,
): GuardrailCheckResult {
  const config = getExtractionConfig();
  const fileSizeMB = fileSizeBytes / (1024 * 1024);

  if (fileSizeMB > config.maxFileSizeMBHard) {
    return {
      status: "hard_limit",
      message: `File size (${fileSizeMB.toFixed(1)} MB) exceeds maximum (${config.maxFileSizeMBHard} MB). Please upload a smaller file.`,
      details: {
        actualValue: Math.round(fileSizeMB * 10) / 10,
        softLimit: config.maxFileSizeMBSoft,
        hardLimit: config.maxFileSizeMBHard,
      },
    };
  }

  if (fileSizeMB > config.maxFileSizeMBSoft) {
    return {
      status: "soft_limit",
      message: `File size (${fileSizeMB.toFixed(1)} MB) is large. Processing may take longer and cost more. Continue?`,
      details: {
        actualValue: Math.round(fileSizeMB * 10) / 10,
        softLimit: config.maxFileSizeMBSoft,
        hardLimit: config.maxFileSizeMBHard,
      },
    };
  }

  return {
    status: "ok",
    message: "File size is within limits.",
  };
}

/**
 * Check PDF page count against guardrails.
 */
export function checkPdfPageCount(
  pageCount: number,
): GuardrailCheckResult {
  const config = getExtractionConfig();

  if (pageCount > config.maxPdfPagesHard) {
    return {
      status: "hard_limit",
      message: `PDF has ${pageCount} pages but maximum is ${config.maxPdfPagesHard} pages. Please extract relevant pages and re-upload.`,
      details: {
        actualValue: pageCount,
        softLimit: config.maxPdfPagesSoft,
        hardLimit: config.maxPdfPagesHard,
      },
    };
  }

  if (pageCount > config.maxPdfPagesSoft) {
    return {
      status: "soft_limit",
      message: `PDF has ${pageCount} pages. Processing all pages will cost more. Process only first ${config.maxPdfPages} pages?`,
      details: {
        actualValue: pageCount,
        softLimit: config.maxPdfPagesSoft,
        hardLimit: config.maxPdfPagesHard,
      },
    };
  }

  return {
    status: "ok",
    message: "PDF page count is within limits.",
  };
}

/**
 * Check image count against guardrails.
 */
export function checkImageCount(
  imageCount: number,
): GuardrailCheckResult {
  const config = getExtractionConfig();

  if (imageCount > config.maxImagesPerReportHard) {
    return {
      status: "hard_limit",
      message: `Report has ${imageCount} images but maximum is ${config.maxImagesPerReportHard} images. Please reduce image count.`,
      details: {
        actualValue: imageCount,
        softLimit: config.maxImagesPerReportSoft,
        hardLimit: config.maxImagesPerReportHard,
      },
    };
  }

  if (imageCount > config.maxImagesPerReportSoft) {
    return {
      status: "soft_limit",
      message: `Report has ${imageCount} images. Processing all images will cost more. Process only first ${config.maxImagesPerReport} images?`,
      details: {
        actualValue: imageCount,
        softLimit: config.maxImagesPerReportSoft,
        hardLimit: config.maxImagesPerReportHard,
      },
    };
  }

  return {
    status: "ok",
    message: "Image count is within limits.",
  };
}

/**
 * Truncate extracted text to fit AI limit.
 * Returns truncated text and character count sent.
 */
export function truncateForAi(text: string): {
  text: string;
  characterCount: number;
  wasTruncated: boolean;
} {
  const config = getExtractionConfig();
  const maxChars = config.maxExtractedCharsForAi;

  if (text.length <= maxChars) {
    return {
      text,
      characterCount: text.length,
      wasTruncated: false,
    };
  }

  // Find last sentence boundary before limit
  const truncated = text.substring(0, maxChars);
  const lastPeriod = truncated.lastIndexOf(".");
  const lastNewline = truncated.lastIndexOf("\n");
  const lastBreak = Math.max(lastPeriod, lastNewline);

  const finalText = lastBreak > maxChars * 0.8
    ? truncated.substring(0, lastBreak + 1)
    : truncated;

  return {
    text: finalText + " ...[truncated]",
    characterCount: finalText.length,
    wasTruncated: true,
  };
}

/**
 * Check if child has exceeded daily AI summary limit.
 * Requires database query; this is a type stub.
 * Implement in API route with actual DB check.
 */
export function getDailyLimitCheckQuery(
  childId: string,
): {
  childId: string;
  countToday: number;
  limit: number;
  sql: string;
} {
  const config = getExtractionConfig();
  const limit = config.maxAiSummariesPerChildPerDay;

  return {
    childId,
    countToday: 0, // Will be filled in by API route
    limit,
    sql: `
      SELECT COUNT(*) as count
      FROM iep_report_summaries
      WHERE student_id = '${childId}'
        AND DATE(created_at) = CURRENT_DATE
        AND status = 'done'
    `,
  };
}

/**
 * Check if organization has exceeded daily AI summary limit.
 * Requires database query; this is a type stub.
 */
export function getOrgDailyLimitCheckQuery(
  schoolId: string,
): {
  schoolId: string;
  countToday: number;
  limit: number;
  sql: string;
} {
  const config = getExtractionConfig();
  const limit = config.maxAiSummariesPerOrgPerDay;

  return {
    schoolId,
    countToday: 0, // Will be filled in by API route
    limit,
    sql: `
      SELECT COUNT(*) as count
      FROM iep_report_summaries
      WHERE school_id = '${schoolId}'
        AND DATE(created_at) = CURRENT_DATE
        AND status = 'done'
    `,
  };
}

/**
 * Format guardrail message for UI.
 */
export function formatGuardrailMessage(result: GuardrailCheckResult): string {
  if (result.details) {
    return (
      result.message +
      ` (Actual: ${result.details.actualValue}, Soft: ${result.details.softLimit}, Hard: ${result.details.hardLimit})`
    );
  }
  return result.message;
}
