"use client";

/**
 * Read-only list of IEP plans for the current school. Receives
 * pre-filtered + enriched rows from PlansAndFormsView.
 */

import { ClipboardList, ArrowRight } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PLAN_STATUS_LABELS } from "./constants";
import { studentDisplay } from "@/features/documents/utils";
import { format, parseISO } from "date-fns";
import type { PlanListItem, PlanStatus } from "./types";

const STATUS_VARIANT: Record<PlanStatus, "draft" | "scheduled" | "waitlisted" | "active" | "archived"> = {
  draft:     "draft",
  submitted: "scheduled",
  in_review: "waitlisted",
  approved:  "active",
  archived:  "archived",
};

export function IEPPlansList({
  plans,
  onOpen,
}: {
  plans: PlanListItem[];
  onOpen: (plan: PlanListItem) => void;
}) {
  if (plans.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center space-y-3">
          <ClipboardList className="w-10 h-10 mx-auto text-muted-foreground" />
          <h3 className="text-base font-semibold">No IEP plans yet</h3>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">
            Structured IEP plans you create here are kept separate from
            uploaded IEP PDFs (those live under Documents).
          </p>
        </CardContent>
      </Card>
    );
  }

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
                <Th>Last Updated</Th>
                <Th className="text-right">Open</Th>
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
                    <div className="font-medium text-foreground">{p.title}</div>
                    {p.created_by_profile && (
                      <div className="text-xs text-muted-foreground">
                        Created by {p.created_by_profile.full_name}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3">{studentDisplay(p.student)}</td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {p.school_year?.name ?? "—"}
                  </td>
                  <td className="px-5 py-3">
                    <Badge variant={STATUS_VARIANT[p.status]}>
                      {PLAN_STATUS_LABELS[p.status]}
                    </Badge>
                  </td>
                  <td className="px-5 py-3 text-muted-foreground">
                    {format(parseISO(p.updated_at), "MMM d, yyyy")}
                  </td>
                  <td className="px-5 py-3 text-right">
                    <ArrowRight className="w-4 h-4 text-muted-foreground inline-block" />
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
