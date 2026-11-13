'use client';
import { useCallback, useEffect, useState } from 'react';
import { Eye, EyeOff, Pencil, Plus, QrCode, Trash2, X } from 'lucide-react';
import { api, API } from '../../lib/api';
import ImageUploader from '../../components/ImageUploader';

type Trust = {
  id: string; slug: string; name: string; active: boolean; sortOrder: number; infoEn: string; infoHi: string | null; infoHing: string | null; infoPa: string | null; infoMr?: string | null;
  qrImageUrl: string | null; upiId: string | null; contactPhone: string | null; contactEmail: string | null;
  accountMode: Mode; razorpayKeyId: string | null; hasKeySecret: boolean; hasWebhookSecret: boolean; offerQr: boolean; presets: { label: string; amount: number }[];
};
type Mode = 'DEFAULT' | 'OWN' | 'QR_ONLY';
const MODES: { value: Mode; title: string; text: string }[] = [
  { value: 'DEFAULT', title: 'Main Razorpay account', text: 'Online payments go to the Trust’s main Razorpay account (the one already connected).' },
  { value: 'OWN', title: 'This trust’s own Razorpay account', text: 'Online payments go straight to a separate Razorpay account that belongs to this trust. Enter its keys below.' },
  { value: 'QR_ONLY', title: 'QR / UPI only', text: 'No payment link. Donors scan the QR code (or use the UPI ID) and the money goes to this trust’s bank account.' },
];
type Form = { accountMode: Mode; razorpayKeyId: string; razorpayKeySecret: string; razorpayWebhookSecret: string; clearKeys: boolean; offerQr: boolean; presets: { label: string; amount: string }[]; name: string; active: boolean; infoEn: string; infoHi: string; infoHing: string; infoPa: string; infoMr: string; qrImageUrl: string | null; upiId: string; contactPhone: string; contactEmail: string };
const EMPTY: Form = { accountMode: 'DEFAULT', razorpayKeyId: '', razorpayKeySecret: '', razorpayWebhookSecret: '', clearKeys: false, offerQr: true, presets: [], name: '', active: false, infoEn: '', infoHi: '', infoHing: '', infoPa: '', infoMr: '', qrImageUrl: null, upiId: '', contactPhone: '', contactEmail: '' };
const toForm = (t: Trust): Form => ({ accountMode: t.accountMode, razorpayKeyId: t.razorpayKeyId || '', razorpayKeySecret: '', razorpayWebhookSecret: '', clearKeys: false, offerQr: t.offerQr, presets: (t.presets || []).map((x) => ({ label: x.label, amount: String(x.amount) })), name: t.name, active: t.active, infoEn: t.infoEn, infoHi: t.infoHi || '', infoHing: t.infoHing || '', infoPa: t.infoPa || '', infoMr: t.infoMr || '', qrImageUrl: t.qrImageUrl, upiId: t.upiId || '', contactPhone: t.contactPhone || '', contactEmail: t.contactEmail || '' });
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
  const [test, setTest] = useState<{ ok: boolean; text: string } | null>(null);
  const [testing, setTesting] = useState(false);
  async function testKeys() {
    if (!trust) return;
    setTesting(true); setTest(null);
    try { const r = await api<{ ok: boolean; message?: string; error?: string }>(`/api/admin/trusts/${trust.id}/test-razorpay`, { method: 'POST' }); setTest({ ok: Boolean(r?.ok), text: r?.message || r?.error || (r?.ok ? 'Connected.' : 'Could not connect.') }); }
    catch (e: any) { setTest({ ok: false, text: e?.message || 'Could not connect.' }); } finally { setTesting(false); }
  }
  const setPreset = (i: number, patch: Partial<{ label: string; amount: string }>) => setF((x) => ({ ...x, presets: x.presets.map((p, j) => (j === i ? { ...p, ...patch } : p)) }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (f.name.trim().length < 2) return setError('Enter the trust name.');
    if (f.infoEn.trim() && f.infoEn.trim().length < 10) return setError('Write the information in English (at least 10 characters), or leave it empty for a donation-only trust.');
    if (f.accountMode === 'OWN' && !f.clearKeys && (!f.razorpayKeyId.trim() || (!f.razorpayKeySecret.trim() && !trust?.hasKeySecret))) return setError('To use this trust’s own Razorpay account, enter both its Key ID and Key Secret.');
    if (f.accountMode === 'QR_ONLY' && !f.qrImageUrl && !f.upiId.trim()) return setError('A QR-only trust needs its QR code image (or at least a UPI ID), otherwise donors cannot pay.');
    for (const x of f.presets) if (x.label.trim().length < 2 || !/^\d+$/.test(x.amount.trim()) || Number(x.amount) < 1) return setError('Each quick amount needs a short name and an amount in whole rupees.');
    setBusy(true);
    try {
      const body = JSON.stringify({ name: f.name.trim(), active: f.active, infoEn: f.infoEn.trim(), infoHi: f.infoHi.trim(), infoHing: f.infoHing.trim(), infoPa: f.infoPa.trim(), infoMr: f.infoMr.trim(), qrImageUrl: f.qrImageUrl || '', upiId: f.upiId.trim(), contactPhone: f.contactPhone.trim(), contactEmail: f.contactEmail.trim(),
        accountMode: f.accountMode, offerQr: f.offerQr, presets: f.presets.map((x) => ({ label: x.label.trim(), amount: Number(x.amount) })),
        ...(f.accountMode === 'OWN' ? { razorpayKeyId: f.razorpayKeyId.trim(), ...(f.razorpayKeySecret.trim() ? { razorpayKeySecret: f.razorpayKeySecret.trim() } : {}), ...(f.razorpayWebhookSecret.trim() ? { razorpayWebhookSecret: f.razorpayWebhookSecret.trim() } : {}) } : {}),
        ...(f.clearKeys ? { clearRazorpayKeys: true } : {}) });
      if (trust) await api(`/api/admin/trusts/${trust.id}`, { method: 'PATCH', body }); else await api('/api/admin/trusts', { method: 'POST', body });
      onSaved();
    } catch (err: any) { setError(err?.message || 'Could not save the trust.'); } finally { setBusy(false); }
  }

  const info = (key: 'infoEn' | 'infoHi' | 'infoHing' | 'infoPa' | 'infoMr', label: string, required: boolean, hint: string) => (
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
      <p className="mt-1 text-sm text-neutral-500">Donors choose this trust under <b>Donate</b> on WhatsApp. Set where its money goes, the QR code and quick amounts below.</p>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <Field label="Trust name" required hint="Shown in the WhatsApp list (maximum 24 characters).">
          <input className="input" value={f.name} maxLength={24} onChange={(e) => set('name', e.target.value)} placeholder="e.g. Nanak Roti Trust" />
        </Field>
        <label className="flex items-center gap-3 self-end pb-3 text-sm">
          <input type="checkbox" checked={f.active} onChange={(e) => set('active', e.target.checked)} />
          <span><b>Visible to customers</b><br /><span className="text-xs text-neutral-500">Switch on once the information is ready. Hidden trusts are not shown on WhatsApp.</span></span>
        </label>
        <div className="md:col-span-2 rounded-2xl border p-4" style={{ background: '#f7f8f4' }}>
          <div className="text-sm font-extrabold">Where does this trust’s donation money go?</div>
          <div className="mt-3 grid gap-2">
            {MODES.map((m) => (
              <label key={m.value} className="flex cursor-pointer gap-3 rounded-xl border bg-white p-3 text-sm" style={{ borderColor: f.accountMode === m.value ? '#17533c' : undefined, boxShadow: f.accountMode === m.value ? '0 0 0 2px rgba(23,83,60,.15)' : undefined }}>
                <input type="radio" name="mode" checked={f.accountMode === m.value} onChange={() => set('accountMode', m.value)} />
                <span><b>{m.title}</b><br /><span className="text-xs text-neutral-500">{m.text}</span></span>
              </label>
            ))}
          </div>
          {f.accountMode === 'OWN' && (
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <Field label="Razorpay Key ID" required hint="Razorpay Dashboard of THIS trust → Account & Settings → API Keys. Looks like rzp_live_xxxxxxxx.">
                <input className="input" autoComplete="off" value={f.razorpayKeyId} onChange={(e) => set('razorpayKeyId', e.target.value)} placeholder="rzp_live_xxxxxxxxxx" />
              </Field>
              <Field label="Razorpay Key Secret" required hint={trust?.hasKeySecret ? '✓ A secret is saved (hidden for safety). Leave this empty to keep it, or type a new one to replace it.' : 'Stored encrypted. It is never shown again after saving.'}>
                <input className="input" type="password" autoComplete="new-password" value={f.razorpayKeySecret} onChange={(e) => set('razorpayKeySecret', e.target.value)} placeholder={trust?.hasKeySecret ? '•••••••• (saved)' : 'Key Secret'} />
              </Field>
              <Field label="Webhook secret" hint={`${trust?.hasWebhookSecret ? '✓ Saved. Leave empty to keep it. ' : ''}In THIS trust’s Razorpay → Webhooks add the URL ${API || 'https://your-api'}/webhooks/razorpay with events payment_link.paid and payment.captured, and type the same secret here. Without it, payments are still confirmed within 2 minutes by automatic checking.`}>
                <input className="input" type="password" autoComplete="new-password" value={f.razorpayWebhookSecret} onChange={(e) => set('razorpayWebhookSecret', e.target.value)} placeholder={trust?.hasWebhookSecret ? '•••••••• (saved)' : 'Webhook secret'} />
              </Field>
              <div className="self-end">
                {trust ? <button type="button" className="btn btn-light" onClick={testKeys} disabled={testing}>{testing ? 'Testing…' : 'Test connection'}</button> : <span className="text-xs text-neutral-500">Save the trust first, then you can test the connection.</span>}
                {trust && (trust.razorpayKeyId || trust.hasKeySecret) && <label className="mt-3 flex items-center gap-2 text-xs text-neutral-600"><input type="checkbox" checked={f.clearKeys} onChange={(e) => set('clearKeys', e.target.checked)} /> Remove the saved Razorpay keys</label>}
              </div>
              {test && <p role={test.ok ? 'status' : 'alert'} className={`md:col-span-2 rounded-xl p-3 text-sm ${test.ok ? 'bg-[#eef5ef] text-[#1d4d36]' : 'bg-red-50 text-red-700'}`}>{test.ok ? '✓ ' : ''}{test.text} {trust && 'Test uses the keys already saved — save first if you just changed them.'}</p>}
            </div>
          )}
          {f.accountMode !== 'QR_ONLY' && (
            <label className="mt-4 flex items-start gap-3 text-sm"><input type="checkbox" className="mt-1" checked={f.offerQr} onChange={(e) => set('offerQr', e.target.checked)} />
              <span><b>Also offer the QR code</b><br /><span className="text-xs text-neutral-500">A “Pay by QR code” button appears under the payment link (for donors whose link does not open). If the link cannot be created, the QR is sent automatically. Needs the QR image or UPI ID below.</span></span></label>
          )}
          <div className="mt-4">
            <div className="text-sm font-extrabold">Quick amounts for this trust (optional, max 3)</div>
            <p className="text-xs text-neutral-500">Shown first in the WhatsApp amount list, for example “One time langar — ₹13,000”.</p>
            {f.presets.map((p, i) => (
              <div key={i} className="mt-2 flex flex-wrap items-center gap-2">
                <input className="input" style={{ flex: '1 1 200px' }} maxLength={40} value={p.label} onChange={(e) => setPreset(i, { label: e.target.value })} placeholder="Name, e.g. One time langar" aria-label="Quick amount name" />
                <span>₹</span><input className="input" style={{ width: 130 }} inputMode="numeric" value={p.amount} onChange={(e) => setPreset(i, { amount: e.target.value.replace(/[^\d]/g, '') })} placeholder="13000" aria-label="Quick amount" />
                <button type="button" className="btn btn-light" style={{ padding: 10 }} aria-label="Remove quick amount" onClick={() => setF((x) => ({ ...x, presets: x.presets.filter((_, j) => j !== i) }))}><X size={14} /></button>
              </div>
            ))}
            {f.presets.length < 3 && <button type="button" className="btn btn-light mt-3" onClick={() => setF((x) => ({ ...x, presets: [...x.presets, { label: '', amount: '' }] }))}><Plus size={14} /> Add quick amount</button>}
          </div>
        </div>
        <div className="md:col-span-2">{info('infoEn', 'Information (English)', false, 'Optional for a donation-only trust. Used for every customer whose language has no translation below.')}</div>
        {info('infoHi', 'Information (Hindi)', false, 'Optional. Shown to customers who chose Hindi.')}
        {info('infoHing', 'Information (Hinglish)', false, 'Optional. Hindi written in English letters.')}
        {info('infoPa', 'Information (Punjabi)', false, 'Optional. Shown to customers who chose Punjabi.')}
        {info('infoMr', 'Information (Marathi)', false, 'Optional. Shown to customers who chose Marathi.')}
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
        <div><h2 className="text-xl font-bold">Trusts &amp; donation accounts</h2><p className="text-sm text-neutral-500">Donors pick a trust on WhatsApp and the donation goes to that trust’s own account. Set each trust’s account, QR code and quick amounts here.</p></div>
        <button className="btn btn-dark" onClick={() => { setNotice(''); setEditing('new'); }}><Plus size={16} /> Add trust</button>
      </div>
      {notice && <p role="status" className="mb-4 rounded-xl bg-[#eef5ef] p-3 text-sm text-[#1d4d36]">{notice}</p>}
      {error && <p role="alert" className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {loading && <p className="text-sm text-neutral-400">Loading…</p>}
      {!loading && !trusts.length && <p className="py-8 text-center text-sm text-neutral-400">No trusts yet. Click “Add trust”.</p>}
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
                <span className="rounded-full bg-blue-50 px-3 py-1 text-blue-800">{t.accountMode === 'OWN' ? (t.hasKeySecret ? 'Own Razorpay account' : 'Own account: keys missing') : t.accountMode === 'QR_ONLY' ? 'QR / UPI only' : 'Main Razorpay account'}</span>
                {!t.qrImageUrl && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-800">No QR code</span>}
                {t.presets?.length > 0 && <span className="rounded-full bg-neutral-100 px-3 py-1">{t.presets.length} quick amount{t.presets.length > 1 ? 's' : ''}</span>}
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
