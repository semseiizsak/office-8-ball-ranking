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

/** Profile photos are framed 4:5: the whole frame fills full-art cards, the circle crop shows its middle. */
export const PHOTO_ASPECT = 4 / 5;
export const PHOTO_WIDTH = 384;
/** How far down the 4:5 frame the round crop sits (0 = top square, 1 = bottom square). Shared by avatars, card circles and the cropper guide. */
export const FACE_Y = 0.35;

/** Loads a picked file into an image element, ready to draw. */
export const loadImageFile = (file: File): Promise<HTMLImageElement> =>
  new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Invalid image'));
    };
    image.src = url;
  });

/** Draws the chosen part of an image (source pixels) into a 4:5 JPEG data URI. */
export const cropToPhoto = (
  image: HTMLImageElement,
  area: { x: number; y: number; w: number; h: number },
  quality = 0.8,
): string => {
  const canvas = document.createElement('canvas');
  canvas.width = PHOTO_WIDTH;
  canvas.height = Math.round(PHOTO_WIDTH / PHOTO_ASPECT);
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = '#0A0A0A';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(image, area.x, area.y, area.w, area.h, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL('image/jpeg', quality);
};

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
