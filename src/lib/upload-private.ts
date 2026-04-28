/**
 * Forward-compatible private media helpers.
 *
 * Current bucket layout:
 *   profile-photos  (PUBLIC)  — student, teacher, admin avatars; school logos
 *   updates-media   (PRIVATE) — parent update photos, payment receipts
 *
 * Recommendation for a future migration pass:
 *   - Keep  profile-photos  PUBLIC  only for school logos (low-sensitivity, branding asset)
 *   - Move  student / teacher / admin avatar paths to a new PRIVATE bucket
 *     "profile-photos-private" and serve them via signed URLs
 *   - Existing files at old paths (profile-photos/{folder}/{id}.jpg) continue to work
 *     until you run a backfill that copies them to the private bucket and updates
 *     the avatar_url column to the new storage path (not a full URL)
 *
 * When you are ready to migrate:
 *   1. Create a private Supabase bucket called "profile-photos-private"
 *   2. Add SELECT policy: school members can read their school's paths
 *      (storage.foldername(name))[2] = current_user_school_id()::TEXT
 *   3. Update uploadProfilePhoto() in students/page.tsx and settings/page.tsx
 *      to use uploadPrivatePhoto() below
 *   4. Run a backfill to populate avatar_url with storage paths (not full URLs)
 *   5. Update all avatar <img> callers to use getSignedAvatarUrl()
 *
 * These helpers are no-ops until the private bucket is created.
 */

import { createClient } from "@/lib/supabase/client";

const PRIVATE_AVATAR_BUCKET = "profile-photos-private";
const SIGNED_URL_TTL = 3600; // 1 hour

/**
 * Upload a compressed image blob to the private avatar bucket.
 * Returns the storage path (not a URL) for storing in the database.
 * Returns null on failure.
 */
export async function uploadPrivatePhoto(
  folder: string,
  entityId: string,
  file: File,
): Promise<string | null> {
  const supabase = createClient();
  const path = `${folder}/${entityId}.jpg`;
  const { error } = await supabase.storage
    .from(PRIVATE_AVATAR_BUCKET)
    .upload(path, file, { upsert: true, contentType: "image/jpeg" });
  if (error) {
    console.error("[uploadPrivatePhoto] Upload failed:", error.message);
    return null;
  }
  return path;
}

/**
 * Generate a 1-hour signed URL for a private avatar.
 * Pass the raw storage path stored in avatar_url (not a full https:// URL).
 * Returns null if the path is empty or signing fails.
 */
export async function getSignedAvatarUrl(storagePath: string | null): Promise<string | null> {
  if (!storagePath || storagePath.startsWith("http")) return storagePath;
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(PRIVATE_AVATAR_BUCKET)
    .createSignedUrl(storagePath, SIGNED_URL_TTL);
  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}

/**
 * Batch-sign multiple avatar paths in one API call.
 * Returns a Map from storage path → signed URL.
 * Paths that are already https:// URLs are passed through unchanged.
 */
export async function batchSignAvatarUrls(
  paths: (string | null)[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  const storagePaths = paths.filter((p): p is string => !!p && !p.startsWith("http"));
  if (storagePaths.length === 0) return result;

  const supabase = createClient();
  const { data } = await supabase.storage
    .from(PRIVATE_AVATAR_BUCKET)
    .createSignedUrls(storagePaths, SIGNED_URL_TTL);

  (data ?? []).forEach((item, i) => {
    if (item.signedUrl) result.set(storagePaths[i], item.signedUrl);
  });

  // Pass through any direct URLs unchanged
  paths.forEach((p) => {
    if (p && p.startsWith("http")) result.set(p, p);
  });

  return result;
}
