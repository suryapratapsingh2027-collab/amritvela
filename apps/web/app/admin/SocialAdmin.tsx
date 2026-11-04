'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';

type Links = { instagram: string; facebook: string; whatsappGroup: string; youtube: string };
const EMPTY: Links = { instagram: '', facebook: '', whatsappGroup: '', youtube: '' };

const FIELDS: { key: keyof Links; label: string; placeholder: string; hint: string }[] = [
  { key: 'instagram', label: 'Instagram page link', placeholder: 'https://www.instagram.com/your_page/', hint: 'Open your Instagram page, copy the link from the address bar.' },
  { key: 'facebook', label: 'Facebook page link', placeholder: 'https://www.facebook.com/your.page', hint: 'Open your Facebook page and copy its link.' },
  { key: 'whatsappGroup', label: 'WhatsApp group / community invite link', placeholder: 'https://chat.whatsapp.com/XXXXXXXXXXXX', hint: 'In WhatsApp: Group info → Invite to group via link → Copy link.' },
  { key: 'youtube', label: 'YouTube channel link (optional)', placeholder: 'https://www.youtube.com/@your_channel', hint: 'Open your YouTube channel and copy its link.' },
];

export default function SocialAdmin() {
  const [links, setLinks] = useState<Links>(EMPTY);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    api<Partial<Links>>('/api/admin/settings/social')
      .then((r) => setLinks({ ...EMPTY, ...(r || {}) }))
      .catch((e) => setError(e?.message || 'Could not load the links.'))
      .finally(() => setLoading(false));
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    for (const f of FIELDS) {
      const v = links[f.key].trim();
      if (v && !/^https:\/\//i.test(v)) return setError(`${f.label}: the link must start with https://`);
    }
    setBusy(true);
    try {
      const saved = await api<Partial<Links>>('/api/admin/settings/social', { method: 'PUT', body: JSON.stringify(links) });
      setLinks({ ...EMPTY, ...(saved || {}) });
      setNotice('Saved. Customers will see these links on WhatsApp under “Follow us”.');
    } catch (err: any) { setError(err?.message || 'Could not save the links.'); } finally { setBusy(false); }
  }

  return (
    <form noValidate onSubmit={save} className="max-w-3xl rounded-3xl border bg-white p-6">
      <h2 className="text-xl font-bold">Social links</h2>
      <p className="mt-1 text-sm text-neutral-500">Customers see these in the WhatsApp menu under <b>Follow us</b>. Leave a field empty to remove that link. If every field is empty, the “Follow us” option is hidden.</p>
      {loading ? <p className="mt-6 text-sm text-neutral-400">Loading…</p> : (
        <div className="mt-6 space-y-5">
          {FIELDS.map((f) => (
            <label key={f.key} className="grid gap-1.5">
              <span className="text-sm font-extrabold">{f.label}</span>
              <input className="input" type="url" inputMode="url" value={links[f.key]} onChange={(e) => setLinks((x) => ({ ...x, [f.key]: e.target.value }))} placeholder={f.placeholder} />
              <span className="text-xs text-neutral-500">{f.hint}</span>
            </label>
          ))}
        </div>
      )}
      {error && <p role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {notice && <p role="status" className="mt-5 rounded-xl bg-[#eef5ef] p-3 text-sm text-[#1d4d36]">{notice}</p>}
      <button className="btn btn-dark mt-6" disabled={busy || loading}>{busy ? 'Saving…' : 'Save links'}</button>
    </form>
  );
}
