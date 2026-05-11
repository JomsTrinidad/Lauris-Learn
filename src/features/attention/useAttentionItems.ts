"use client";
/**
 * React hook: IEP attention items for the dashboard "Needs Attention" section.
 *
 * Pass null schoolId or userId to disable (returns empty immediately).
 * Designed to be called once at dashboard mount — not polled.
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { getIepAttentionItems } from "./queries";
import type { AttentionItem } from "./types";

export function useIepAttentionItems({
  schoolId,
  userId,
  userRole,
  workflowMode,
}: {
  schoolId: string | null;
  userId: string | null;
  userRole: string | null;
  workflowMode: string;
}): { items: AttentionItem[]; loading: boolean } {
  const supabase = useMemo(() => createClient(), []);
  const [items, setItems] = useState<AttentionItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!schoolId || !userId) {
      setItems([]);
      setLoading(false);
      return;
    }
    // Only roles that can have IEP tasks
    if (
      userRole !== "school_admin" &&
      userRole !== "super_admin" &&
      userRole !== "teacher"
    ) {
      setItems([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    getIepAttentionItems(supabase, { schoolId, userId, userRole, workflowMode })
      .then((result) => { if (!cancelled) setItems(result); })
      .catch(()       => { if (!cancelled) setItems([]); })
      .finally(()     => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [supabase, schoolId, userId, userRole, workflowMode]);

  return { items, loading };
}
