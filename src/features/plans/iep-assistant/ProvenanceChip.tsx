"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, AlertTriangle, FileText } from "lucide-react";
import type { AppliedSuggestionMeta } from "./types";

const METHOD_LABELS: Record<string, string> = {
  pdf_native_text: "PDF text",
  pdf_scanned: "Scanned PDF (OCR)",
  image_ocr: "Image (OCR)",
  uploaded_file: "Uploaded file",
  skipped: "Skipped",
};

interface ProvenanceChipProps {
  meta: AppliedSuggestionMeta;
}

export function ProvenanceChip({ meta }: ProvenanceChipProps) {
  const [expanded, setExpanded] = useState(false);

  const methodLabel = meta.extractionMethod
    ? (METHOD_LABELS[meta.extractionMethod] ?? meta.extractionMethod)
    : null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        <FileText className="h-3 w-3 shrink-0" />
        {meta.wasEdited ? (
          <span>Originally drafted from evidence. This field may have been edited afterward.</span>
        ) : (
          <span>
            Applied from{" "}
            <span className="font-medium">
              {meta.sourceDocumentTitle ?? "evidence"}
            </span>
            {methodLabel && <span className="text-muted-foreground"> · {methodLabel}</span>}
          </span>
        )}
        {meta.isLowTrust && (
          <AlertTriangle className="h-3 w-3 text-amber-500 shrink-0" aria-label="Low-trust source" />
        )}
        {expanded ? (
          <ChevronUp className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronDown className="h-3 w-3 shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="mt-1.5 rounded border border-border bg-muted/40 p-2.5 text-xs space-y-1.5">
          {meta.sourceDocumentTitle && (
            <div>
              <span className="text-muted-foreground">Source: </span>
              <span>{meta.sourceDocumentTitle}</span>
            </div>
          )}
          {methodLabel && (
            <div>
              <span className="text-muted-foreground">Method: </span>
              <span>{methodLabel}</span>
            </div>
          )}
          {meta.isLowTrust && (
            <div className="flex items-start gap-1 text-amber-600">
              <AlertTriangle className="h-3 w-3 shrink-0 mt-0.5" />
              <span>Low-trust source — extracted via OCR. Review carefully before submitting.</span>
            </div>
          )}
          {meta.confidenceLabel && (
            <div>
              <span className="text-muted-foreground">Confidence: </span>
              <span className="capitalize">{meta.confidenceLabel}</span>
            </div>
          )}
          {meta.sourceExcerpt && (
            <div>
              <span className="text-muted-foreground block mb-0.5">From document:</span>
              <blockquote className="border-l-2 border-border pl-2 italic text-muted-foreground">
                {meta.sourceExcerpt}
              </blockquote>
            </div>
          )}
          {meta.appliedAt && (
            <div>
              <span className="text-muted-foreground">Applied: </span>
              <span>{new Date(meta.appliedAt).toLocaleDateString()}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
