"use client";
/**
 * Review queue helpers for the Plans & Forms feature — Phase 1.
 *
 * Exports:
 *   PENDING_REVIEW_STATUSES  — single source of truth for "awaiting review" states
 *   getPendingReviewCount    — one-shot async count (effects, callbacks, server actions)
 *   usePendingReviewCount    — React hook for tab badges and dashboard widgets
 *
 * Future phases can extend this file with:
 *   - getReviewQueueItems (enriched list with SLA / age tracking)
 *   - useWorkflowCounts (counts by status for analytics widgets)
 *   - markUnderReview / returnForRevision (status transition helpers)
 *   - assignReviewer (when reviewer assignment ships)
 */

import { useEffect, useMemo, useState } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import { createClient } from "@/lib/supabase/client";
import type { PlanStatus } from "./types";

type Client = SupabaseClient<Database>;

// ── Constants ─────────────────────────────────────────────────────────────────

/**
 * Plan statuses that represent "waiting for a reviewer's decision."
 *
 * - submitted  : teacher has submitted; admin has not yet acted
 * - in_review  : admin has opened the plan and is actively reviewing
 *
 * This constant drives badge counts, queue filters, and any future
 * SLA / routing logic. Update here and all consumers update automatically.
 */
export const PENDING_REVIEW_STATUSES: readonly PlanStatus[] = ["submitted", "in_review"];

// ── Query ─────────────────────────────────────────────────────────────────────

/**
 * Returns the count of IEP plans waiting for review in the given school.
 * Uses a HEAD request (no row data transferred) — safe to call frequently.
 *
 * Throws on network/RLS error; callers should handle or swallow.
 */
export async function getPendingReviewCount(
  supabase: Client,
  schoolId: string,
): Promise<number> {
  const { count, error } = await supabase
    .from("student_plans")
    .select("id", { count: "exact", head: true })
    .eq("school_id", schoolId)
    .in("status", [...PENDING_REVIEW_STATUSES]);
  if (error) throw error;
  return count ?? 0;
}

// ── Hook ──────────────────────────────────────────────────────────────────────

/**
 * React hook: live pending-review count for tab badges and dashboard widgets.
 *
 * Pass `null` as schoolId to disable (e.g. for non-reviewer roles) —
 * returns { count: 0, loading: false } immediately without hitting the DB.
 *
 * Usage:
 *   const { count } = usePendingReviewCount(isAdmin ? schoolId : null);
 */
export function usePendingReviewCount(
  schoolId: string | null,
): { count: number; loading: boolean } {
  const supabase = useMemo(() => createClient(), []);
  const [count, setCount] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!schoolId) { setCount(0); setLoading(false); return; }
    let cancelled = false;
    setLoading(true);
    getPendingReviewCount(supabase, schoolId)
      .then((n)  => { if (!cancelled) setCount(n); })
      .catch(()  => { if (!cancelled) setCount(0); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supabase, schoolId]);

  return { count, loading };
}
