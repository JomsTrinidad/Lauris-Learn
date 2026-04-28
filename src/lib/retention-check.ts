/**
 * Non-destructive retention helpers.
 *
 * These functions ONLY return lists of files eligible for cleanup.
 * No files are deleted. A human (or a future scheduled job) must
 * explicitly act on the results.
 *
 * Intended usage: run from a super-admin UI or a server-side cron job
 * to identify storage cost candidates before deletion.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface StaleFileCandidate {
  id: string;
  schoolId: string | null;
  bucket: string;
  storagePath: string;
  entityType: string | null;
  entityId: string | null;
  fileSize: number | null;
  deletedAt: string | null;
  daysOld: number;
}

/**
 * Returns uploaded_files rows with status = 'deleted' and deleted_at older than
 * `olderThanDays` (default: 30). Results are sorted oldest-first.
 *
 * Requires the caller to be authenticated as school_admin or super_admin so
 * RLS allows the SELECT.
 *
 * @param supabase  Authenticated Supabase client
 * @param olderThanDays  Age threshold in days (default 30)
 * @param schoolId  Optional — filter to a single school (for school_admin callers)
 */
export async function findStaleDeletedFiles(
  supabase: AnySupabase,
  olderThanDays = 30,
  schoolId?: string | null,
): Promise<StaleFileCandidate[]> {
  const cutoff = new Date(
    Date.now() - olderThanDays * 24 * 60 * 60 * 1000,
  ).toISOString();

  let query = supabase
    .from("uploaded_files")
    .select("id, school_id, bucket, storage_path, related_entity_type, related_entity_id, file_size, deleted_at")
    .eq("status", "deleted")
    .lt("deleted_at", cutoff)
    .order("deleted_at", { ascending: true });

  if (schoolId) {
    query = query.eq("school_id", schoolId);
  }

  const { data, error } = await query;

  if (error || !data) {
    console.warn("[retention-check] Query failed:", error);
    return [];
  }

  const now = Date.now();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (data as any[]).map((row) => ({
    id: row.id,
    schoolId: row.school_id,
    bucket: row.bucket,
    storagePath: row.storage_path,
    entityType: row.related_entity_type,
    entityId: row.related_entity_id,
    fileSize: row.file_size,
    deletedAt: row.deleted_at,
    daysOld: row.deleted_at
      ? Math.floor((now - new Date(row.deleted_at).getTime()) / 86400000)
      : 0,
  }));
}

/**
 * Returns a summary: how many bytes and files are eligible for cleanup per school.
 * Useful for a super-admin dashboard view.
 */
export async function getRetentionSummary(
  supabase: AnySupabase,
  olderThanDays = 30,
): Promise<Array<{ schoolId: string | null; fileCount: number; totalBytes: number }>> {
  const candidates = await findStaleDeletedFiles(supabase, olderThanDays);

  const bySchool = new Map<string, { fileCount: number; totalBytes: number }>();
  for (const c of candidates) {
    const key = c.schoolId ?? "__none__";
    const entry = bySchool.get(key) ?? { fileCount: 0, totalBytes: 0 };
    entry.fileCount++;
    entry.totalBytes += c.fileSize ?? 0;
    bySchool.set(key, entry);
  }

  return Array.from(bySchool.entries()).map(([schoolId, v]) => ({
    schoolId: schoolId === "__none__" ? null : schoolId,
    ...v,
  }));
}
