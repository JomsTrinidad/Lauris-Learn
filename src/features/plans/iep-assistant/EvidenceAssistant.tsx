"use client";

/**
 * Evidence Assistant — step-based modal for IEP drafting.
 *
 * Steps:
 *   1. select — choose evidence source (existing doc, upload PDF, upload image)
 *   2. extracting — spinner while extract API runs
 *   3. extracted — show extracted text preview or provider-not-configured message
 *   4. summarizing — spinner while /summarize API runs
 *   5. review — show suggestion cards with Apply/Edit/Reject actions
 *
 * Source modes:
 *   existing_doc  — pick from child_documents (existing behavior)
 *   upload_file   — user uploads a PDF directly
 *   upload_image  — user uploads an image (JPEG/PNG/WebP) — shows low-trust warning
 *
 * On Apply:
 *   - Call /api/iep-assistant/review to mark suggestion as applied
 *   - Call the corresponding setter (setPresentStrengths, etc.)
 *   - Show toast feedback
 *
 * Never writes to IEP plan directly; only patches React state.
 * The user still hits Save Draft to persist.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronRight,
  AlertCircle,
  CheckCircle2,
  XCircle,
  MessageCircle,
  Sparkles,
  Loader2,
  Upload,
  FileText,
  Image,
  ShieldAlert,
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
  EvidenceSourceMode,
  AppliedSuggestionMeta,
  ConfidenceLabel,
} from "./types";

const LOW_TRUST_METHODS = new Set(["image_ocr", "pdf_scanned"]);
import { DOCUMENT_TYPE_LABELS } from "@/features/documents/constants";

type Step = "select" | "extracting" | "extracted" | "summarizing" | "review";

interface EvidenceAssistantProps {
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
  onSectionApplied: (field: TargetField, meta: AppliedSuggestionMeta) => void;
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
    EvidenceAssistantProps,
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

const ALLOWED_FILE_MIMES = ["application/pdf"] as const;
const ALLOWED_IMAGE_MIMES = ["image/jpeg", "image/png", "image/webp"] as const;
const MAX_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function EvidenceAssistant({
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
}: EvidenceAssistantProps) {
  const supabase = useMemo(() => createClient(), []);

  // ─── UI state ─────────────────────────────────────────────────────────
  const [step, setStep] = useState<Step>("select");
  const [sourceMode, setSourceMode] = useState<EvidenceSourceMode>("existing_doc");
  const [error, setError] = useState<string | null>(null);

  // ─── Data state ────────────────────────────────────────────────────────
  const [reports, setReports] = useState<ReportDoc[]>([]);
  const [selectedSourceTitle, setSelectedSourceTitle] = useState<string>("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadFileError, setUploadFileError] = useState<string | null>(null);
  const [extractionId, setExtractionId] = useState<string | null>(null);
  const [extractedText, setExtractedText] = useState<string | null>(null);
  const [lowTrustWarning, setLowTrustWarning] = useState<string | null>(null);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [suggestions, setSuggestions] = useState<SuggestionRow[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editText, setEditText] = useState<string>("");
  const [appliedIds, setAppliedIds] = useState<Set<string>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // ─── Reset on open ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setStep("select");
    setSourceMode("existing_doc");
    setError(null);
    setExtractionId(null);
    setExtractedText(null);
    setLowTrustWarning(null);
    setSummaryId(null);
    setSuggestions([]);
    setSelectedSourceTitle("");
    setUploadFile(null);
    setUploadFileError(null);
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

  // ─── Client-side file validation ──────────────────────────────────────
  function validateFile(file: File, mode: "upload_file" | "upload_image"): string | null {
    const allowed = mode === "upload_file" ? ALLOWED_FILE_MIMES : ALLOWED_IMAGE_MIMES;
    if (!(allowed as readonly string[]).includes(file.type)) {
      return mode === "upload_file"
        ? "Only PDF files are supported for direct upload."
        : "Only JPEG, PNG, or WebP images are supported.";
    }
    if (file.size > MAX_FILE_BYTES) {
      return `File is too large (${formatBytes(file.size)}). Maximum is 10 MB.`;
    }
    return null;
  }

  // ─── Extract from existing document ───────────────────────────────────
  const handleExtractExisting = useCallback(async (report: ReportDoc) => {
    setSelectedSourceTitle(report.title);
    setStep("extracting");
    setError(null);

    try {
      const res = await fetch("/api/iep-assistant/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan_id: planId, document_id: report.id }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Extraction failed");
      }

      const data: ExtractResponse = await res.json();
      setExtractionId(data.extraction_id);
      setExtractedText(data.extracted_text ?? null);
      setLowTrustWarning(data.low_trust_warning ?? null);

      if (data.status === "not_configured") {
        setError("Extraction provider not configured");
      }
      setStep("extracted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setStep("select");
    }
  }, [planId]);

  // ─── Extract from uploaded file ────────────────────────────────────────
  const handleExtractUpload = useCallback(async () => {
    if (!uploadFile) return;
    const mode = sourceMode as "upload_file" | "upload_image";
    const validationError = validateFile(uploadFile, mode);
    if (validationError) { setUploadFileError(validationError); return; }

    setSelectedSourceTitle(uploadFile.name);
    setStep("extracting");
    setError(null);

    try {
      const formData = new FormData();
      formData.append("plan_id", planId);
      formData.append("file", uploadFile);

      const res = await fetch("/api/iep-assistant/extract-file", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        if (data.error === "soft_limit") {
          // Re-submit with confirmation header
          const retry = await fetch("/api/iep-assistant/extract-file", {
            method: "POST",
            headers: { "X-Accept-Extraction-Warning": "true" },
            body: formData,
          });
          if (!retry.ok) {
            const retryData = await retry.json();
            throw new Error(retryData.error || "Extraction failed");
          }
          const retryResponse: ExtractResponse = await retry.json();
          setExtractionId(retryResponse.extraction_id);
          setExtractedText(retryResponse.extracted_text ?? null);
          setLowTrustWarning(retryResponse.low_trust_warning ?? null);
          if (retryResponse.status === "not_configured") {
            setError("Extraction provider not configured");
          }
          setStep("extracted");
          return;
        }
        throw new Error(data.error || "Extraction failed");
      }

      const data: ExtractResponse = await res.json();
      setExtractionId(data.extraction_id);
      setExtractedText(data.extracted_text ?? null);
      setLowTrustWarning(data.low_trust_warning ?? null);
      if (data.status === "not_configured") {
        setError("Extraction provider not configured");
      }
      setStep("extracted");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Extraction failed");
      setStep("select");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [planId, uploadFile, sourceMode]);

  // ─── Summarize extraction ──────────────────────────────────────────────
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

  // ─── Apply suggestion ──────────────────────────────────────────────────
  const handleApply = useCallback(
    async (suggestion: SuggestionRow, editedText?: string) => {
      const text = editedText || suggestion.suggested_text;

      try {
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

        if (suggestion.target_field in FIELD_TO_SETTER) {
          const setterKey = FIELD_TO_SETTER[suggestion.target_field as keyof typeof FIELD_TO_SETTER];
          const setter: any = {
            setEvaluationResults,
            setPresentStrengths,
            setPresentNeeds,
            setParentConcerns,
            setDisabilityImpact,
          }[setterKey];
          if (setter) setter(text);
        } else if (suggestion.target_field === "goal") {
          setGoals((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
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
          setBarriers((prev) => [
            ...prev,
            {
              id: crypto.randomUUID(),
              difficulty: "",
              learning_barriers: text,
              learning_facilitators: "",
              accommodations: "",
            },
          ]);
        }

        setAppliedIds((prev) => new Set([...prev, suggestion.id]));

        const meta: AppliedSuggestionMeta = {
          suggestionId: suggestion.id,
          targetField: suggestion.target_field,
          sourceDocumentTitle: (suggestion.source_document_title ?? selectedSourceTitle) || null,
          extractionMethod: suggestion.extraction_method ?? null,
          isLowTrust: (LOW_TRUST_METHODS.has(suggestion.extraction_method ?? "")) || !!lowTrustWarning,
          reviewedBy: userId,
          appliedAt: new Date().toISOString(),
          originalText: suggestion.suggested_text,
          appliedText: text,
          wasEdited: !!editedText,
          sourceExcerpt: suggestion.source_excerpt,
          confidenceLabel: suggestion.confidence_label as ConfidenceLabel,
        };
        onSectionApplied(suggestion.target_field, meta);

        if (editingId === suggestion.id) {
          setEditingId(null);
          setEditText("");
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to apply");
      }
    },
    [planId, userId, selectedSourceTitle, lowTrustWarning, setEvaluationResults, setPresentStrengths, setPresentNeeds, setParentConcerns, setDisabilityImpact, setGoals, setBarriers, onSectionApplied, editingId],
  );

  // ─── Reject suggestion ──────────────────────────────────────────────────
  const handleReject = useCallback(async (suggestion: SuggestionRow) => {
    try {
      const res = await fetch("/api/iep-assistant/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ suggestion_id: suggestion.id, action: "reject" }),
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

  // ─── Render step: select ────────────────────────────────────────────────
  if (step === "select") {
    return (
      <Modal open={open} onClose={onClose} title="Evidence Assistant" className="max-w-2xl max-h-[90vh]">
        <p className="text-xs text-muted-foreground mb-4">
          Select or upload evidence to generate IEP suggestions. All suggestions require your review before being applied.
        </p>

        {/* Source mode tabs */}
        <div className="flex gap-1 p-1 bg-muted rounded-lg mb-4">
          {([
            { mode: "existing_doc" as const, label: "Existing Report", icon: FileText },
            { mode: "upload_file"  as const, label: "Upload PDF",      icon: Upload },
            { mode: "upload_image" as const, label: "Upload Image",     icon: Image },
          ]).map(({ mode, label, icon: Icon }) => (
            <button
              key={mode}
              type="button"
              onClick={() => { setSourceMode(mode); setUploadFile(null); setUploadFileError(null); }}
              className={cn(
                "flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors",
                sourceMode === mode
                  ? "bg-card shadow-sm text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>

        {error && <div className="mb-4"><ErrorAlert message={error} /></div>}

        {/* ── Tab: Existing Report ── */}
        {sourceMode === "existing_doc" && (
          <div className="space-y-2 max-h-[50vh] overflow-y-auto">
            {reports.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">
                No progress reports found. Upload a therapy evaluation or progress report under Documents first.
              </div>
            ) : (
              reports.map((report) => (
                <button
                  key={report.id}
                  type="button"
                  onClick={() => handleExtractExisting(report)}
                  className="w-full text-left p-3 border border-border rounded-lg hover:bg-muted/50 transition-colors flex items-center justify-between group"
                >
                  <div>
                    <div className="font-medium text-sm">{report.title}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <Badge variant="default" className="text-xs">
                        {(DOCUMENT_TYPE_LABELS as Record<string, string>)[report.document_type] || report.document_type}
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
        )}

        {/* ── Tab: Upload PDF ── */}
        {sourceMode === "upload_file" && (
          <div className="space-y-3">
            <p className="text-xs text-muted-foreground">
              Upload a PDF therapy evaluation, progress report, or assessment. Text-based PDFs work best.
            </p>
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => fileInputRef.current?.click()}
            >
              <Upload className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
              {uploadFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{uploadFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(uploadFile.size)}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium">Click to select a PDF</p>
                  <p className="text-xs text-muted-foreground">PDF up to 10 MB</p>
                </>
              )}
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept="application/pdf"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setUploadFile(f);
                setUploadFileError(f ? validateFile(f, "upload_file") : null);
              }}
            />
            {uploadFileError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />{uploadFileError}
              </p>
            )}
          </div>
        )}

        {/* ── Tab: Upload Image ── */}
        {sourceMode === "upload_image" && (
          <div className="space-y-3">
            {/* Low-trust warning */}
            <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700/60">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">
                <strong>Lower accuracy:</strong> Image-based extraction uses AI vision and may miss text or make errors,
                especially for handwritten notes or low-quality photos. Review all suggestions carefully.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">
              Upload a photo or screenshot of a handwritten or printed report (JPEG, PNG, or WebP).
            </p>
            <div
              className="border-2 border-dashed border-border rounded-lg p-6 text-center cursor-pointer hover:border-primary/50 hover:bg-muted/30 transition-colors"
              onClick={() => imageInputRef.current?.click()}
            >
              <Image className="w-6 h-6 mx-auto text-muted-foreground mb-2" />
              {uploadFile ? (
                <div className="space-y-1">
                  <p className="text-sm font-medium">{uploadFile.name}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(uploadFile.size)}</p>
                </div>
              ) : (
                <>
                  <p className="text-sm font-medium">Click to select an image</p>
                  <p className="text-xs text-muted-foreground">JPEG, PNG, or WebP up to 10 MB</p>
                </>
              )}
            </div>
            <input
              ref={imageInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                setUploadFile(f);
                setUploadFileError(f ? validateFile(f, "upload_image") : null);
              }}
            />
            {uploadFileError && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="w-3 h-3 shrink-0" />{uploadFileError}
              </p>
            )}
          </div>
        )}

        <div className="border-t border-border pt-4 mt-4 flex gap-2 justify-end">
          <ModalCancelButton />
          {(sourceMode === "upload_file" || sourceMode === "upload_image") && (
            <Button
              type="button"
              onClick={handleExtractUpload}
              disabled={!uploadFile || !!uploadFileError}
            >
              <Sparkles className="w-4 h-4 mr-1.5" />
              Extract &amp; Analyze
            </Button>
          )}
        </div>
      </Modal>
    );
  }

  // ─── Render step: extracting ────────────────────────────────────────────
  if (step === "extracting") {
    return (
      <Modal open={open} onClose={onClose} title="Evidence Assistant" className="max-w-2xl">
        <div className="py-12 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm font-medium">Extracting text from {selectedSourceTitle}…</p>
          <p className="text-xs text-muted-foreground">This may take a moment.</p>
        </div>
      </Modal>
    );
  }

  // ─── Render step: extracted ─────────────────────────────────────────────
  if (step === "extracted") {
    const isProviderMissing = error === "Extraction provider not configured";

    return (
      <Modal open={open} onClose={onClose} title="Evidence Assistant" className="max-w-2xl max-h-[90vh]">
        <p className="text-xs text-muted-foreground mb-4">{selectedSourceTitle}</p>

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
          {/* Low-trust warning for image sources */}
          {lowTrustWarning && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700/60 flex items-start gap-2">
              <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800 dark:text-amber-200">{lowTrustWarning}</p>
            </div>
          )}

          {isProviderMissing && (
            <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900 space-y-1">
              <div className="font-medium flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Extraction Provider Not Configured
              </div>
              <p className="text-xs">
                To automatically extract text, configure OpenAI by setting{" "}
                <code className="font-mono">OPENAI_API_KEY</code> and{" "}
                <code className="font-mono">IEP_EXTRACTION_PROVIDER=openai</code>.
              </p>
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
            setSelectedSourceTitle("");
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

  // ─── Render step: summarizing ───────────────────────────────────────────
  if (step === "summarizing") {
    return (
      <Modal open={open} onClose={onClose} title="Evidence Assistant" className="max-w-2xl">
        <div className="py-12 text-center space-y-3">
          <Loader2 className="w-8 h-8 animate-spin mx-auto text-primary" />
          <p className="text-sm font-medium">Generating IEP suggestions…</p>
          <p className="text-xs text-muted-foreground">Mapping to IEP sections.</p>
        </div>
      </Modal>
    );
  }

  // ─── Render step: review ────────────────────────────────────────────────
  if (step === "review") {
    return (
      <Modal open={open} onClose={onClose} title="Review Suggested IEP Updates" className="max-w-3xl max-h-[90vh]">
        <p className="text-xs text-muted-foreground mb-2">
          From: {selectedSourceTitle}
        </p>

        {/* Low-trust warning carried into review step */}
        {lowTrustWarning && (
          <div className="mb-4 flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 dark:bg-amber-950/20 dark:border-amber-700/60">
            <ShieldAlert className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 dark:text-amber-200">{lowTrustWarning}</p>
          </div>
        )}

        {error && <div className="mb-4"><ErrorAlert message={error} /></div>}

        <div className="space-y-3 max-h-[50vh] overflow-y-auto">
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
                      ? "bg-green-50 border-green-200 dark:bg-green-950/20 dark:border-green-700/60"
                      : "bg-card border-border hover:border-primary/50",
                  )}
                >
                  <div className="flex items-start justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Badge variant="default" className="text-xs">
                        {sugg.target_section}
                      </Badge>
                      <span className="font-medium text-sm">
                        {FIELD_TO_LABEL[sugg.target_field] || sugg.target_field}
                      </span>
                    </div>
                    {isApplied && <CheckCircle2 className="w-4 h-4 text-green-600" />}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mb-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <MessageCircle className="w-3 h-3" />
                      Confidence: {sugg.confidence_label}
                    </span>
                    {sugg.source_document_title && (
                      <span className="flex items-center gap-1">
                        <FileText className="w-3 h-3" />
                        {sugg.source_document_title}
                      </span>
                    )}
                    {sugg.extraction_method && LOW_TRUST_METHODS.has(sugg.extraction_method) && (
                      <span className="flex items-center gap-1 text-amber-600">
                        <ShieldAlert className="w-3 h-3" />
                        OCR — review carefully
                      </span>
                    )}
                  </div>

                  {sugg.source_excerpt && (
                    <div className="mb-3 p-2 rounded bg-muted/50 border-l-2 border-muted text-xs italic text-muted-foreground">
                      &ldquo;{sugg.source_excerpt}&rdquo;
                    </div>
                  )}

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
                        <Button type="button" size="sm" onClick={() => handleApply(sugg, editText)} disabled={!editText.trim()}>
                          Apply Edited Text
                        </Button>
                        <Button type="button" size="sm" variant="outline" onClick={() => { setEditingId(null); setEditText(""); }}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  ) : (
                    <div className="mb-3 p-3 rounded bg-muted/30 border border-muted text-sm">
                      {sugg.suggested_text}
                    </div>
                  )}

                  {!isApplied && !isEditing && (
                    <div className="flex gap-2">
                      <Button type="button" size="sm" onClick={() => handleApply(sugg)} className="flex-1">
                        Apply
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        onClick={() => { setEditingId(sugg.id); setEditText(sugg.suggested_text); }}
                        className="flex-1"
                      >
                        Edit &amp; Apply
                      </Button>
                      <Button type="button" size="sm" variant="outline" onClick={() => handleReject(sugg)}>
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
        <div className="-mx-6 -mb-6 px-6 py-3 bg-blue-50 border-t border-blue-200 dark:bg-blue-950/20 dark:border-blue-700/60 text-xs text-blue-900 dark:text-blue-200">
          <div className="flex items-start gap-2">
            <MessageCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium">Human review required — suggestions are drafts only.</p>
              <p className="mt-1">Changes are applied to your IEP draft only when you click Apply. Save the plan to persist.</p>
            </div>
          </div>
        </div>

        <div className="border-t border-border pt-4 flex gap-2 justify-between">
          <Button type="button" variant="outline" onClick={() => {
            setStep("select");
            setSelectedSourceTitle("");
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
