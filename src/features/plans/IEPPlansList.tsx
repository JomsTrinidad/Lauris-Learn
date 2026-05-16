"use client";

/**
 * Read-only list of IEP plans. Receives pre-filtered + enriched rows
 * from PlansAndFormsView.
 *
 * queueMode=true is set by PlansAndFormsView when the Review Queue filter
 * is active. In that mode the table highlights submitted age and the empty
 * state text is adapted for "no pending reviews".
 */

import { ClipboardList, ArrowRight, Clock, History, CheckCircle2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLAN_STATUS_LABELS } from "./constants";
import { studentDisplay } from "@/features/documents/utils";
import { format, formatDistanceToNowStrict, parseISO } from "date-fns";
import type { PlanListItem, PlanStatus } from "./types";
import { PENDING_REVIEW_STATUSES } from "./review-queue";

const STATUS_VARIANT: Record<PlanStatus, "draft" | "scheduled" | "waitlisted" | "active" | "archived"> = {
  draft:     "draft",
  submitted: "scheduled",
  in_review: "waitlisted",
  approved:  "active",
  finalized: "active",
  archived:  "archived",
};

export function IEPPlansList({
  plans,
  onOpen,
  onOpenTimeline,
  queueMode = false,
}: {
  plans: PlanListItem[];
  onOpen: (plan: PlanListItem) => void;
  onOpenTimeline?: (plan: PlanListItem) => void;
  queueMode?: boolean;
}) {
  if (plans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground" />
          {queueMode ? (
            <>
              <h3 className="text-base font-semibold">No plans waiting for review</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                All submitted plans have been reviewed. Check back here when teachers submit new plans.
              </p>
            </>
          ) : (
            <>
              <h3 className="text-base font-semibold">No IEP plans yet</h3>
              <p className="text-sm text-muted-foreground max-w-md mx-auto">
                Structured IEP plans you create here are kept separate from
                uploaded IEP PDFs (those live under Documents).
              </p>
            </>
          )}
        </CardContent>
      </Card>
    );
  }

  const isPending = (status: PlanStatus) =>
    (PENDING_REVIEW_STATUSES as readonly string[]).includes(status);

  return (
    <Card>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/40">
                <Th>Plan</Th>
                <Th>Student</Th>
                <Th>School Year</Th>
                <Th>Status</Th>
                <Th>{queueMode ? "Waiting" : "Last Updated"}</Th>
                <Th className="text-right">Actions</Th>
              </tr>
            </thead>
            <tbody>
              {plans.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onOpen(p)}
                  className="border-b border-border last:border-0 hover:bg-muted/30 cursor-pointer transition-colors"
                >
                  <td className="px-5 py-3">
                    <div className="font-medium text-foreground">
                    {p.title}
                    {(p.revision_number ?? 1) > 1 && (
                      <span className="ml-2 text-xs font-normal text-muted-foreground">
                        Rev.&nbsp;{p.revision_number}
                      </span>
                    )}
                  </div>
                    {queueMode ? (
                      (p.submitted_by_profile?.full_name ?? p.created_by_profile?.full_name) && (
                        <div className="text-xs text-muted-foreground">
                          Submitted by {p.submitted_by_profile?.full_name ?? p.created_by_profile?.full_name}
                        </div>
                      )
                    ) : (
                      p.created_by_profile && (
                        <div className="text-xs text-muted-foreground">
                          Created by {p.created_by_profile.full_name}
                        </div>
                      )
                    )}
                  </td>
                  <td className="px-5 py-3">{studentDisplay(p.student)}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {p.school_year?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <div className="space-y-1">
                      <Badge variant={STATUS_VARIANT[p.status]}>
                        {PLAN_STATUS_LABELS[p.status]}
                      </Badge>
                      {(p.status === "finalized" || p.status === "approved") && (
                        p.parent_acknowledged_at ? (
                          <div className="flex items-center gap-1 text-xs text-green-700">
                            <CheckCircle2 className="w-3 h-3 shrink-0" />
                            <span>Parent acknowledged</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1 text-xs text-amber-600">
                            <Clock className="w-3 h-3 shrink-0" />
                            <span>Awaiting parent</span>
                          </div>
                        )
                      )}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {queueMode && isPending(p.status) ? (
                      <div className="flex items-center gap-1.5">
                        <Clock className="w-3 h-3 shrink-0" />
                        {/* Use submitted_at when available; fall back to updated_at for legacy rows */}
                        <span>{formatDistanceToNowStrict(parseISO(p.submitted_at ?? p.updated_at))} ago</span>
                      </div>
                    ) : (
                      format(parseISO(p.updated_at), "MMM d, yyyy")
                    )}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {onOpenTimeline && (
                        <button
                          type="button"
                          title="View history"
                          onClick={(e) => { e.stopPropagation(); onOpenTimeline(p); }}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                        >
                          <History className="w-3.5 h-3.5" />
                        </button>
                      )}
                      <ArrowRight className="w-4 h-4 text-muted-foreground" />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function Th({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <th className={`px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground ${className}`}>
      {children}
    </th>
  );
}
