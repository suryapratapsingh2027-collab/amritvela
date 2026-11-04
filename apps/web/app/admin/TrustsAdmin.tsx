'use client';
import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil, Plus, QrCode, Trash2, X } from 'lucide-react';
import { api } from '../../lib/api';
import ImageUploader from '../../components/ImageUploader';

type Trust = {
  id: string; slug: string; name: string; active: boolean; sortOrder: number; infoEn: string; infoHi: string | null; infoHing: string | null; infoPa: string | null;
  qrImageUrl: string | null; upiId: string | null; contactPhone: string | null; contactEmail: string | null;
};
type Form = { name: string; active: boolean; infoEn: string; infoHi: string; infoHing: string; infoPa: string; qrImageUrl: string | null; upiId: string; contactPhone: string; contactEmail: string };
const EMPTY: Form = { name: '', active: false, infoEn: '', infoHi: '', infoHing: '', infoPa: '', qrImageUrl: null, upiId: '', contactPhone: '', contactEmail: '' };
const toForm = (t: Trust): Form => ({ name: t.name, active: t.active, infoEn: t.infoEn, infoHi: t.infoHi || '', infoHing: t.infoHing || '', infoPa: t.infoPa || '', qrImageUrl: t.qrImageUrl, upiId: t.upiId || '', contactPhone: t.contactPhone || '', contactEmail: t.contactEmail || '' });
const MAX_INFO = 650;

function Field({ label, hint, required, children }: { label: string; hint?: string; required?: boolean; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-extrabold">{label}{required && <span className="text-red-700"> *</span>}</span>
      {children}
      {hint && <span className="text-xs leading-5 text-neutral-500">{hint}</span>}
    </label>
  );
}

function TrustForm({ trust, onClose, onSaved }: { trust?: Trust; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState<Form>(trust ? toForm(trust) : EMPTY);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((x) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (f.name.trim().length < 2) return setError('Enter the trust name.');
    if (f.active && f.infoEn.trim().length < 10) return setError('Write the information in English (at least 10 characters) before making the trust visible, or keep it hidden.');
    setBusy(true);
    try {
      const body = JSON.stringify({ name: f.name.trim(), active: f.active, infoEn: f.infoEn.trim(), infoHi: f.infoHi.trim(), infoHing: f.infoHing.trim(), infoPa: f.infoPa.trim(), qrImageUrl: f.qrImageUrl || '', upiId: f.upiId.trim(), contactPhone: f.contactPhone.trim(), contactEmail: f.contactEmail.trim() });
      if (trust) await api(`/api/admin/trusts/${trust.id}`, { method: 'PATCH', body }); else await api('/api/admin/trusts', { method: 'POST', body });
      onSaved();
    } catch (err: any) { setError(err?.message || 'Could not save the trust.'); } finally { setBusy(false); }
  }

  const info = (key: 'infoEn' | 'infoHi' | 'infoHing' | 'infoPa', label: string, required: boolean, hint: string) => (
    <Field label={label} required={required} hint={`${f[key].length}/${MAX_INFO} characters. ${hint}`}>
      <textarea className="input" style={{ minHeight: 110 }} maxLength={MAX_INFO} value={f[key]} onChange={(e) => set(key, e.target.value)} />
    </Field>
  );

  return (
    <form onSubmit={save} noValidate className="rounded-3xl border bg-white p-5 md:p-7" style={{ borderColor: '#c9d3cb' }}>
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">{trust ? `Edit: ${trust.name}` : 'Add a trust'}</h2>
        <button type="button" onClick={onClose} aria-label="Close" className="btn btn-light" style={{ padding: 10 }}><X size={16} /></button>
      </div>
      <p className="mt-1 text-sm text-neutral-500">Customers choose this trust in the WhatsApp menu (<b>Our Trusts</b> and <b>Donate</b>). They receive the information below and the donation QR code.</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Trust name" required hint="Shown in the WhatsApp list (maximum 24 characters).">
          <input className="input" value={f.name} maxLength={24} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Nanak Roti Trust" />
        </Field>
        <label className="flex items-center gap-3 self-end pb-3 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
          <span><b>Visible to customers</b><br /><span className="text-xs text-neutral-500">Switch on once the information is ready. Hidden trusts are not shown on WhatsApp.</span></span>
        </label>
        <div className="md:col-span-2">{info('infoEn', 'Information (English)', true, 'Required. Used for every customer whose language has no translation below.')}</div>
        {info('infoHi', 'Information (Hindi)', false, 'Optional. Shown to customers who chose Hindi.')}
        {info('infoHing', 'Information (Hinglish)', false, 'Optional. Hindi written in English letters.')}
        <div className="md:col-span-2">{info('infoPa', 'Information (Punjabi)', false, 'Optional. Shown to customers who chose Punjabi.')}</div>
        <Field label="UPI ID (optional)" hint="Shown under the QR code so donors can also type it, for example name@oksbi.">
          <input className="input" value={f.upiId} maxLength={80} onChange={(e) => set('upiId', e.target.value)} placeholder="e.g. nanakroti@oksbi" />
        </Field>
        <Field label="Contact phone (optional)"><input className="input" value={f.contactPhone} maxLength={30} onChange={(e) => set('contactPhone', e.target.value)} placeholder="e.g. 98xxxxxx01" /></Field>
        <Field label="Contact email (optional)"><input className="input" type="email" value={f.contactEmail} maxLength={120} onChange={(e) => set('contactEmail', e.target.value)} placeholder="e.g. info@example.org" /></Field>
        <div className="md:col-span-2">
          <Field label="Donation QR code (PhonePe / any UPI app)" hint="">
            <ImageUploader square={false} value={f.qrImageUrl} onChange={(url) => set('qrImageUrl', url)}
              hint="Upload the QR image as it is (PNG or JPG). It is not cropped. On WhatsApp customers scan it with PhonePe, Google Pay, Paytm or any UPI app to donate." />
          </Field>
        </div>
      </div>

      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      <div className="mt-6 flex gap-3">
        <button className="btn btn-dark" disabled={busy}>{busy ? 'Saving…' : trust ? 'Save changes' : 'Add trust'}</button>
        <button type="button" className="btn btn-light" onClick={onClose}>Cancel</button>
      </div>
    </form>
  );
}

export default function TrustsAdmin() {
  const [trusts, setTrusts] = useState<Trust[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Trust | 'new' | null>(null);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setTrusts((await api<Trust[]>('/api/admin/trusts')) ?? []); } catch (e: any) { setError(e?.message || 'Could not load the trusts.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function toggle(t: Trust) {
    setError('');
    try { await api(`/api/admin/trusts/${t.id}`, { method: 'PATCH', body: JSON.stringify({ active: !t.active }) }); await load(); }
    catch (e: any) { setError(e?.message || 'Could not update the trust.'); }
  }
  async function remove(t: Trust) {
    if (!confirm(`Delete “${t.name}”? Customers will no longer see it on WhatsApp.`)) return;
    try { await api(`/api/admin/trusts/${t.id}`, { method: 'DELETE' }); await load(); } catch (e: any) { setError(e?.message || 'Could not delete the trust.'); }
  }

  if (editing) {
    return <TrustForm trust={editing === 'new' ? undefined : editing} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice('Saved.'); await load(); }} />;
  }

  return (
    <div className="rounded-3xl border bg-white p-5 md:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-xl font-bold">Other trusts</h2><p className="text-sm text-neutral-500">Amrit Vela Trust is built in. Add other trusts (for example Nanak Roti Trust) with their information and donation QR code.</p></div>
        <button className="btn btn-dark" onClick={() => { setNotice(''); setEditing('new'); }}><Plus size={16} /> Add trust</button>
      </div>
      {notice && <p role="status" className="mb-4 rounded-xl bg-[#eef5ef] p-3 text-sm text-[#1d4d36]">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-neutral-400">Loading…</p>}
      {!loading && !trusts.length && <p className="py-8 text-center text-sm text-neutral-400">No other trusts yet. Click “Add trust”.</p>}
      <div className="space-y-3">
        {trusts.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-4 rounded-2xl border p-3" style={{ opacity: t.active ? 1 : 0.75 }}>
            <div style={{ width: 84, height: 84, borderRadius: 14, overflow: 'hidden', background: '#f0eee7', display: 'grid', placeItems: 'center', flexShrink: 0 }}>
              {t.qrImageUrl ? <img src={t.qrImageUrl} alt={`${t.name} QR code`} style={{ width: '100%', height: '100%', objectFit: 'contain', background: '#fff' }} /> : <QrCode size={26} color="#b7beb9" />}
            </div>
            <div style={{ flex: '1 1 240px', minWidth: 0 }}>
              <div className="font-bold">{t.name}</div>
              <div className="mt-1 line-clamp-2 text-sm text-neutral-500">{t.infoEn || 'No information written yet.'}</div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs font-bold">
                <span className="rounded-full px-3 py-1" style={{ background: t.active ? '#e8f3ec' : '#eee', color: t.active ? '#1d5b3d' : '#555' }}>{t.active ? 'Visible on WhatsApp' : 'Hidden'}</span>
                {!t.qrImageUrl && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">No QR code</span>}
                {t.upiId && <span className="rounded-full bg-neutral-100 px-3 py-1">{t.upiId}</span>}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button className="btn btn-light" onClick={() => { setNotice(''); setEditing(t); }}><Pencil size={14} /> Edit</button>
              <button className="btn btn-light" onClick={() => toggle(t)}>{t.active ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}</button>
              <button className="btn btn-light" onClick={() => remove(t)}><Trash2 size={14} /> Delete</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
