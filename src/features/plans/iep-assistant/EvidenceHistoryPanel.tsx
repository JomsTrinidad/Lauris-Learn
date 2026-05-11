"use client";

import { useEffect, useState } from "react";
import { FileText, AlertTriangle } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { getEvidenceHistoryForPlan } from "./queries";
import type { EvidenceHistoryEntry } from "./types";

const METHOD_LABELS: Record<string, string> = {
  pdf_native_text: "PDF text",
  pdf_scanned: "Scanned PDF (OCR)",
  image_ocr: "Image (OCR)",
  uploaded_file: "Uploaded file",
  skipped: "Skipped",
};

interface EvidenceHistoryPanelProps {
  planId: string;
}

export function EvidenceHistoryPanel({ planId }: EvidenceHistoryPanelProps) {
  const [entries, setEntries] = useState<EvidenceHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!planId) return;
    const supabase = createClient();
    getEvidenceHistoryForPlan(supabase, planId)
      .then(setEntries)
      .catch(() => setEntries([]))
      .finally(() => setLoading(false));
  }, [planId]);

  if (loading || entries.length === 0) return null;

  return (
    <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
        <FileText className="h-3.5 w-3.5" />
        Evidence Used In This IEP
      </div>
      <div className="space-y-1.5">
        {entries.map((entry) => {
          const methodLabel = entry.extractionMethod
            ? (METHOD_LABELS[entry.extractionMethod] ?? entry.extractionMethod)
            : null;
          return (
            <div
              key={entry.summaryId}
              className="flex items-start gap-2 text-xs"
            >
              <div className="flex-1 min-w-0">
                <span className="font-medium truncate">
                  {entry.sourceDocumentTitle ?? "Unknown source"}
                </span>
                {methodLabel && (
                  <span className="text-muted-foreground"> · {methodLabel}</span>
                )}
                {entry.isLowTrust && (
                  <span className="inline-flex items-center gap-0.5 ml-1 text-amber-600">
                    <AlertTriangle className="h-3 w-3" />
                    <span>OCR</span>
                  </span>
                )}
              </div>
              <span className="text-muted-foreground shrink-0">
                {entry.appliedCount} field{entry.appliedCount !== 1 ? "s" : ""} applied
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
