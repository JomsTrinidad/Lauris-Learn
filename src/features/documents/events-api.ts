/**
 * document_access_events query helper (Phase D step D15).
 *
 * Read-only. RLS already differentiates per role:
 *   - school_admin sees ALL events for their school
 *   - teacher sees events for documents they can access
 *   - parent / external_contact see their own scope (not used here)
 *
 * The Activity tab only renders for staff (isStaff). We just SELECT and
 * sort newest-first, limit 50.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/types/database";
import type { DocumentAccessEventRow } from "./types";

type Client = SupabaseClient<Database>;

export async function listAccessEvents(
  supabase: Client,
  docId: string,
  limit = 50,
): Promise<DocumentAccessEventRow[]> {
  const { data, error } = await supabase
    .from("document_access_events")
    .select("*")
    .eq("document_id", docId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw error;
  return (data ?? []) as DocumentAccessEventRow[];
}
