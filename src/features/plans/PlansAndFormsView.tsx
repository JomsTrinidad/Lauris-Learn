"use client";

/**
 * Plans & Forms — third view inside Document Coordination.
 *
 * IA:
 *   - Top: 5 category cards (IEP Plans is the only active one for v1).
 *   - Body: list of IEP Plans + "New IEP Plan" affordance, opened in
 *     IEPPlanModal.
 *
 * Permissions follow the same pattern as the rest of the documents UI:
 *   - school_admin / teacher  — can create + edit plans
 *   - parent / external       — no UI (parent portal deferred)
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ClipboardList,
  HeartHandshake,
  Activity,
  Files,
  LayoutTemplate,
  Plus,
  Lock,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { listPlans } from "./queries";
import { IEPPlansList } from "./IEPPlansList";
import { IEPPlanModal } from "./IEPPlanModal";
import { PLAN_STATUS_LABELS } from "./constants";
import type { PlanListItem, PlanStatus } from "./types";
import { cn } from "@/lib/utils";

type Category = "iep" | "support" | "behavior" | "other" | "templates";

const PLACEHOLDER_CARDS: Array<{
  id: Exclude<Category, "iep">;
  title: string;
  description: string;
  icon: React.ElementType;
}> = [
  {
    id: "support",
    title: "Support Plans",
    description: "Targeted support outside an IEP — e.g. behavior support, learning scaffolds.",
    icon: HeartHandshake,
  },
  {
    id: "behavior",
    title: "Behavior Plans",
    description: "Functional behavior plans, replacement strategies, classroom expectations.",
    icon: Activity,
  },
  {
    id: "other",
    title: "Other Forms",
    description: "Consent letters, observation forms, intake checklists.",
    icon: Files,
  },
  {
    id: "templates",
    title: "Templates",
    description: "Reusable plan templates. (A simple builder will come later.)",
    icon: LayoutTemplate,
  },
];

const STATUS_OPTIONS: PlanStatus[] = ["draft", "submitted", "in_review", "approved", "archived"];

export function PlansAndFormsView({
  schoolId,
  schoolYearId,
  userId,
  userRole,
  defaultStudentId = null,
}: {
  schoolId: string;
  schoolYearId: string | null;
  userId: string;
  userRole: "school_admin" | "teacher" | "parent" | "super_admin" | null;
  defaultStudentId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [plans, setPlans]     = useState<PlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanStatus | "">("");

  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);

  const canCreate = userRole === "school_admin" || userRole === "teacher";

  const loadPlans = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPlans(supabase, {
        schoolId,
        planType:  "iep",
        studentId: defaultStudentId,
        status:    statusFilter || null,
      });
      if (signal?.aborted) return;
      setPlans(data);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load plans.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [supabase, schoolId, defaultStudentId, statusFilter]);

  useEffect(() => {
    const ctrl = new AbortController();
    void loadPlans(ctrl.signal);
    return () => ctrl.abort();
  }, [loadPlans]);

  function openNew() {
    setEditingId(null);
    setModalOpen(true);
  }

  function openExisting(plan: PlanListItem) {
    setEditingId(plan.id);
    setModalOpen(true);
  }

  return (
    <div className="space-y-6">
      {/* Category cards */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CategoryCard
          icon={ClipboardList}
          title="IEP Plans"
          description="Structured Individualized Education Plans authored inside Lauris Learn."
          active
        />
        {PLACEHOLDER_CARDS.map((c) => (
          <CategoryCard
            key={c.id}
            icon={c.icon}
            title={c.title}
            description={c.description}
            active={false}
          />
        ))}
      </div>

      {/* Workspace header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">IEP Plans</h2>
          <p className="text-xs text-muted-foreground">
            These are <strong>structured plans</strong>, kept separate from
            uploaded IEP PDFs (which live under <em>Documents</em>).
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as PlanStatus | "")}
            className="w-44"
          >
            <option value="">All statuses</option>
            {STATUS_OPTIONS.map((s) => (
              <option key={s} value={s}>{PLAN_STATUS_LABELS[s]}</option>
            ))}
          </Select>
          <Button
            onClick={openNew}
            disabled={!canCreate}
            title={canCreate ? undefined : "Only school admins and teachers can create plans."}
          >
            <Plus className="w-4 h-4 mr-2" />
            New IEP Plan
          </Button>
        </div>
      </div>

      {error && <ErrorAlert message={error} />}
      {loading ? (
        <PageSpinner />
      ) : (
        <IEPPlansList plans={plans} onOpen={openExisting} />
      )}

      <IEPPlanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          void loadPlans();
        }}
        planId={editingId}
        schoolId={schoolId}
        schoolYearId={schoolYearId}
        userId={userId}
        userRole={userRole}
        defaultStudentId={defaultStudentId}
      />
    </div>
  );
}

function CategoryCard({
  icon: Icon,
  title,
  description,
  active,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  active: boolean;
}) {
  return (
    <Card
      className={cn(
        "relative",
        !active && "opacity-60",
      )}
    >
      <CardContent className="p-4 space-y-2">
        <div className="flex items-center gap-2">
          <div className={cn(
            "w-7 h-7 rounded-md flex items-center justify-center",
            active ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
          )}>
            <Icon className="w-4 h-4" />
          </div>
          <h3 className="text-sm font-semibold">{title}</h3>
          {!active && (
            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-medium px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground">
              <Lock className="w-3 h-3" />
              Soon
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
      </CardContent>
    </Card>
  );
}
