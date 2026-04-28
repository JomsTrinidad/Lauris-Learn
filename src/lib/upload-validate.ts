/**
 * Client-side upload validation.
 * These checks are UX guards and defense-in-depth; the real enforcement is
 * at the storage bucket level (MIME allowlist + file_size_limit in Supabase).
 * Both MIME type and file extension must match — neither alone is trusted.
 */

export const ALLOWED_IMAGE_MIME = ["image/jpeg", "image/png", "image/webp"] as const;
export const ALLOWED_IMAGE_EXT = [".jpg", ".jpeg", ".png", ".webp"] as const;

/** Map validated file extension → safe contentType for storage upload. */
export const MIME_BY_EXT: Record<string, string> = {
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".webp": "image/webp",
};

export const RECEIPT_MAX_BYTES    = 3 * 1024 * 1024;  // 3 MB
export const LOGO_MAX_BYTES       = 1 * 1024 * 1024;  // 1 MB
// Raw file limit checked before compression (compressImage handles final output size)
export const UPDATE_PHOTO_RAW_MAX = 20 * 1024 * 1024; // 20 MB

/**
 * Validate a file for upload. Returns an error string, or null if valid.
 * Checks MIME type, file extension, and size — all three must pass.
 */
export function validateUpload(
  file: File,
  maxBytes: number,
  allowedMime: readonly string[] = ALLOWED_IMAGE_MIME,
  allowedExt:  readonly string[] = ALLOWED_IMAGE_EXT,
): string | null {
  if (!allowedMime.includes(file.type)) {
    return `File type not allowed. Accepted formats: JPEG, PNG, WebP.`;
  }

  const ext = ("." + (file.name.split(".").pop() ?? "")).toLowerCase();
  if (!allowedExt.includes(ext as typeof ALLOWED_IMAGE_EXT[number])) {
    return `File extension "${ext}" is not allowed. Accepted: ${allowedExt.join(", ")}.`;
  }

  if (file.size > maxBytes) {
    const maxMb  = (maxBytes       / 1024 / 1024).toFixed(0);
    const fileMb = (file.size      / 1024 / 1024).toFixed(1);
    return `File is too large (${fileMb} MB). Maximum allowed size: ${maxMb} MB.`;
  }

  return null;
}

/** Derive a safe storage contentType from a validated file extension. */
export function contentTypeFromExt(filename: string): string {
  const ext = ("." + (filename.split(".").pop() ?? "")).toLowerCase();
  return MIME_BY_EXT[ext] ?? "image/jpeg";
}
