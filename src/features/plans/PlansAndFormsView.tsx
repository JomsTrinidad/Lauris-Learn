"use client";

/**
 * Plans & Forms — third view inside Document Coordination.
 *
 * IA:
 *   - Top: 5 category cards (IEP Plans is the only active one for v1).
 *   - Body: list of IEP Plans + "New IEP Plan" affordance, opened in
 *     IEPPlanModal.
 *
 * Review queue (Phase 1):
 *   School admins see a "Review Queue (N)" toggle when plans are pending.
 *   When active, the queue shows only submitted/in_review plans, sorted
 *   oldest first so the most urgent items appear at the top.
 *
 * Permissions:
 *   - school_admin / teacher  — can create + edit plans
 *   - school_admin            — can see and use the review queue
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
  Clock,
  X,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { PageSpinner, ErrorAlert } from "@/components/ui/spinner";
import { createClient } from "@/lib/supabase/client";
import { listPlans } from "./queries";
import { getPendingReviewCount, PENDING_REVIEW_STATUSES } from "./review-queue";
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
  schoolName = "",
  schoolYearId,
  schoolYearName = null,
  userId,
  userRole,
  defaultStudentId = null,
}: {
  schoolId: string;
  schoolName?: string;
  schoolYearId: string | null;
  schoolYearName?: string | null;
  userId: string;
  userRole: "school_admin" | "teacher" | "parent" | "super_admin" | null;
  defaultStudentId?: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);

  // ── Role gates ────────────────────────────────────────────────────────
  const canCreate   = userRole === "school_admin" || userRole === "teacher";
  const isReviewer  = userRole === "school_admin" || userRole === "super_admin";

  // ── Plan list state ───────────────────────────────────────────────────
  const [plans, setPlans]     = useState<PlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<PlanStatus | "">("");

  // ── Review queue state ────────────────────────────────────────────────
  const [reviewQueueActive, setReviewQueueActive] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // ── Modal ─────────────────────────────────────────────────────────────
  const [modalOpen, setModalOpen]   = useState(false);
  const [editingId, setEditingId]   = useState<string | null>(null);

  // ── Load pending count ────────────────────────────────────────────────
  const reloadPendingCount = useCallback(async () => {
    if (!isReviewer || !schoolId) return;
    try {
      const n = await getPendingReviewCount(supabase, schoolId);
      setPendingCount(n);
    } catch {
      // Non-fatal — badge just stays at its previous value
    }
  }, [supabase, schoolId, isReviewer]);

  useEffect(() => { void reloadPendingCount(); }, [reloadPendingCount]);

  // ── Load plan list ────────────────────────────────────────────────────
  const loadPlans = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const data = await listPlans(supabase, {
        schoolId,
        planType:  "iep",
        studentId: defaultStudentId,
        // Queue mode: show all pending statuses, oldest first
        ...(reviewQueueActive
          ? { statuses: PENDING_REVIEW_STATUSES, sortAscending: true }
          : { status: statusFilter || null }),
      });
      if (signal?.aborted) return;
      setPlans(data);
    } catch (err) {
      if (signal?.aborted) return;
      setError(err instanceof Error ? err.message : "Failed to load plans.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [supabase, schoolId, defaultStudentId, statusFilter, reviewQueueActive]);

  useEffect(() => {
    const ctrl = new AbortController();
    void loadPlans(ctrl.signal);
    return () => ctrl.abort();
  }, [loadPlans]);

  // ── Review queue toggle ───────────────────────────────────────────────
  function toggleReviewQueue() {
    setReviewQueueActive((v) => !v);
    if (!reviewQueueActive) setStatusFilter(""); // clear status filter when entering queue
  }

  function exitReviewQueue() {
    setReviewQueueActive(false);
  }

  // ── Helpers ───────────────────────────────────────────────────────────
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
          {/* Review Queue toggle — reviewers only, visible when there are pending
              plans OR when the queue is already active */}
          {isReviewer && (pendingCount > 0 || reviewQueueActive) && (
            <button
              type="button"
              onClick={toggleReviewQueue}
              className={cn(
                "inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition-colors shrink-0",
                reviewQueueActive
                  ? "bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-950/30 dark:border-amber-700 dark:text-amber-200"
                  : "border-border text-muted-foreground hover:text-foreground hover:bg-muted",
              )}
            >
              <Clock className="w-3.5 h-3.5" />
              Review Queue
              {pendingCount > 0 && (
                <span className={cn(
                  "inline-flex items-center justify-center min-w-[1.1rem] h-[1.1rem] px-1 rounded-full text-[10px] font-semibold leading-none",
                  reviewQueueActive
                    ? "bg-amber-200 text-amber-900 dark:bg-amber-700 dark:text-amber-100"
                    : "bg-primary text-primary-foreground",
                )}>
                  {pendingCount > 9 ? "9+" : pendingCount}
                </span>
              )}
            </button>
          )}

          {/* Status filter — hidden when review queue is active (queue has its own filter) */}
          {!reviewQueueActive && (
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
          )}

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

      {/* Review queue context banner */}
      {reviewQueueActive && (
        <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg dark:bg-amber-950/20 dark:border-amber-700/60">
          <Clock className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
          <p className="flex-1 text-xs text-amber-800 dark:text-amber-200">
            {plans.length === 0 || loading
              ? "Showing plans waiting for review · oldest submissions appear first"
              : `${plans.length} plan${plans.length > 1 ? "s" : ""} waiting for review · oldest first`}
          </p>
          <button
            type="button"
            onClick={exitReviewQueue}
            className="text-amber-600 hover:text-amber-900 dark:text-amber-400 dark:hover:text-amber-200 transition-colors"
            title="Exit review queue"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {error && <ErrorAlert message={error} />}
      {loading ? (
        <PageSpinner />
      ) : (
        <IEPPlansList plans={plans} onOpen={openExisting} queueMode={reviewQueueActive} />
      )}

      <IEPPlanModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onSaved={() => {
          setModalOpen(false);
          void loadPlans();
          void reloadPendingCount();
        }}
        planId={editingId}
        schoolId={schoolId}
        schoolName={schoolName}
        schoolYearId={schoolYearId}
        schoolYearName={schoolYearName}
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
