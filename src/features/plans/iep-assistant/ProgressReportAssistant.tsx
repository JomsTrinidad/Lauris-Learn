"use client";

/**
 * Progress Report Assistant — step-based modal for IEP drafting.
 *
 * Steps:
 *   1. select — pick a progress report from available documents
 *   2. extracting — spinner while /extract API runs
 *   3. extracted — show extracted text preview or provider-not-configured message
 *   4. summarizing — spinner while /summarize API runs
 *   5. review — show suggestion cards with Apply/Edit/Reject actions
 *
 * On Apply:
 *   - Call /api/iep-assistant/review to mark suggestion as applied
 *   - Call the corresponding setter (setPresentStrengths, etc.)
 *   - For goal/barrier: append new row to goals/barriers arrays
 *   - Show toast feedback
 *
 * Never writes to IEP plan directly; only patches React state.
 * The user still hits Save Draft to persist.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Copy,
  MessageCircle,
  Sparkles,
  Loader2,
  X,
} from "lucide-react";
import { Modal, ModalCancelButton } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ErrorAlert } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { getProgressReports } from "./queries";
import type {
  ReportDoc,
  ExtractResponse,
  SummarizeResponse,
  SuggestionRow,
  TargetField,
} from "./types";
import { DOCUMENT_TYPE_LABELS } from "@/features/documents/constants";

type Step = "select" | "extracting" | "extracted" | "summarizing" | "review";

interface ProgressReportAssistantProps {
  open: boolean;
  onClose: () => void;
  planId: string;
  studentId: string;
  schoolId: string;
  userId: string;
  userRole: string | null;
  setEvaluationResults: (v: string) => void;
  setPresentStrengths: (v: string) => void;
  setPresentNeeds: (v: string) => void;
  setParentConcerns: (v: string) => void;
  setDisabilityImpact: (v: string) => void;
  setGoals: React.Dispatch<React.SetStateAction<any[]>>;
  setBarriers: React.Dispatch<React.SetStateAction<any[]>>;
  onSectionApplied: (label: string) => void;
}

const FIELD_TO_LABEL: Record<TargetField, string> = {
  evaluation_results: "Evaluation Results",
  present_academic_strengths: "Academic Strengths",
  present_academic_needs: "Academic Needs",
  parent_concerns: "Parental Concerns",
  disability_impact: "Disability Impact",
  goal: "Goal",
  barrier: "Barrier / Accommodation",
};

const FIELD_TO_SETTER: Record<
  Exclude<TargetField, "goal" | "barrier">,
  keyof Omit<
    ProgressReportAssistantProps,
    | "open"
    | "onClose"
    | "planId"
    | "studentId"
    | "schoolId"
    | "userId"
    | "userRole"
    | "setGoals"
    | "setBarriers"
    | "onSectionApplied"
  >
> = {
  evaluation_results: "setEvaluationResults",
  present_academic_strengths: "setPresentStrengths",
  present_academic_needs: "setPresentNeeds",
  parent_concerns: "setParentConcerns",
  disability_impact: "setDisabilityImpact",
};

export function ProgressReportAssistant({
  open,
  onClose,
  planId,
  studentId,
  schoolId,
  userId,
  userRole,
  setEvaluationResults,
  setPresentStrengths,
  setPresentNeeds,
  setParentConcerns,
  setDisabilityImpact,
  setGoals,
  setBarriers,
  onSectionApplied,
}: ProgressReportAssistantProps) {
  const supabase = useMemo(() => createClient(), []);

  // ─── UI state ─────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("select");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // ─── Data state ────────────────────────────────────────────────────
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [selectedReport, setSelectedReport] = useState<ReportDoc | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  // ─── Load progress reports on mount ────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStep("select");
    setError(null);
    setExtractionId(null);
    setExtractedText(null);
    setSummaryId(null);
    setSuggestions([]);
    setSelectedReport(null);
    setEditingId(null);
    setAppliedIds(new Set());

    (async () => {
      try {
        const docs = await getProgressReports(supabase, schoolId, studentId);
        setReports(docs);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to load reports");
      }
    })();
  }, [open, supabase, schoolId, studentId]);

  // ─── Extract document ──────────────────────────────────────────────
  const handleExtract = useCallback(async (reportDoc: ReportDoc) => {
    setSelectedReport(reportDoc);
    setStep("extracting");
    setError(null);

    try {
      const res = await fetch("/api/iep-assistant/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan_id: planId,
          document_id: reportDoc.id,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Extraction failed");
      }

      const data: ExtractResponse = await res.json();
      setExtractionId(data.extraction_id);
      setExtractedText(data.extracted_text ?? null);

      if (data.status === "not_configured") {
        setStep("extracted");
        setError("Extraction provider not configured");
      } else {
        setStep("extracted");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setStep("select");
    }
  }, [planId]);

  // ─── Summarize extraction ──────────────────────────────────────────
  const handleSummarize = useCallback(async () => {
    if (!extractionId) return;
    setStep("summarizing");
    setError(null);

    try {
      const res = await fetch("/api/iep-assistant/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ extraction_id: extractionId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Summarization failed");
      }

      const data: SummarizeResponse = await res.json();
      setSummaryId(data.summary_id);
      setSuggestions(data.suggestions ?? []);

      if (data.status === "not_configured") {
        setError("AI provider not configured. Showing deterministic suggestions.");
      }

      setStep("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Summarization failed");
      setStep("extracted");
    }
  }, [extractionId]);

  // ─── Apply suggestion ──────────────────────────────────────────────
  const handleApply = useCallback(
    async (suggestion: SuggestionRow, editedText?: string) => {
      const text = editedText || suggestion.suggested_text;

      try {
        // Mark as applied in DB
        const res = await fetch("/api/iep-assistant/review", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            suggestion_id: suggestion.id,
            action: editedText ? "edit" : "apply",
            applied_text: editedText || undefined,
          }),
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Failed to apply suggestion");
        }

        // Apply to IEP form via React state setter
        if (suggestion.target_field in FIELD_TO_SETTER) {
          const setterKey = FIELD_TO_SETTER[suggestion.target_field as keyof typeof FIELD_TO_SETTER];
          const setter: any = {
            setEvaluationResults,
            setPresentStrengths,
            setPresentNeeds,
            setParentConcerns,
            setDisabilityImpact,
          }[setterKey];
          if (setter) {
            setter(text);
          }
        } else if (suggestion.target_field === "goal") {
          // Add new goal row
          const goalId = crypto.randomUUID();
          setGoals((prev) => [
            ...prev,
            {
              id: goalId,
              plan_id: planId,
              domain: "",
              description: text,
              target_date: null,
              measurement_method: "",
              baseline: "",
              success_criteria: "",
              enroute_objectives: "",
              timeline: "",
              responsible_person: "",
              remarks: "",
              sort_order: prev.length,
              created_at: new Date().toISOString(),
            },
          ]);
        } else if (suggestion.target_field === "barrier") {
          // Add new barrier row
          const barrierId = crypto.randomUUID();
          setBarriers((prev) => [
            ...prev,
            {
              id: barrierId,
              difficulty: "",
              learning_barriers: text,
              learning_facilitators: "",
              accommodations: "",
            },
          ]);
        }

        setAppliedIds((prev) => new Set([...prev, suggestion.id]));
        onSectionApplied(FIELD_TO_LABEL[suggestion.target_field]);

        if (editingId === suggestion.id) {
          setEditingId(null);
          setEditText("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply");
      }
    },
    [planId, setEvaluationResults, setPresentStrengths, setPresentNeeds, setParentConcerns, setDisabilityImpact, setGoals, setBarriers, onSectionApplied, editingId],
  );

  // ─── Reject suggestion ──────────────────────────────────────────────
  const handleReject = useCallback(async (suggestion: SuggestionRow) => {
    try {
      const res = await fetch("/api/iep-assistant/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          suggestion_id: suggestion.id,
          action: "reject",
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to reject");
      }

      setAppliedIds((prev) => new Set([...prev, suggestion.id]));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reject");
    }
  }, []);

  // ─── Render step: select ────────────────────────────────────────────
  if (step === "select") {
    return (
      <Modal open={open} onClose={onClose} className="max-w-2xl max-h-[90vh]">
        <div className="-mx-6 -mt-6 px-6 pt-6 pb-4 border-b border-border">
          <div className="flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">Use Progress Report to Draft IEP</h2>
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            Select a therapy or progress report to extract and generate IEP suggestions.
          </p>
        </div>

        {error && <div className="m-4"><ErrorAlert message={error} /></div>}

        <div className="py-4 space-y-2 max-h-[60vh] overflow-y-auto">
          {reports.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              No progress reports found. Upload a therapy evaluation or progress report first.
            </div>
          ) : (
            reports.map((report) => (
              <button
                key={report.id}
                type="button"
                onClick={() => handleExtract(report)}
                className="w-full text-left p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between group"
              >
                <div>
                  <div className="font-medium text-sm">{report.title}</div>
                  <div className="flex items-center gap-2 mt-1">
                    <Badge variant="secondary" className="text-xs">
                      {DOCUMENT_TYPE_LABELS[report.document_type as any] || report.document_type}
                    </Badge>
                    {report.effective_date && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(report.effective_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground" />
              </button>
            ))
          )}
        </div>

        <div className="border-t border-border pt-4 flex gap-2 justify-end">
          <ModalCancelButton onClick={onClose}>Cancel</ModalCancelButton>
        </div>
      </Modal>
    );
  }

  // ─── Render step: extracting ────────────────────────────────────────
  if (step === "extracting") {
    return (
      <Modal open={open} onClose={onClose} className="max-w-2xl">
        <div className="py-12 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm font-medium">Extracting text from {selectedReport?.title}…</p>
          <p className="text-xs text-muted-foreground">This may take a moment.</p>
        </div>
      </Modal>
    );
  }

  // ─── Render step: extracted ────────────────────────────────────────
  if (step === "extracted") {
    const isProviderMissing = error === "Extraction provider not configured";

    return (
      <Modal open={open} onClose={onClose} className="max-w-2xl max-h-[90vh]">
        <div className="-mx-6 -mt-6 px-6 pt-6 pb-4 border-b border-border">
          <h2 className="text-lg font-semibold">Extracted Text</h2>
          <p className="text-xs text-muted-foreground mt-1">{selectedReport?.title}</p>
        </div>

        <div className="py-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {isProviderMissing && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-1">
              <div className="font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Text Extraction Provider Not Configured
              </div>
              <p className="text-xs">
                To automatically extract text from PDFs and scanned images, configure an OCR provider
                (e.g. Azure Form Recognizer). For now, you can upload text-based PDFs.
              </p>
              <p className="text-xs">You can still generate IEP suggestions if you have text available.</p>
            </div>
          )}

          {extractedText && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground mb-2">Extracted Text Preview</p>
              <div className="p-3 rounded-lg bg-muted border border-border text-sm whitespace-pre-wrap max-h-40 overflow-y-auto font-mono text-xs">
                {extractedText.substring(0, 1500)}
                {extractedText.length > 1500 && "…"}
              </div>
            </div>
          )}
        </div>

        <div className="border-t border-border pt-4 flex gap-2 justify-between">
          <Button type="button" variant="outline" onClick={() => {
            setStep("select");
            setSelectedReport(null);
          }}>
            Back
          </Button>
          <Button type="button" onClick={handleSummarize} disabled={!extractedText && !isProviderMissing}>
            Next: Generate Suggestions
          </Button>
        </div>
      </Modal>
    );
  }

  // ─── Render step: summarizing ────────────────────────────────────────
  if (step === "summarizing") {
    return (
      <Modal open={open} onClose={onClose} className="max-w-2xl">
        <div className="py-12 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm font-medium">Generating IEP suggestions…</p>
          <p className="text-xs text-muted-foreground">Mapping to IEP sections.</p>
        </div>
      </Modal>
    );
  }

  // ─── Render step: review ────────────────────────────────────────────
  if (step === "review") {
    return (
      <Modal open={open} onClose={onClose} className="max-w-3xl max-h-[90vh]">
        <div className="-mx-6 -mt-6 px-6 pt-6 pb-4 border-b border-border flex justify-between items-start">
          <div>
            <h2 className="text-lg font-semibold">Review Suggested IEP Updates</h2>
            <p className="text-xs text-muted-foreground mt-1">
              From: {selectedReport?.title}
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-muted-foreground hover:text-foreground">
            <X className="w-5 h-5" />
          </button>
        </div>

        {error && <div className="m-4"><ErrorAlert message={error} /></div>}

        <div className="py-4 space-y-3 max-h-[65vh] overflow-y-auto">
          {suggestions.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground px-4">
              No suggestions generated. The document may not contain actionable IEP content.
            </div>
          ) : (
            suggestions.map((sugg) => {
              const isApplied = appliedIds.has(sugg.id);
              const isEditing = editingId === sugg.id;

              return (
                <div
                  key={sugg.id}
                  className={cn(
                    "p-4 rounded-lg border transition-colors",
                    isApplied
                      ? "bg-green-50 border-green-200"
                      : "bg-white border-border hover:border-primary/50",
                  )}
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-xs">
                        {sugg.target_section}
                      </Badge>
                      <span className="font-medium text-sm">
                        {FIELD_TO_LABEL[sugg.target_field] || sugg.target_field}
                      </span>
                    </div>
                    {isApplied && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                  </div>

                  {/* Source info */}
                  <div className="flex items-center gap-1 mb-2 text-xs text-muted-foreground">
                    <MessageCircle className="w-3 h-3" />
                    <span>Confidence: {sugg.confidence_label}</span>
                  </div>

                  {/* Source excerpt */}
                  {sugg.source_excerpt && (
                    <div className="mb-3 p-2 rounded bg-muted/50 border-l-2 border-muted text-xs italic text-muted-foreground">
                      "{sugg.source_excerpt}"
                    </div>
                  )}

                  {/* Text display or edit mode */}
                  {isEditing ? (
                    <div className="space-y-2 mb-3">
                      <Textarea
                        value={editText}
                        onChange={(e) => setEditText(e.target.value)}
                        placeholder="Edit the suggested text"
                        rows={3}
                        className="text-sm"
                      />
                      <div className="flex gap-2">
                        <Button
                          type="button"
                          size="sm"
                          onClick={() => handleApply(sugg, editText)}
                          disabled={!editText.trim()}
                        >
                          Apply Edited Text
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingId(null);
                            setEditText("");
                          }}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 p-3 rounded bg-muted/30 border border-muted text-sm">
                      {sugg.suggested_text}
                    </div>
                  )}

                  {/* Actions */}
                  {!isApplied && !isEditing && (
                    <div className="flex gap-2">
                      <Button
                        type="button"
                        size="sm"
                        onClick={() => handleApply(sugg)}
                        className="flex-1"
                      >
                        Apply
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingId(sugg.id);
                          setEditText(sugg.suggested_text);
                        }}
                        className="flex-1"
                      >
                        Edit & Apply
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => handleReject(sugg)}
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Footer banner */}
        <div className="-mx-6 -mb-6 px-6 py-3 bg-blue-50 border-t border-blue-200 text-xs text-blue-900">
          <div className="flex items-start gap-2">
            <MessageCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">AI-assisted draft — Suggested from progress report.</p>
              <p className="mt-1">Changes are applied to your IEP draft only when you click Apply. Save the plan to persist.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 flex gap-2 justify-between">
          <Button type="button" variant="outline" onClick={() => {
            setStep("select");
            setSelectedReport(null);
          }}>
            Back
          </Button>
          <Button type="button" onClick={onClose}>
            Done
          </Button>
        </div>
      </Modal>
    );
  }

  return null;
}
