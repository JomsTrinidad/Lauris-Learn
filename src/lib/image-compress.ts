export const PROFILE_PHOTO_MAX_W = 800;
export const PROFILE_PHOTO_MAX_BYTES = 500 * 1024; // 500 KB

export const UPDATE_PHOTO_MAX_W = 1600;
export const UPDATE_PHOTO_MAX_BYTES = 2 * 1024 * 1024; // 2 MB

/**
 * Compress an image file using canvas. Resizes to maxWidthPx and reduces JPEG
 * quality in steps until the file fits within maxBytes (or bottoms out at q=0.3).
 * Always outputs JPEG. Safe to call on files that are already small enough.
 */
export async function compressImage(
  file: File,
  maxWidthPx: number,
  maxBytes: number
): Promise<File> {
  return new Promise((resolve) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);

      const scale = img.width > maxWidthPx ? maxWidthPx / img.width : 1;
      const w = Math.round(img.width * scale);
      const h = Math.round(img.height * scale);

      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(file); return; }
      ctx.drawImage(img, 0, 0, w, h);

      const outName = file.name.replace(/\.[^.]+$/, ".jpg");
      let quality = 0.85;

      const attempt = () => {
        canvas.toBlob(
          (blob) => {
            if (!blob) { resolve(file); return; }
            if (blob.size <= maxBytes || quality <= 0.3) {
              resolve(new File([blob], outName, { type: "image/jpeg" }));
            } else {
              quality = Math.max(0.3, quality - 0.1);
              attempt();
            }
          },
          "image/jpeg",
          quality
        );
      };
      attempt();
    };

    img.onerror = () => resolve(file);
    img.src = objectUrl;
  });
}
