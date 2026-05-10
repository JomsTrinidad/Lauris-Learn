/**
 * Configuration for extraction and AI summary guardrails.
 * All limits are configurable via environment variables.
 *
 * Usage:
 *   import { getExtractionConfig } from './config';
 *   const cfg = getExtractionConfig();
 *   if (fileSize > cfg.maxFileSizeMB * 1024 * 1024) { ... }
 */

export interface ExtractionConfig {
  // File size limits
  maxFileSizeMB: number;
  maxFileSizeMBHard: number;
  maxFileSizeMBSoft: number;

  // PDF processing limits
  maxPdfPages: number;
  maxPdfPagesHard: number;
  maxPdfPagesSoft: number;

  // Image processing limits
  maxImagesPerReport: number;
  maxImagesPerReportHard: number;
  maxImagesPerReportSoft: number;

  // AI summary limits
  maxExtractedCharsForAi: number;
  maxAiSummariesPerChildPerDay: number;
  maxAiSummariesPerOrgPerDay: number;

  // Feature flags
  ocrEnabled: boolean;
  aiSummaryEnabled: boolean;
  pdfTextExtractionEnabled: boolean;

  // Logging
  logExtractionUsage: boolean;
  logAiUsage: boolean;
}

/**
 * Get extraction configuration from environment variables.
 * Returns sensible defaults if not configured.
 */
export function getExtractionConfig(): ExtractionConfig {
  return {
    // File size: default 10 MB, soft warn at 5 MB
    maxFileSizeMB: parseIntEnv("REPORT_EXTRACT_MAX_FILE_MB", 10),
    maxFileSizeMBHard: parseIntEnv("REPORT_EXTRACT_MAX_FILE_MB_HARD", 25),
    maxFileSizeMBSoft: parseIntEnv("REPORT_EXTRACT_MAX_FILE_MB_SOFT", 5),

    // PDF pages: default 10, hard limit 50
    maxPdfPages: parseIntEnv("REPORT_EXTRACT_MAX_PDF_PAGES", 10),
    maxPdfPagesHard: parseIntEnv("REPORT_EXTRACT_MAX_PDF_PAGES_HARD", 50),
    maxPdfPagesSoft: parseIntEnv("REPORT_EXTRACT_MAX_PDF_PAGES_SOFT", 5),

    // Images: default 5, hard limit 20
    maxImagesPerReport: parseIntEnv("REPORT_EXTRACT_MAX_IMAGES", 5),
    maxImagesPerReportHard: parseIntEnv("REPORT_EXTRACT_MAX_IMAGES_HARD", 20),
    maxImagesPerReportSoft: parseIntEnv("REPORT_EXTRACT_MAX_IMAGES_SOFT", 3),

    // AI summary: default 20k chars, 3 per child/day, 25 per org/day
    maxExtractedCharsForAi: parseIntEnv("REPORT_AI_MAX_CHARS", 20000),
    maxAiSummariesPerChildPerDay: parseIntEnv("REPORT_AI_MAX_PER_CHILD_DAY", 3),
    maxAiSummariesPerOrgPerDay: parseIntEnv("REPORT_AI_MAX_PER_ORG_DAY", 25),

    // Feature flags: default all off (safe mode)
    ocrEnabled: parseBoolEnv("REPORT_OCR_ENABLED", false),
    aiSummaryEnabled: parseBoolEnv("REPORT_AI_SUMMARY_ENABLED", false),
    pdfTextExtractionEnabled: parseBoolEnv("REPORT_PDF_TEXT_EXTRACTION_ENABLED", true),

    // Logging: default on
    logExtractionUsage: parseBoolEnv("REPORT_LOG_EXTRACTION_USAGE", true),
    logAiUsage: parseBoolEnv("REPORT_LOG_AI_USAGE", true),
  };
}

function parseIntEnv(key: string, defaultValue: number): number {
  const value = process.env[key];
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

function parseBoolEnv(key: string, defaultValue: boolean): boolean {
  const value = process.env[key]?.toLowerCase().trim();
  if (value === "true" || value === "1" || value === "yes") return true;
  if (value === "false" || value === "0" || value === "no") return false;
  return defaultValue;
}
