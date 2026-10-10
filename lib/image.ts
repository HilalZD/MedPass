// Shrink a phone photo in the browser before upload.
// Vercel rejects request bodies over ~4.5 MB and phone photos are often 3–8 MB each,
// so every image is redrawn at max 1600px on the long side as a JPEG at quality 0.8
// (usually 200–600 KB, still sharp enough to read handwriting).

const MAX_SIDE = 1600;
const QUALITY = 0.8;

export async function resizeImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // browsers apply the photo's rotation (EXIF) here

    const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);

    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.fillStyle = "#fff"; // transparent PNGs would turn black as JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    return canvas.toDataURL("image/jpeg", QUALITY); // "data:image/jpeg;base64,..."
  } finally {
    URL.revokeObjectURL(url);
  }
}

// Patient photo for the ID card: center-cropped to a 3:4 portrait, 300x400 px,
// JPEG, under 50 KB (quality is lowered step by step until it fits).
// Returns a "data:image/jpeg;base64,..." URL.
const PHOTO_W = 300;
const PHOTO_H = 400;
const PHOTO_MAX_BYTES = 50_000;

export async function resizePhoto(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // the browser applies the photo's rotation (EXIF) here

    // Largest 3:4 rectangle in the middle of the photo.
    const srcRatio = img.naturalWidth / img.naturalHeight;
    const wanted = PHOTO_W / PHOTO_H;
    const sw = srcRatio > wanted ? img.naturalHeight * wanted : img.naturalWidth;
    const sh = srcRatio > wanted ? img.naturalHeight : img.naturalWidth / wanted;
    const sx = (img.naturalWidth - sw) / 2;
    const sy = (img.naturalHeight - sh) / 2;

    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_W;
    canvas.height = PHOTO_H;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas not supported");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, PHOTO_W, PHOTO_H);
    ctx.drawImage(img, sx, sy, sw, sh, 0, 0, PHOTO_W, PHOTO_H);

    for (let q = 0.85; q >= 0.4; q -= 0.05) {
      const data = canvas.toDataURL("image/jpeg", q);
      // base64 is 4 characters per 3 bytes
      if (((data.length - "data:image/jpeg;base64,".length) * 3) / 4 <= PHOTO_MAX_BYTES) return data;
    }
    throw new Error("Photo is too detailed to shrink. Try another one.");
  } finally {
    URL.revokeObjectURL(url);
  }
}
