"use client";

/**
 * Parent-side request inbox (Phase Requests UI).
 *
 * Surfaces document_requests targeted at the calling parent for the active
 * child. RLS `parent_select_document_requests_to_self` already gates by
 * `requested_from_guardian_id ∈ parent_guardian_ids()`, so we just filter
 * by student + open statuses.
 *
 * Two actions:
 *   - **Reply with upload** — opens ParentUploadDocumentModal in fulfillment
 *     mode. The modal does the upload and, on success, links the new doc
 *     via `fulfilled_with_document_id` and flips the request to 'submitted'.
 *   - **Decline** — opens a small confirmation strip; on confirm we set
 *     status='cancelled' with a required reason.
 *
 * Submitted-but-not-yet-reviewed rows stay visible (with a clear status
 * pill + the linked document) so the parent can re-fulfill if needed.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Inbox,
  Calendar,
  Upload,
  Ban,
  AlertCircle,
  CheckCircle2,
  FileText,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ErrorAlert } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";
import { formatDate, daysUntil, formatDocumentType } from "./utils";
import {
  listOpenRequestsForStudent,
  parentDeclineRequest,
  type RequestListItem,
} from "./requests-api";
import type { DocumentType } from "./types";


export interface ParentRequestsPanelProps {
  studentId: string | null;
  /** Bump this to force a reload (e.g. after the page-owned upload modal
   *  fulfilled a request and the panel needs to re-fetch). */
  refreshKey?: number;
  /** Open the upload modal in fulfillment mode for the given request. */
  onFulfill: (req: {
    id:    string;
    label: string;
    type:  DocumentType;
  }) => void;
  /** Notified when something changes (decline / fulfill) so the page can
   *  reload its other panels. */
  onChanged?: () => void;
}

export function ParentRequestsPanel({
  studentId,
  refreshKey = 0,
  onFulfill,
  onChanged,
}: ParentRequestsPanelProps) {
  const supabase = useMemo(() => createClient(), []);

  const [requests, setRequests] = useState<RequestListItem[]>([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState<string | null>(null);

  // Inline decline state — only one request at a time can be in confirm mode.
  const [declineId, setDeclineId] = useState<string | null>(null);
  const [declineReason, setDeclineReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      if (!studentId) {
        setRequests([]);
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      try {
        const rows = await listOpenRequestsForStudent(supabase, studentId);
        if (signal?.aborted) return;
        setRequests(rows);
      } catch (err) {
        if (signal?.aborted) return;
        setError(err instanceof Error ? err.message : "Couldn't load document requests.");
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [studentId, supabase],
  );

  useEffect(() => {
    const ctrl = new AbortController();
    void reload(ctrl.signal);
    return () => ctrl.abort();
    // refreshKey is intentionally part of the dependency list so a parent
    // bumping it forces a re-fetch.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reload, refreshKey]);

  function startDecline(id: string) {
    setActionError(null);
    setDeclineReason("");
    setDeclineId(id);
  }
  function cancelDecline() {
    if (busy) return;
    setDeclineId(null);
    setDeclineReason("");
    setActionError(null);
  }

  async function confirmDecline(req: RequestListItem) {
    setBusy(true);
    setActionError(null);
    try {
      const reason = declineReason.trim();
      if (reason.length === 0) {
        setActionError("Please add a short reason — it helps the school understand why.");
        setBusy(false);
        return;
      }
      await parentDeclineRequest(supabase, { requestId: req.id, reason });
      setDeclineId(null);
      setDeclineReason("");
      await reload();
      onChanged?.();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "Couldn't decline the request.");
    } finally {
      setBusy(false);
    }
  }

  // Hide entirely when there's nothing to act on (and no error).
  if (loading || (!error && requests.length === 0)) return null;

  return (
    <Card className="border-blue-300">
      <CardContent className="p-4 space-y-3">
        <div className="flex items-center gap-2">
          <Inbox className="w-4 h-4 text-blue-700" />
          <h2 className="text-sm font-semibold">School is asking for a document</h2>
          <span className="ml-auto text-xs text-muted-foreground">
            {requests.length} request{requests.length === 1 ? "" : "s"}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          The school has asked you to send the documents below. Reply with
          an upload or decline if you can&apos;t share it.
        </p>

        {error && <ErrorAlert message={error} />}
        {actionError && <ErrorAlert message={actionError} />}

        <ul className="space-y-2">
          {requests.map((r) => (
            <RequestItem
              key={r.id}
              request={r}
              isDeclining={declineId === r.id}
              busy={busy}
              declineReason={declineReason}
              onChangeReason={setDeclineReason}
              onStartDecline={() => startDecline(r.id)}
              onCancelDecline={cancelDecline}
              onConfirmDecline={() => confirmDecline(r)}
              onFulfill={() =>
                onFulfill({
                  id:    r.id,
                  label: formatDocumentType(r.requested_document_type),
                  type:  r.requested_document_type,
                })
              }
            />
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}


function RequestItem({
  request,
  isDeclining,
  busy,
  declineReason,
  onChangeReason,
  onStartDecline,
  onCancelDecline,
  onConfirmDecline,
  onFulfill,
}: {
  request: RequestListItem;
  isDeclining: boolean;
  busy: boolean;
  declineReason: string;
  onChangeReason: (v: string) => void;
  onStartDecline: () => void;
  onCancelDecline: () => void;
  onConfirmDecline: () => void;
  onFulfill: () => void;
}) {
  const dueDays = daysUntil(request.due_date);
  const overdue = dueDays != null && dueDays < 0;
  const dueSoon = dueDays != null && dueDays >= 0 && dueDays <= 7;

  const submitted = request.status === "submitted";
  const reqLabel  = formatDocumentType(request.requested_document_type);

  return (
    <li
      className={cn(
        "rounded-lg border overflow-hidden",
        submitted
          ? "border-emerald-300 bg-emerald-50/40"
          : "border-blue-300 bg-blue-50/60",
      )}
    >
      <div className="px-3 py-2.5 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          {submitted ? (
            <>
              <CheckCircle2 className="w-4 h-4 text-emerald-700" />
              <span className="text-sm font-medium">
                You&apos;ve responded — awaiting school review
              </span>
            </>
          ) : (
            <>
              <Inbox className="w-4 h-4 text-blue-700" />
              <span className="text-sm font-medium">{reqLabel} requested</span>
            </>
          )}
          {!submitted && overdue && (
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-red-100 text-red-800">
              <AlertCircle className="w-3 h-3" /> Overdue
            </span>
          )}
          {!submitted && !overdue && dueSoon && (
            <span className="inline-flex items-center gap-1 text-xs px-1.5 py-0.5 rounded font-medium bg-amber-100 text-amber-800">
              <Calendar className="w-3 h-3" />
              {dueDays === 0 ? "Due today" : `Due in ${dueDays}d`}
            </span>
          )}
        </div>

        {submitted && (
          <p className="text-xs text-muted-foreground">
            They asked for: <strong>{reqLabel}</strong>
          </p>
        )}

        {request.reason && (
          <div className="text-sm">
            <span className="text-muted-foreground">Why: </span>
            <span className="whitespace-pre-wrap">{request.reason}</span>
          </div>
        )}

        <div className="text-xs text-muted-foreground flex items-center gap-3 flex-wrap">
          {request.due_date && (
            <span className="inline-flex items-center gap-1">
              <Calendar className="w-3 h-3" /> Due {formatDate(request.due_date)}
            </span>
          )}
          <span>Asked {formatDate(request.created_at)}</span>
        </div>

        {submitted && request.fulfilled_with_document && (
          <div className="text-xs text-emerald-800 inline-flex items-center gap-1.5 bg-white/80 border border-emerald-200 rounded-md px-2 py-1 mt-1">
            <FileText className="w-3 h-3" />
            Submitted: <strong>{request.fulfilled_with_document.title}</strong>
          </div>
        )}

        {!isDeclining && (
          <div className="flex justify-end gap-2 pt-1">
            <Button size="sm" onClick={onFulfill}>
              <Upload className="w-3.5 h-3.5 mr-1.5" />
              {submitted ? "Send another file" : "Reply with upload"}
            </Button>
            {!submitted && (
              <Button size="sm" variant="outline" onClick={onStartDecline}>
                <Ban className="w-3.5 h-3.5 mr-1.5" />
                Decline
              </Button>
            )}
          </div>
        )}
      </div>

      {isDeclining && (
        <div className="border-t border-blue-300 px-3 py-3 bg-card space-y-2">
          <p className="text-sm">
            Decline this request? The school will see that you can&apos;t share
            this document. They can ask again later if needed.
          </p>
          <label className="block text-xs">
            <span className="text-muted-foreground">
              Reason <span className="text-red-600">*</span>
            </span>
            <textarea
              className="mt-1 w-full rounded-md border border-border bg-card px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
              rows={2}
              value={declineReason}
              onChange={(e) => onChangeReason(e.target.value)}
              maxLength={500}
              placeholder="Why are you declining? Saved for the school's audit trail."
              disabled={busy}
              required
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="outline" onClick={onCancelDecline} disabled={busy}>
              Cancel
            </Button>
            <Button
              size="sm"
              onClick={onConfirmDecline}
              disabled={busy || declineReason.trim().length === 0}
              className={cn("bg-red-600 hover:bg-red-700")}
            >
              {busy ? "Declining…" : "Confirm decline"}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
