import { api } from './api';

const TYPES = ['image/png', 'image/jpeg', 'image/webp'];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image padhi nahi ja saki. Dusri PNG/JPG/WebP image try karein.')); };
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
  if (!TYPES.includes(file.type)) throw new Error('PNG, JPG ya WebP image select karein.');
  if (file.size > 12 * 1024 * 1024) throw new Error('Image 12 MB se chhoti honi chahiye.');
  const img = await loadImage(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Is browser me image process nahi ho sakti.');
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
  if (!result?.imageUrl) throw new Error('Image upload ka link nahi mila. Dobara try karein.');
  return result;
}
