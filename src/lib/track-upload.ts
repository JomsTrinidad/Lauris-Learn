/**
 * Client-side uploaded_files tracking helpers.
 *
 * All functions are fire-and-forget: a failure to record tracking metadata
 * must NEVER block or surface an error to the user. The upload itself is the
 * critical operation; tracking is best-effort observability.
 *
 * Uses upsert (onConflict: storage_path) so re-uploads (upsert to storage)
 * update the existing row rather than violating the UNIQUE constraint.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

export interface UploadRecord {
  schoolId: string | null;
  uploadedBy: string | null;
  entityType: string;
  entityId: string | null;
  bucket: string;
  storagePath: string;
  fileSize: number;
  mimeType: string;
}

/** Insert or update a row in uploaded_files after a successful storage upload. */
export async function trackUpload(
  supabase: AnySupabase,
  record: UploadRecord,
): Promise<void> {
  try {
    await supabase.from("uploaded_files").upsert(
      {
        school_id:           record.schoolId,
        uploaded_by:         record.uploadedBy,
        related_entity_type: record.entityType,
        related_entity_id:   record.entityId,
        bucket:              record.bucket,
        storage_path:        record.storagePath,
        file_size:           record.fileSize,
        mime_type:           record.mimeType,
        status:              "active",
        deleted_at:          null,
      },
      { onConflict: "storage_path" },
    );
  } catch (err) {
    console.warn("[track-upload] insert failed:", err);
  }
}

/**
 * Mark all uploaded_files for a given entity as hidden.
 * Call when a parent_update is hidden (status = 'hidden').
 */
export async function markUploadsHidden(
  supabase: AnySupabase,
  entityType: string,
  entityId: string,
): Promise<void> {
  try {
    await supabase
      .from("uploaded_files")
      .update({ status: "hidden" })
      .eq("related_entity_type", entityType)
      .eq("related_entity_id", entityId)
      .eq("status", "active");
  } catch (err) {
    console.warn("[track-upload] markUploadsHidden failed:", err);
  }
}

/**
 * Mark all uploaded_files for a given entity as deleted.
 * Call when a parent_update or proud_moment is soft-deleted.
 */
export async function markUploadsDeleted(
  supabase: AnySupabase,
  entityType: string,
  entityId: string,
): Promise<void> {
  try {
    await supabase
      .from("uploaded_files")
      .update({ status: "deleted", deleted_at: new Date().toISOString() })
      .eq("related_entity_type", entityType)
      .eq("related_entity_id", entityId)
      .neq("status", "deleted");
  } catch (err) {
    console.warn("[track-upload] markUploadsDeleted failed:", err);
  }
}

/**
 * Restore all uploaded_files for a given entity back to active.
 * Call when a hidden parent_update is restored to posted.
 */
export async function markUploadsActive(
  supabase: AnySupabase,
  entityType: string,
  entityId: string,
): Promise<void> {
  try {
    await supabase
      .from("uploaded_files")
      .update({ status: "active", deleted_at: null })
      .eq("related_entity_type", entityType)
      .eq("related_entity_id", entityId);
  } catch (err) {
    console.warn("[track-upload] markUploadsActive failed:", err);
  }
}
