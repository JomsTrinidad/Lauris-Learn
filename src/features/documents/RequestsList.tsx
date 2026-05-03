"use client";

/**
 * RequestsList — Phase D step D14.
 *
 * Renders document_requests rows in a table. Active rows (status='requested'
 * or 'submitted') get a per-row Cancel action for school staff. Inactive
 * rows (cancelled / reviewed) render as audit-only.
 */

import { Inbox, Calendar, Ban, Globe, Users } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { DOCUMENT_TYPE_LABELS, REQUEST_STATUS_LABELS } from "./constants";
import { formatDate, daysUntil, studentDisplay } from "./utils";
import type { RequestListItem } from "./requests-api";
import type { RequestStatus } from "./types";

export interface RequestsListProps {
  requests: RequestListItem[];
  /** When true, render the Cancel action on active rows. */
  canCancel: boolean;
  onCancel: (r: RequestListItem) => void;
}

export function RequestsList({ requests, canCancel, onCancel }: RequestsListProps) {
  if (requests.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <Inbox className="w-10 h-10 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">No requests yet</h2>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Use Request Document to ask a parent or external contact for a
            document you don't have yet. Open requests show up here.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted border-b border-border">
            <tr>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Document</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Student</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">From</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Status</th>
              <th className="text-left px-4 py-3 font-medium text-muted-foreground">Due</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {requests.map((r) => (
              <RequestRow
                key={r.id}
                request={r}
                canCancel={canCancel}
                onCancel={onCancel}
              />
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}


function RequestRow({
  request,
  canCancel,
  onCancel,
}: {
  request: RequestListItem;
  canCancel: boolean;
  onCancel: (r: RequestListItem) => void;
}) {
  const isActive = request.status === "requested" || request.status === "submitted";
  const dueDays  = daysUntil(request.due_date);
  const overdue  = isActive && dueDays != null && dueDays < 0;

  const recipientName =
    request.requested_from_kind === "parent"
      ? request.requested_from_guardian?.full_name ?? "Parent"
      : request.requested_from_kind === "external_contact"
        ? request.requested_from_external_contact?.full_name ?? "External contact"
        : "Recipient";

  const RecipientIcon = request.requested_from_kind === "parent" ? Users : Globe;

  return (
    <tr className={cn(
      "border-b border-border last:border-0 hover:bg-muted/50 transition-colors",
      !isActive && "opacity-70",
    )}>
      <td className="px-4 py-3">
        <div className="font-medium">
          {DOCUMENT_TYPE_LABELS[request.requested_document_type]}
        </div>
        {request.reason && (
          <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
            {request.reason}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-muted-foreground">
        {studentDisplay(request.student)}
      </td>
      <td className="px-4 py-3">
        <div className="inline-flex items-center gap-1.5 text-sm">
          <RecipientIcon className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
          <span className="truncate">{recipientName}</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <Badge variant={badgeVariantFor(request.status)}>
          {REQUEST_STATUS_LABELS[request.status]}
        </Badge>
        {request.cancelled_reason && request.status === "cancelled" && (
          <div className="text-xs text-muted-foreground italic mt-0.5">
            {request.cancelled_reason}
          </div>
        )}
      </td>
      <td className="px-4 py-3 text-sm">
        {request.due_date ? (
          <div className={cn(
            "inline-flex items-center gap-1",
            overdue && "text-red-700 font-medium",
          )}>
            <Calendar className="w-3 h-3" />
            {formatDate(request.due_date)}
            {overdue && <span className="text-xs ml-1">(overdue)</span>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">—</span>
        )}
      </td>
      <td className="px-4 py-3 text-right">
        {isActive && canCancel && (
          <button
            type="button"
            onClick={() => onCancel(request)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-red-700 hover:bg-red-50 transition-colors px-2 py-1 rounded"
            title="Cancel this request"
          >
            <Ban className="w-3.5 h-3.5" />
            Cancel
          </button>
        )}
      </td>
    </tr>
  );
}


function badgeVariantFor(s: RequestStatus): "inquiry" | "active" | "completed" | "cancelled" {
  switch (s) {
    case "requested": return "inquiry";
    case "submitted": return "active";
    case "reviewed":  return "completed";
    case "cancelled": return "cancelled";
  }
}
