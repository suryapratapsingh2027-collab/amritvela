'use client';
import { useEffect, useState } from 'react';
import { Plus, Pencil, Trash2, Link2 } from 'lucide-react';
import { api } from '../../lib/api';
import ImageUploader from '../../components/ImageUploader';
import { Alert, Drawer, Field, Progress, StatusBadge, fdate, inr } from './ui';

const BLANK = { title: '', status: 'ACTIVE', targetAmount: '', startsAt: '', endsAt: '', descriptionEn: '', descriptionHi: '', descriptionHing: '', descriptionPa: '', imageUrl: '' as string | null };
const ist = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }) : '');

export default function CampaignsAdmin() {
  const [list, setList] = useState<any[] | null>(null);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<any | null>(null); // {} = new

  async function load() { try { setList((await api<any[]>('/api/admin/campaigns')) ?? []); setError(''); } catch (e: any) { setError(e?.message || 'The campaigns could not be loaded.'); } }
  useEffect(() => { load(); }, []);

  async function remove(c: any) {
    if (!confirm(`Delete “${c.title}”? This cannot be undone.`)) return;
    try { await api(`/api/admin/campaigns/${c.id}`, { method: 'DELETE' }); await load(); } catch (e: any) { setError(e?.message || 'Could not delete.'); }
  }

  return (
    <div className="adm-grid" style={{ gap: 18 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <p className="adm-sub" style={{ maxWidth: 620 }}>Each campaign has its own target, progress bar and donation link. Customers see active campaigns under <b>Donate</b> on WhatsApp and on the website.</p>
        <button className="adm-btn primary" onClick={() => setEditing({})}><Plus size={15} /> New campaign</button>
      </div>
      {error && <Alert kind="err">{error}</Alert>}
      {list && !list.length && <div className="adm-card adm-empty">No campaigns yet. Create the first one — for example “Langar Seva” or “Medical Camp”.</div>}
      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))' }}>
        {list?.map((c) => (
          <article key={c.id} className="adm-card" style={{ overflow: 'hidden' }}>
            {c.imageUrl ? <img src={c.imageUrl} alt="" style={{ width: '100%', height: 150, objectFit: 'cover' }} /> : <div style={{ height: 8, background: 'linear-gradient(90deg, var(--a-green-2), var(--a-gold))' }} />}
            <div className="adm-card-pad">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'flex-start' }}>
                <h3 className="adm-h2" style={{ fontSize: 17 }}>{c.title}</h3><StatusBadge status={c.effectiveStatus} />
              </div>
              <div style={{ margin: '16px 0 8px', display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700 }}><span>{inr(c.raised)} raised</span><span style={{ color: 'var(--a-muted)' }}>{c.percent}% of {inr(c.targetAmount)}</span></div>
              <Progress percent={c.percent} label={`${c.title} progress`} />
              <p className="adm-sub" style={{ marginTop: 10 }}>{c.donations} donation{c.donations === 1 ? '' : 's'} · {c.donors} donor{c.donors === 1 ? '' : 's'}{c.endsAt ? ` · ends ${fdate(c.endsAt)}` : ''}{c.goalReached ? ' · 🎉 goal reached' : ''}</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 16, flexWrap: 'wrap' }}>
                <button className="adm-btn sm" onClick={() => setEditing(c)}><Pencil size={13} /> Edit</button>
                <button className="adm-btn sm" onClick={() => { const url = `${location.origin}/donate?campaign=${c.slug}`; navigator.clipboard?.writeText(url).then(() => alert('Donation link copied:\n' + url)); }}><Link2 size={13} /> Copy link</button>
                <button className="adm-btn sm danger" onClick={() => remove(c)}><Trash2 size={13} /> Delete</button>
              </div>
            </div>
          </article>
        ))}
      </div>
      {editing && <CampaignForm initial={editing} onClose={() => setEditing(null)} onSaved={() => { setEditing(null); load(); }} />}
    </div>
  );
}

function CampaignForm({ initial, onClose, onSaved }: { initial: any; onClose: () => void; onSaved: () => void }) {
  const isNew = !initial.id;
  const [f, setF] = useState<any>(isNew ? BLANK : { title: initial.title, status: initial.status, targetAmount: String(initial.targetAmount), startsAt: ist(initial.startsAt), endsAt: ist(initial.endsAt), descriptionEn: initial.descriptionEn || '', descriptionHi: initial.descriptionHi || '', descriptionHing: initial.descriptionHing || '', descriptionPa: initial.descriptionPa || '', imageUrl: initial.imageUrl || null });
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const set = (k: string, v: any) => setF((x: any) => ({ ...x, [k]: v }));

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError('');
    if (f.title.trim().length < 3) return setError('Enter the campaign title (at least 3 characters).');
    const target = Number(f.targetAmount);
    if (!Number.isInteger(target) || target < 100) return setError('The target must be at least ₹100 (whole rupees).');
    if (f.startsAt && f.endsAt && f.endsAt < f.startsAt) return setError('The end date cannot be before the start date.');
    setBusy(true);
    try {
      const body = JSON.stringify({ ...f, targetAmount: target, startsAt: f.startsAt || null, endsAt: f.endsAt || null, imageUrl: f.imageUrl || null });
      await api(isNew ? '/api/admin/campaigns' : `/api/admin/campaigns/${initial.id}`, { method: isNew ? 'POST' : 'PATCH', body });
      onSaved();
    } catch (err: any) { setError(err?.message || 'Could not save the campaign.'); } finally { setBusy(false); }
  }

  return (
    <Drawer title={isNew ? 'New campaign' : 'Edit campaign'} onClose={onClose}>
      <form noValidate onSubmit={save} className="adm-grid" style={{ gap: 14 }}>
        {error && <Alert kind="err">{error}</Alert>}
        <Field label="Campaign title"><input className="adm-in" value={f.title} maxLength={80} onChange={(e) => set('title', e.target.value)} placeholder="e.g. Langar Seva" /></Field>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Target amount (₹)"><input className="adm-in" inputMode="numeric" value={f.targetAmount} onChange={(e) => set('targetAmount', e.target.value.replace(/[^\d]/g, ''))} placeholder="100000" /></Field>
          <Field label="Status"><select className="adm-in" value={f.status} onChange={(e) => set('status', e.target.value)}><option value="ACTIVE">Active — accepting donations</option><option value="PAUSED">Paused — hidden</option><option value="COMPLETED">Completed — shown, closed</option></select></Field>
          <Field label="Start date (optional)"><input type="date" className="adm-in" value={f.startsAt} onChange={(e) => set('startsAt', e.target.value)} /></Field>
          <Field label="End date (optional)"><input type="date" className="adm-in" value={f.endsAt} onChange={(e) => set('endsAt', e.target.value)} /></Field>
        </div>
        <Field label="Photo"><ImageUploader value={f.imageUrl} onChange={(u) => set('imageUrl', u)} square={false} hint="Shown on the website campaign card and WhatsApp. PNG, JPG or WebP." /></Field>
        <Field label="Description — English" hint="Shown to donors. A few lines about what the money is used for."><textarea className="adm-in" value={f.descriptionEn} onChange={(e) => set('descriptionEn', e.target.value)} /></Field>
        <Field label="Description — हिन्दी (optional)"><textarea className="adm-in" value={f.descriptionHi} onChange={(e) => set('descriptionHi', e.target.value)} /></Field>
        <Field label="Description — Hinglish (optional)"><textarea className="adm-in" value={f.descriptionHing} onChange={(e) => set('descriptionHing', e.target.value)} /></Field>
        <Field label="Description — ਪੰਜਾਬੀ (optional)" hint="If a language is empty, donors in that language see the English text."><textarea className="adm-in" value={f.descriptionPa} onChange={(e) => set('descriptionPa', e.target.value)} /></Field>
        <div style={{ display: 'flex', gap: 10 }}><button className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : isNew ? 'Create campaign' : 'Save changes'}</button><button type="button" className="adm-btn" onClick={onClose}>Cancel</button></div>
      </form>
    </Drawer>
  );
}
