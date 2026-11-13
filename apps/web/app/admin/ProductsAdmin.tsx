'use client';
import { useEffect, useState } from 'react';
import { Eye, EyeOff, ImageOff, Pencil, Plus, X } from 'lucide-react';
import { api } from '../../lib/api';
import ImageUploader from '../../components/ImageUploader';

export type Product = {
  id: string; name: string; description: string; price: number; stock: number; category?: string | null; imageUrl?: string | null; active: boolean; deliveryCharge?: number;
};

type FormState = { name: string; price: string; stock: string; deliveryCharge: string; category: string; description: string; imageUrl: string | null; active: boolean };
const empty: FormState = { name: '', price: '', stock: '', deliveryCharge: '0', category: '', description: '', imageUrl: null, active: true };
const fromProduct = (p: Product): FormState => ({
  name: p.name, price: String(p.price), stock: String(p.stock), deliveryCharge: String(p.deliveryCharge ?? 0), category: p.category || '',
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
  if (f.name.trim().length < 2) return 'Enter the product name (at least 2 characters).';
  if (!/^\d+$/.test(f.price.trim()) || Number(f.price) < 1) return 'Enter the price in whole rupees, for example 100.';
  if (!/^\d+$/.test(f.stock.trim())) return 'Enter the stock as a whole number, for example 25 (0 if out of stock).';
  if (!/^\d+$/.test(f.deliveryCharge.trim())) return 'Enter the delivery charge in whole rupees. Enter 0 for free delivery.';
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
      const body = JSON.stringify({ name: f.name.trim(), price: Number(f.price), stock: Number(f.stock), deliveryCharge: Number(f.deliveryCharge), category: f.category.trim(), description: f.description.trim(), imageUrl: f.imageUrl || '', active: f.active });
      if (product) await api(`/api/admin/products/${product.id}`, { method: 'PATCH', body });
      else await api('/api/admin/products', { method: 'POST', body });
      onSaved();
    } catch (err: any) {
      setError(err?.message || 'Could not save the product.');
    } finally { setBusy(false); }
  }

  return (
    <form onSubmit={save} className="rounded-3xl border bg-white p-5 md:p-7" style={{ borderColor: '#c9d3cb' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{product ? `Edit: ${product.name}` : 'Add a new product'}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="btn btn-light" style={{ padding: 10 }}><X size={16} /></button>
      </div>
      <p className="mt-1 text-sm text-neutral-500">Whatever you enter here is shown to customers on the website and the WhatsApp bot. Fields marked * are required.</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Product name" required hint="Customers type this name on WhatsApp to order. Keep it short and clear, for example “Nariyal”.">
          <input className="input" value={f.name} maxLength={80} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Nariyal" />
        </Field>
        <Field label="Price (₹, whole rupees)" required hint="Price of one piece in whole rupees, for example 100. Delivery charge is added separately.">
          <input className="input" inputMode="numeric" value={f.price} onChange={(e) => set('price', e.target.value.replace(/[^\d]/g, ''))} placeholder="e.g. 100" />
        </Field>
        <Field label="Stock (pieces available)" required hint="Enter 0 to mark the product “out of stock”; it can then not be ordered on WhatsApp. Customers never see the stock number.">
          <input className="input" inputMode="numeric" value={f.stock} onChange={(e) => set('stock', e.target.value.replace(/[^\d]/g, ''))} placeholder="e.g. 25" />
        </Field>
        <Field label="Delivery charge (₹ per piece)" required hint="Enter 0 for FREE delivery on this product. For example 80 means ₹80 is added for every piece the customer orders (2 pieces = ₹160). The customer sees it before paying.">
          <input className="input" inputMode="numeric" value={f.deliveryCharge} onChange={(e) => set('deliveryCharge', e.target.value.replace(/[^\d]/g, ''))} placeholder="0 = free delivery" />
        </Field>
        <Field label="Category (optional)" hint="For example: Pooja, Mala, Apparel.">
          <input className="input" value={f.category} maxLength={40} onChange={(e) => set('category', e.target.value)} placeholder="e.g. Pooja" />
        </Field>
        <div className="md:col-span-2">
          <Field label="Description (optional)" hint="Shown below the product on the website. One or two lines is enough.">
            <textarea className="input" style={{ minHeight: 96 }} maxLength={1000} value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Write about the product…" />
          </Field>
        </div>
        <div className="md:col-span-2">
          <Field label="Product photo">
            <ImageUploader value={f.imageUrl} onChange={(url) => set('imageUrl', url)} />
          </Field>
        </div>
        <label className="md:col-span-2" style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 14 }}>
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
          Show on the website and WhatsApp (when switched off the product is hidden)
        </label>
      </div>

      {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex gap-3">
        <button className="btn btn-dark" disabled={busy}>{busy ? 'Saving…' : product ? 'Save changes' : 'Add product'}</button>
        <button type="button" className="btn btn-light" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

/** Store-wide offer: orders whose product total reaches this amount ship free (0 = no offer). */
function ShippingOffer() {
  const [value, setValue] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { api<{ freeAbove: number }>('/api/admin/settings/shipping').then((r) => setValue(String(r?.freeAbove ?? 0))).catch(() => undefined); }, []);
  async function save(e: React.FormEvent) {
    e.preventDefault(); setMsg(null);
    if (!/^\d+$/.test(value.trim())) return setMsg({ ok: false, text: 'Enter whole rupees, for example 1000. Enter 0 for no offer.' });
    setBusy(true);
    try { const r = await api<{ freeAbove: number }>('/api/admin/settings/shipping', { method: 'PUT', body: JSON.stringify({ freeAbove: Number(value) }) }); setMsg({ ok: true, text: r!.freeAbove ? `Saved. Orders of ₹${r!.freeAbove.toLocaleString('en-IN')} or more now get free delivery.` : 'Saved. There is no free-delivery offer; each product’s own charge applies.' }); }
    catch (err: any) { setMsg({ ok: false, text: err.message }); } finally { setBusy(false); }
  }
  return (
    <form onSubmit={save} className="mb-5 rounded-2xl border bg-[#f7f8f4] p-4">
      <div className="text-sm font-bold">Free-delivery offer for the whole store</div>
      <p className="mt-1 text-xs text-neutral-500">When the product total of an order reaches this amount, delivery is free whatever each product’s own charge is. Enter 0 to switch the offer off.</p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-sm">Free delivery on orders of ₹</span>
        <input className="input" style={{ width: 130 }} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value.replace(/[^\d]/g, ''))} aria-label="Free delivery above" />
        <button className="btn btn-dark" disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
      </div>
      {msg && <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 rounded-xl p-3 text-sm ${msg.ok ? 'bg-[#eef5ef] text-[#1d4d36]' : 'bg-red-50 text-red-700'}`}>{msg.text}</p>}
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
    return <ProductForm product={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice('Product saved. It is now live on the website and WhatsApp.'); await reload(); }} />;
  }

  return (
    <div className="rounded-3xl border bg-white p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">Product catalogue</h2><p className="text-sm text-neutral-500">{products.length} products</p></div>
        <button onClick={() => { setNotice(''); setEditing('new'); }} className="btn btn-dark"><Plus size={16} /> New product</button>
      </div>
      <ShippingOffer />
      {notice && <p role="status" className="mb-4 rounded-xl bg-[#eef5ef] p-3 text-sm text-[#1d4d36]">{notice}</p>}
      {!products.length && <p className="py-10 text-center text-sm text-neutral-400">No products yet. Click “New product” to add your first one.</p>}
      <div className="space-y-3">
        {products.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-3" style={{ opacity: p.active ? 1 : 0.62 }}>
            <div style={{ width: 84, height: 84, borderRadius: 14, overflow: 'hidden', background: '#f0eee7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {p.imageUrl ? <img src={p.imageUrl} alt={p.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <ImageOff size={22} color="#b7beb9" />}
            </div>
            <div style={{ flex: '1 1 220px', minWidth: 0 }}>
              <div className="font-bold">{p.name}</div>
              <div className="mt-1 text-sm text-neutral-500">₹{p.price.toLocaleString('en-IN')}{p.category ? ` · ${p.category}` : ''} · {p.deliveryCharge ? `Delivery ₹${p.deliveryCharge.toLocaleString('en-IN')}/piece` : 'Free delivery'}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full px-3 py-1" style={{ background: p.stock === 0 ? '#fde8e8' : p.stock < 5 ? '#fff3d6' : '#e8f3ec', color: p.stock === 0 ? '#b42318' : p.stock < 5 ? '#8a5a00' : '#1d5b3d' }}>{p.stock === 0 ? 'Out of stock' : `Stock: ${p.stock}`}</span>
                {!p.active && <span className="rounded-full bg-neutral-200 px-3 py-1">Hidden</span>}
                {!p.imageUrl && <span className="rounded-full bg-neutral-100 px-3 py-1 text-neutral-500">No photo</span>}
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-light" onClick={() => { setNotice(''); setEditing(p); }}><Pencil size={14} /> Edit</button>
              <button className="btn btn-light" onClick={() => toggle(p)}>{p.active ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
