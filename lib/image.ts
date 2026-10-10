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
