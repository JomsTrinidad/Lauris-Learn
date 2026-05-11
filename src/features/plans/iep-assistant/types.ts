/**
 * Types for IEP Evidence Assistant.
 * Extraction, summarization, suggestion mapping, and audit trail.
 */

// ─── Status types ────────────────────────────────────────────────────

export type ExtractionStatus = "pending" | "extracting" | "done" | "failed" | "not_configured";
export type SummaryStatus    = "pending" | "generating" | "done" | "failed" | "not_configured";
export type SuggestionStatus = "pending" | "applied" | "rejected" | "edited";
export type ConfidenceLabel  = "high" | "medium" | "low";
export type TargetSection    = "assessment" | "supports" | "goals";
export type TargetField      =
  | "evaluation_results"
  | "present_academic_strengths"
  | "present_academic_needs"
  | "parent_concerns"
  | "disability_impact"
  | "goal"
  | "barrier";

// ─── Evidence source ──────────────────────────────────────────────────
export type ExtractionMethod  = "pdf_native_text" | "pdf_scanned" | "image_ocr" | "uploaded_file" | "skipped";
export type EvidenceSourceMode = "existing_doc" | "upload_file" | "upload_image";

// ─── Row types (DB) ──────────────────────────────────────────────────

export interface ReportDoc {
  id: string;
  title: string;
  document_type: string;
  effective_date: string | null;
  created_at: string;
}

export interface ExtractionRow {
  id: string;
  status: ExtractionStatus;
  extracted_text: string | null;
  extraction_error: string | null;
  provider: string | null;
  extraction_method: string | null;
  page_count: number | null;
  processed_page_count: number | null;
  image_count: number | null;
  extracted_character_count: number | null;
  ai_character_count: number | null;
  skipped_reason: string | null;
}

export interface SummarySection {
  therapy_focus?: string | null;
  strengths?: string | null;
  areas_of_need?: string | null;
  progress_since_last?: string | null;
  recommended_supports?: string | null;
  suggested_goals?: string | null;
  followup_notes?: string | null;
}

export interface SummaryRow extends SummarySection {
  id: string;
  status: SummaryStatus;
  summary_error: string | null;
}

export interface SuggestionRow {
  id: string;
  target_section: TargetSection;
  target_field: TargetField;
  suggested_text: string;
  source_excerpt: string | null;
  confidence_label: ConfidenceLabel;
  status: SuggestionStatus;
  applied_text: string | null;
  reviewed_at: string | null;
  source_document_id: string;
  source_document_title: string | null;
  extraction_method: string | null;
}

// ─── Provenance tracking ──────────────────────────────────────────────

export interface AppliedSuggestionMeta {
  suggestionId: string;
  targetField: TargetField;
  sourceDocumentTitle: string | null;
  extractionMethod: string | null;
  isLowTrust: boolean;
  reviewedBy: string | null;
  appliedAt: string | null;
  originalText: string;
  appliedText: string;
  wasEdited: boolean;
  sourceExcerpt: string | null;
  confidenceLabel: ConfidenceLabel;
}

export type ProvenanceMap = Partial<Record<Exclude<TargetField, "goal" | "barrier">, AppliedSuggestionMeta>>;

export interface EvidenceHistoryEntry {
  summaryId: string;
  sourceDocumentTitle: string | null;
  extractionMethod: string | null;
  isLowTrust: boolean;
  appliedCount: number;
  lastAppliedAt: string | null;
}

// ─── API request/response contracts ──────────────────────────────────

export interface ExtractRequest {
  plan_id: string;
  document_id: string;
}

export interface ExtractResponse {
  extraction_id: string;
  status: ExtractionStatus;
  extracted_text?: string;
  message?: string;
  low_trust_warning?: string;
}

export interface SummarizeRequest {
  extraction_id: string;
}

export interface SummarizeResponse {
  summary_id: string;
  status: SummaryStatus;
  summary?: SummarySection;
  suggestions?: SuggestionRow[];
  message?: string;
}

export interface ReviewRequest {
  suggestion_id: string;
  action: "apply" | "reject" | "edit";
  applied_text?: string;
}

export interface ReviewResponse {
  ok: boolean;
  message?: string;
}

// ─── Service layer interfaces ────────────────────────────────────────

export interface ExtractionResult {
  status: "done" | "not_configured";
  text?: string;
  message?: string;
  // Metadata stored in iep_report_extractions flat columns
  extractionMethod?: ExtractionMethod;
  pageCount?: number;
  processedPageCount?: number;
  imageCount?: number;
  extractedCharCount?: number;
  aiCharCount?: number;
  skippedReason?: string;
}

export interface SummaryResult {
  status: "done" | "not_configured";
  sections?: SummarySection;
  message?: string;
}

export interface SuggestionInsert {
  target_section: TargetSection;
  target_field: TargetField;
  suggested_text: string;
  source_excerpt: string | null;
  confidence_label: ConfidenceLabel;
}
