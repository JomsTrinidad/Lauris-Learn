/**
 * Audit logging for extraction and AI operations.
 *
 * Logs to a local logger (console in dev, external service in prod).
 * Each log includes metadata for cost tracking and compliance.
 */

export type ExtractionMethod =
  | "pdf_native_text"
  | "pdf_scanned_ocr"
  | "image_ocr"
  | "text_document";

export interface ExtractionLog {
  source_document_id: string;
  school_id: string;
  extraction_method: ExtractionMethod;
  page_count: number;
  processed_page_count: number;
  extracted_character_count: number;
  ai_character_count: number;
  skipped_reason?: string;
  created_by: string;
  created_at: string;
}

export interface AiUsageLog {
  extraction_id: string;
  school_id: string;
  summary_id?: string;
  input_tokens: number;
  output_tokens: number;
  total_cost_usd: number;
  provider: string;
  model: string;
  created_by: string;
  created_at: string;
}

/**
 * Log extraction metadata.
 * In production, could send to external service (Datadog, LogRocket, etc.)
 * For now: console.log in development.
 */
export function logExtraction(log: ExtractionLog): void {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    console.log("[Extraction Log]", {
      document: log.source_document_id,
      method: log.extraction_method,
      pages: log.page_count,
      processedPages: log.processed_page_count,
      characters: log.extracted_character_count,
      aiChars: log.ai_character_count,
      skipped: log.skipped_reason,
      timestamp: log.created_at,
    });
  }

  // TODO: Send to external analytics service if configured
  // if (process.env.EXTRACTION_LOG_ENDPOINT) {
  //   await fetch(process.env.EXTRACTION_LOG_ENDPOINT, {
  //     method: 'POST',
  //     headers: { 'Content-Type': 'application/json' },
  //     body: JSON.stringify(log)
  //   }).catch(err => console.error('Failed to log extraction:', err));
  // }
}

/**
 * Log AI usage (tokens, cost).
 */
export function logAiUsage(log: AiUsageLog): void {
  const isDev = process.env.NODE_ENV === "development";
  if (isDev) {
    console.log("[AI Usage Log]", {
      extraction: log.extraction_id,
      summary: log.summary_id,
      provider: log.provider,
      model: log.model,
      inputTokens: log.input_tokens,
      outputTokens: log.output_tokens,
      costUsd: log.total_cost_usd.toFixed(4),
      timestamp: log.created_at,
    });
  }

  // TODO: Send to external analytics service if configured
}
