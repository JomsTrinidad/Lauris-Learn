/**
 * Pure formatters and predicates for the Document Coordination feature.
 * No I/O. No React. No Supabase.
 */

import { differenceInDays, format, parseISO } from "date-fns";
import { DOCUMENT_TYPE_LABELS } from "./constants";
import type { DocumentType } from "./types";

export function formatDocumentType(t: DocumentType): string {
  return DOCUMENT_TYPE_LABELS[t] ?? t;
}

export function formatBytes(n: number | null | undefined): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatDate(iso: string | null | undefined, fmt = "MMM d, yyyy"): string {
  if (!iso) return "—";
  try {
    return format(parseISO(iso), fmt);
  } catch {
    return "—";
  }
}

/** Whole-day delta (target - now). Negative = past. NULL when no date. */
export function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  try {
    return differenceInDays(parseISO(iso), new Date());
  } catch {
    return null;
  }
}

/** "in 3 days" / "in 1 month" / "12 days ago" / "today". */
export function relativeWindow(iso: string | null | undefined): string {
  const d = daysUntil(iso);
  if (d == null) return "—";
  if (d === 0) return "today";
  if (d > 0) {
    if (d < 30)  return `in ${d}d`;
    if (d < 60)  return "in ~1 month";
    if (d < 365) return `in ${Math.round(d / 30)} months`;
    return `in ${Math.round(d / 365)} year${d >= 730 ? "s" : ""}`;
  }
  const a = -d;
  if (a < 30)  return `${a}d ago`;
  if (a < 60)  return "1 month ago";
  if (a < 365) return `${Math.round(a / 30)} months ago`;
  return `${Math.round(a / 365)}y ago`;
}

export function studentDisplay(s: { first_name: string; last_name: string } | null | undefined): string {
  if (!s) return "—";
  return `${s.first_name} ${s.last_name}`.trim();
}
