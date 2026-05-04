"use client";

import { useState } from "react";
import { ExternalLink, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { openCareDocumentForAccess, CareDocumentAccessError } from "./care-documents-api";
import type { DocumentAccessAction } from "./types";

interface Props {
  documentId: string;
  action: DocumentAccessAction;
  label?: string;
  variant?: "primary" | "outline";
  size?: "sm" | "md";
  className?: string;
}

export function CareDocumentAccessButton({
  documentId,
  action,
  label,
  variant = "outline",
  size = "sm",
  className,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const Icon = action === "download" ? Download : ExternalLink;
  const defaultLabel = action === "download" ? "Download" : "View";

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await openCareDocumentForAccess(documentId, action);
    } catch (err) {
      if (err instanceof CareDocumentAccessError) {
        setError(err.message);
      } else {
        setError("Something went wrong.");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inline-flex flex-col items-end gap-1">
      <Button
        type="button"
        size={size}
        variant={variant}
        disabled={busy}
        onClick={handleClick}
        className={className}
      >
        {busy ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Icon className="w-4 h-4" />
        )}
        {label ?? defaultLabel}
      </Button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </div>
  );
}
