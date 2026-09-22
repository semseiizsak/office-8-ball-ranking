/**
 * Resizes an image file client-side and returns it as a JPEG data URI.
 *
 * Kept as a plain string on the document rather than a Storage upload — this
 * app has no Storage bucket configured, and a resized photo comfortably fits
 * under Firestore's document size limit, so one less moving part to run.
 */
export const readImage = (file: File, maxSize = 320, quality = 0.82): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => {
        const scale = Math.min(1, maxSize / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(image.width * scale));
        canvas.height = Math.max(1, Math.round(image.height * scale));
        canvas.getContext('2d')?.drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      image.onerror = () => reject(new Error('Invalid image'));
      image.src = String(reader.result);
    };
    reader.onerror = () => reject(new Error('Could not read image'));
    reader.readAsDataURL(file);
  });

/** Above this, base64 inflation risks blowing past Firestore's ~1MB document cap. */
export const MAX_GIF_BYTES = 650_000;

/**
 * Reads an animated gif file as-is, with no resizing.
 *
 * A gif can't be pushed through a canvas without flattening it to its first
 * frame, so unlike a photo this is stored byte-for-byte — which means the
 * size cap is the only real safeguard against an oversized doc.
 */
export const readGif = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    if (file.size > MAX_GIF_BYTES) {
      reject(new Error(`That gif is too big — keep it under ${Math.round(MAX_GIF_BYTES / 1000)}KB.`));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Could not read that gif'));
    reader.readAsDataURL(file);
  });
