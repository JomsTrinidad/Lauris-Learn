/**
 * Supabase queries for IEP Progress Report Assistant.
 * Browser-side queries for fetching progress reports, extractions, summaries, and suggestions.
 */

import { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { ReportDoc, SuggestionRow, AppliedSuggestionMeta, EvidenceHistoryEntry, TargetField, ConfidenceLabel } from "./types";

const LOW_TRUST_METHODS = new Set(["image_ocr", "pdf_scanned"]);

type DbClient = SupabaseClient<Database>;

/**
 * Fetch progress report documents for a student.
 * Filters to therapy_evaluation, therapy_progress, dev_pediatrician_report, medical_certificate.
 * Ordered by effective_date (newest first), then created_at.
 */
export async function getProgressReports(
  supabase: DbClient,
  schoolId: string,
  studentId: string,
): Promise<ReportDoc[]> {
  const { data, error } = await supabase
    .from("child_documents")
    .select("id, title, document_type, effective_date, created_at")
    .eq("school_id", schoolId)
    .eq("student_id", studentId)
    .in("document_type", [
      "therapy_evaluation",
      "therapy_progress",
      "dev_pediatrician_report",
      "medical_certificate",
    ])
    .order("effective_date", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as ReportDoc[];
}

/**
 * Fetch extractions for a plan.
 * Returns recent extractions first.
 */
export async function getExtractionsByPlan(
  supabase: DbClient,
  planId: string,
): Promise<Array<{ id: string; status: string; created_at: string }>> {
  const { data, error } = await supabase
    .from("iep_report_extractions")
    .select("id, status, created_at")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as Array<{ id: string; status: string; created_at: string }>;
}

/**
 * Fetch all suggestions for a plan.
 * Used for the review panel to show previously generated suggestions.
 */
export async function getSuggestionsByPlan(
  supabase: DbClient,
  planId: string,
): Promise<SuggestionRow[]> {
  const { data, error } = await supabase
    .from("iep_ai_suggestions")
    .select("*")
    .eq("plan_id", planId)
    .order("created_at", { ascending: false });

  if (error) throw error;
  return (data || []) as SuggestionRow[];
}

/**
 * Mark a suggestion as applied, rejected, or edited.
 * Updates status, applied_text (if edited), reviewed_by, and reviewed_at.
 */
export async function markSuggestionReviewed(
  supabase: DbClient,
  suggestionId: string,
  action: "apply" | "reject" | "edit",
  userId: string,
  appliedText?: string,
): Promise<void> {
  const base = {
    status: (action === "apply" || action === "edit" ? "applied" : "rejected") as "applied" | "rejected",
    reviewed_by: userId,
    reviewed_at: new Date().toISOString(),
  };

  const updates = action === "edit" && appliedText !== undefined
    ? { ...base, applied_text: appliedText }
    : base;

  const { error } = await supabase
    .from("iep_ai_suggestions")
    .update(updates)
    .eq("id", suggestionId);

  if (error) throw error;
}

/**
 * Fetch applied/edited suggestions for a plan.
 * Used to rebuild ProvenanceMap on plan load.
 */
export async function getAppliedSuggestionsForPlan(
  supabase: DbClient,
  planId: string,
): Promise<AppliedSuggestionMeta[]> {
  const { data, error } = await supabase
    .from("iep_ai_suggestions")
    .select(
      "id, target_field, source_document_title, extraction_method, reviewed_by, reviewed_at, suggested_text, applied_text, status, source_excerpt, confidence_label",
    )
    .eq("plan_id", planId)
    .in("status", ["applied", "edited"])
    .order("reviewed_at", { ascending: false });

  if (error) throw error;

  const rows = (data || []) as Array<{
    id: string;
    target_field: string;
    source_document_title: string | null;
    extraction_method: string | null;
    reviewed_by: string | null;
    reviewed_at: string | null;
    suggested_text: string;
    applied_text: string | null;
    status: string;
    source_excerpt: string | null;
    confidence_label: string;
  }>;

  return rows.map((r) => ({
    suggestionId: r.id,
    targetField: r.target_field as TargetField,
    sourceDocumentTitle: r.source_document_title,
    extractionMethod: r.extraction_method,
    isLowTrust: LOW_TRUST_METHODS.has(r.extraction_method ?? ""),
    reviewedBy: r.reviewed_by,
    appliedAt: r.reviewed_at,
    originalText: r.suggested_text,
    appliedText: r.applied_text ?? r.suggested_text,
    wasEdited: r.status === "edited",
    sourceExcerpt: r.source_excerpt,
    confidenceLabel: r.confidence_label as ConfidenceLabel,
  }));
}

/**
 * Fetch evidence history for a plan, grouped by summary.
 * Used in the Step6 Evidence History panel.
 */
export async function getEvidenceHistoryForPlan(
  supabase: DbClient,
  planId: string,
): Promise<EvidenceHistoryEntry[]> {
  const { data, error } = await supabase
    .from("iep_ai_suggestions")
    .select("summary_id, source_document_title, extraction_method, reviewed_at, status")
    .eq("plan_id", planId)
    .in("status", ["applied", "edited"])
    .order("reviewed_at", { ascending: false });

  if (error) throw error;

  const rows = (data || []) as Array<{
    summary_id: string;
    source_document_title: string | null;
    extraction_method: string | null;
    reviewed_at: string | null;
    status: string;
  }>;

  const grouped = new Map<string, EvidenceHistoryEntry>();
  for (const r of rows) {
    const existing = grouped.get(r.summary_id);
    if (existing) {
      existing.appliedCount += 1;
      if (r.reviewed_at && (!existing.lastAppliedAt || r.reviewed_at > existing.lastAppliedAt)) {
        existing.lastAppliedAt = r.reviewed_at;
      }
    } else {
      grouped.set(r.summary_id, {
        summaryId: r.summary_id,
        sourceDocumentTitle: r.source_document_title,
        extractionMethod: r.extraction_method,
        isLowTrust: LOW_TRUST_METHODS.has(r.extraction_method ?? ""),
        appliedCount: 1,
        lastAppliedAt: r.reviewed_at,
      });
    }
  }

  return Array.from(grouped.values());
}

/**
 * Fetch a specific extraction row (for verification).
 */
export async function getExtraction(
  supabase: DbClient,
  extractionId: string,
): Promise<{
  id: string;
  plan_id: string;
  status: string;
  extracted_text: string | null;
} | null> {
  const { data, error } = await supabase
    .from("iep_report_extractions")
    .select("id, plan_id, status, extracted_text")
    .eq("id", extractionId)
    .maybeSingle();

  if (error) throw error;
  return data as any;
}

/**
 * Fetch a specific summary row (for verification).
 */
export async function getSummary(
  supabase: DbClient,
  summaryId: string,
): Promise<{
  id: string;
  plan_id: string;
  status: string;
  therapy_focus: string | null;
  strengths: string | null;
  areas_of_need: string | null;
  progress_since_last: string | null;
  recommended_supports: string | null;
  suggested_goals: string | null;
  followup_notes: string | null;
} | null> {
  const { data, error } = await supabase
    .from("iep_report_summaries")
    .select(
      "id, plan_id, status, therapy_focus, strengths, areas_of_need, progress_since_last, recommended_supports, suggested_goals, followup_notes",
    )
    .eq("id", summaryId)
    .maybeSingle();

  if (error) throw error;
  return data as any;
}
