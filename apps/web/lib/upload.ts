import { api } from './api';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The image could not be read. Please try another PNG, JPG or WebP file.')); };
    img.src = url;
  });
}

/**
 * Normalises an image in the browser before upload so every picture looks consistent:
 *  - square: centre-crop to size x size (product photos: never too small, big or stretched)
 *  - otherwise: keep the ratio and shrink so the longest side is at most maxEdge (posters, gallery)
 * Output is JPEG (white background for transparent PNGs), which WhatsApp and every browser accept.
 */
export async function prepareImage(file: File, opts: { square?: boolean; size?: number; maxEdge?: number } = {}): Promise<string> {
  if (!TYPES.includes(file.type)) throw new Error('Please choose a PNG, JPG or WebP image.');
  if (file.size > 12 * 1024 * 1024) throw new Error('The image must be smaller than 12 MB.');
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('This browser cannot process images.');
  ctx.imageSmoothingQuality = 'high';

  if (opts.square) {
    const size = opts.size ?? 1000;
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side) / 2;
    const sy = (img.naturalHeight - side) / 2;
    canvas.width = size; canvas.height = size;
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, size, size);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);
  } else {
    const maxEdge = opts.maxEdge ?? 2000;
    const scale = Math.min(1, maxEdge / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.round(img.naturalWidth * scale); canvas.height = Math.round(img.naturalHeight * scale);
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  }
  return canvas.toDataURL('image/jpeg', 0.88);
}

export async function uploadImage(file: File, opts: { square?: boolean; size?: number; maxEdge?: number } = {}): Promise<{ imageUrl: string }> {
  const dataUrl = await prepareImage(file, opts);
  const result = await api<{ imageUrl: string }>('/api/admin/media/upload', { method: 'POST', body: JSON.stringify({ dataUrl, fileName: file.name }) });
  if (!result?.imageUrl) throw new Error('The upload did not return an image link. Please try again.');
  return result;
}

/** Reads a PDF as a data URL for upload (the API stores it and offers it in the WhatsApp "Downloads" list). */
export function pdfToDataUrl(file: File, maxBytes = 8 * 1024 * 1024): Promise<string> {
  return new Promise((resolve, reject) => {
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return reject(new Error('Please choose a PDF file.'));
    if (file.size > maxBytes) return reject(new Error('The PDF is too large. The maximum size is 8 MB.'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.onload = () => {
      const result = String(reader.result || '');
      // Some browsers label PDFs as application/octet-stream; normalise the prefix so the API accepts it.
      resolve(result.replace(/^data:[^;]*;base64,/, 'data:application/pdf;base64,'));
    };
    reader.readAsDataURL(file);
  });
}
