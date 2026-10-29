'use client';
import { useRef, useState } from 'react';
import { ImagePlus, Trash2, Loader2 } from 'lucide-react';
import { uploadImage } from '../lib/upload';

/**
 * Square product-image picker. The chosen photo is centre-cropped to 1000x1000 in the browser and uploaded,
 * so the same picture looks identical on the website grid, the cart and WhatsApp.
 */
export default function ImageUploader({ value, onChange }: { value?: string | null; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function pick(file?: File | null) {
    if (!file) return;
    setBusy(true); setError('');
    try {
      const { imageUrl } = await uploadImage(file, { square: true, size: 1000 });
      onChange(imageUrl);
    } catch (e: any) {
      setError(e?.message || 'Upload nahi ho paaya.');
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  }

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ width: 132, height: 132, borderRadius: 18, border: '1px dashed #c9d3cb', background: '#f3f4ef', overflow: 'hidden', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
          {value ? <img src={value} alt="Product preview" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImagePlus size={30} color="#a3b0a7" />}
        </div>
        <div style={{ display: 'grid', gap: 8 }}>
          <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
          <button type="button" className="btn btn-light" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <><Loader2 size={15} className="animate-spin" /> Uploading…</> : <><ImagePlus size={15} /> {value ? 'Image badlein' : 'Image upload karein'}</>}
          </button>
          {value && !busy && <button type="button" className="btn btn-light" onClick={() => onChange(null)}><Trash2 size={15} /> Image hatayein</button>}
        </div>
      </div>
      <p style={{ marginTop: 8, fontSize: 12, color: '#7a867e', lineHeight: 1.5 }}>
        PNG, JPG ya WebP. Photo apne aap square (1000×1000) me beech se crop ho jaati hai, taaki website aur WhatsApp par sab products ek jaise dikhein. Product ko photo ke beech me rakhein.
      </p>
      {error && <p role="alert" style={{ marginTop: 6, fontSize: 13, color: '#b42318' }}>{error}</p>}
    </div>
  );
}
