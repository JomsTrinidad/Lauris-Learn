"use client";

import { useState } from "react";
import { Eye, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  ClinicDocAccessError,
  openClinicDocumentForAccess,
} from "./clinic-documents-api";

interface Props {
  documentId: string;
  action: "preview_opened" | "download";
  /** Hide entirely (used when permissions.download=false for non-admin). */
  hidden?: boolean;
  size?: "sm" | "default";
  variant?: "default" | "outline" | "ghost";
}

export function ClinicDocumentAccessButton({
  documentId,
  action,
  hidden,
  size = "sm",
  variant = "outline",
}: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (hidden) return null;

  async function handleClick() {
    setError(null);
    setBusy(true);
    try {
      await openClinicDocumentForAccess(documentId, action);
    } catch (err) {
      const msg =
        err instanceof ClinicDocAccessError
          ? err.message
          : "Couldn't open the document. Please try again.";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  const Icon = action === "download" ? Download : Eye;
  const label = action === "download" ? "Download" : "View";

  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Button
        type="button"
        size={size}
        variant={variant}
        onClick={handleClick}
        disabled={busy}
      >
        {busy ? (
          <Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />
        ) : (
          <Icon className="w-3.5 h-3.5 mr-1" />
        )}
        {label}
      </Button>
      {error && (
        <span className="text-xs text-red-700">{error}</span>
      )}
    </span>
  );
}
