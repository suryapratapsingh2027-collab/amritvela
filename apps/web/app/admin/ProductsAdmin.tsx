'use client';
import { useState } from 'react';
import { Eye, EyeOff, ImageOff, Pencil, Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import ImageUploader from '../../components/ImageUploader';

export type Product = {
  id: string; name: string; description: string; price: number; stock: number; category?: string | null; imageUrl?: string | null; active: boolean;
};

type FormState = { name: string; price: string; stock: string; category: string; description: string; imageUrl: string | null; active: boolean };
const empty: FormState = { name: '', price: '', stock: '', category: '', description: '', imageUrl: null, active: true };
const fromProduct = (p: Product): FormState => ({
  name: p.name, price: String(p.price), stock: String(p.stock), category: p.category || '',
  description: /^add product description$/i.test(p.description) ? '' : p.description, imageUrl: p.imageUrl || null, active: p.active,
});

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label style={{ display: 'grid', gap: 6 }}>
      <span style={{ fontSize: 13, fontWeight: 800 }}>{label}{required && <span style={{ color: '#b42318' }}> *</span>}</span>
      {children}
      {hint && <span style={{ fontSize: 12, color: '#7a867e', lineHeight: 1.45 }}>{hint}</span>}
    </label>
  );
}

function validate(f: FormState): string | null {
  if (f.name.trim().length < 2) return 'Product ka naam likhein (kam se kam 2 akshar).';
  if (!/^\d+$/.test(f.price.trim()) || Number(f.price) < 1) return 'Price poore rupaye me likhein, jaise 100.';
  if (!/^\d+$/.test(f.stock.trim())) return 'Stock me poori sankhya likhein, jaise 25 (stock nahi hai to 0).';
  return null;
}

function ProductForm({ product, onClose, onSaved }: { product?: Product; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<FormState>(product ? fromProduct(product) : empty);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const problem = validate(f);
    if (problem) { setError(problem); return; }
    setBusy(true); setError('');
    try {
      const body = JSON.stringify({ name: f.name.trim(), price: Number(f.price), stock: Number(f.stock), category: f.category.trim(), description: f.description.trim(), imageUrl: f.imageUrl || '', active: f.active });
      if (product) await api(`/api/admin/products/${product.id}`, { method: 'PATCH', body });
      else await api('/api/admin/products', { method: 'POST', body });
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Save nahi ho paaya.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="rounded-3xl border bg-white p-5 md:p-7" style={{ borderColor: '#c9d3cb' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{product ? `Edit: ${product.name}` : 'Naya product add karein'}</h2>
        <button type="button" onClick={onClose} aria-label="Band karein" className="btn btn-light" style={{ padding: 10 }}><X size={16} /></button>
      </div>
      <p className="mt-1 text-sm text-neutral-500">Jo bhi yahan likhenge wahi website aur WhatsApp bot par customers ko dikhega. * wale fields zaroori hain.</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Product ka naam" required hint="Customers WhatsApp par yahi naam likhkar order karenge. Chhota aur saaf rakhein, jaise “Nariyal”.">
          <input className="input" value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="Jaise: Nariyal" />
        </Field>
        <Field label="Price (₹ rupaye me)" required hint="Ek piece ki keemat, poore rupaye me, jaise 100. Delivery charge alag se jodi jaati hai.">
          <input className="input" inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value.replace(/[^\d]/g, ''))} placeholder="Jaise: 100" />
        </Field>
        <Field label="Stock (kitne piece available hain)" required hint="0 likhne par product “out of stock” ho jaata hai aur WhatsApp par order nahi hoga. Customers ko stock ki sankhya nahi dikhti.">
          <input className="input" inputMode="numeric" value={f.stock} onChange={(e) => set('stock', e.target.value.replace(/[^\d]/g, ''))} placeholder="Jaise: 25" />
        </Field>
        <Field label="Category (optional)" hint="Jaise: Pooja, Mala, Apparel.">
          <input className="input" value={f.category} maxLength={40} onChange={(e) => set('category', e.target.value)} placeholder="Jaise: Pooja" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description (optional)" hint="Website par product ke neeche dikhegi. 1-2 line kaafi hai.">
            <textarea className="input" style={{ minHeight: 96 }} maxLength={1000} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Product ke baare me likhein…" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Product ki photo">
            <ImageUploader value={f.imageUrl} onChange={(url) => set('imageUrl', url)} />
          </Field>
        </div>
        <label className="md:col-span-2" style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
          Website aur WhatsApp par dikhayein (band karne par product chhup jaata hai)
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex gap-3">
        <button className="btn btn-dark" disabled={busy}>{busy ? 'Save ho raha hai…' : product ? 'Changes save karein' : 'Product add karein'}</button>
        <button type="button" className="btn btn-light" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export default function ProductsAdmin({ products, reload }: { products: Product[]; reload: () => Promise<void> | void }) {
  const [editing, setEditing] = useState<Product | 'new' | null>(null);
  const [notice, setNotice] = useState('');

  async function toggle(p: Product) {
    try { await api(`/api/admin/products/${p.id}`, { method: 'PATCH', body: JSON.stringify({ active: !p.active }) }); await reload(); }
    catch (e: any) { alert(e.message); }
  }

  if (editing) {
    return <ProductForm product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice('Product save ho gaya. Ab yeh website aur WhatsApp par dikhega.'); await reload(); }} />;
  }

  return (
    <div className="rounded-3xl border bg-white p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">Product catalogue</h2><p className="text-sm text-neutral-500">{products.length} products</p></div>
        <button onClick={() => { setNotice(''); setEditing('new'); }} className="btn btn-dark"><Plus size={16} /> Naya product</button>
      </div>
      {notice && <p role="status" className="mb-4 rounded-xl bg-[#eef5ef] p-3 text-sm text-[#1d4d36]">{notice}</p>}
      {!products.length && <p className="py-10 text-center text-sm text-neutral-400">Abhi koi product nahi hai. “Naya product” dabakar pehla product add karein.</p>}
      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-3" style={{ opacity: p.active ? 1 : 0.62 }}>
            <div style={{ width: 84, height: 84, borderRadius: 14, overflow: 'hidden', background: '#f0eee7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={22} color="#b7beb9" />}
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div className="font-bold">{p.name}</div>
              <div className="mt-1 text-sm text-neutral-500">₹{p.price.toLocaleString('en-IN')}{p.category ? ` · ${p.category}` : ''}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full px-3 py-1" style={{ background: p.stock === 0 ? '#fde8e8' : p.stock < 5 ? '#fff3d6' : '#e8f3ec', color: p.stock === 0 ? '#b42318' : p.stock < 5 ? '#8a5a00' : '#1d5b3d' }}>{p.stock === 0 ? 'Out of stock' : `Stock: ${p.stock}`}</span>
                {!p.active && <span className="rounded-full bg-neutral-200 px-3 py-1">Chhupa hua</span>}
                {!p.imageUrl && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-500">Photo nahi</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-light" onClick={() => { setNotice(''); setEditing(p); }}><Pencil size={14} /> Edit</button>
              <button className="btn btn-light" onClick={() => toggle(p)}>{p.active ? <><EyeOff size={14} /> Chhupayein</> : <><Eye size={14} /> Dikhayein</>}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
