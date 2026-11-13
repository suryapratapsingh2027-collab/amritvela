'use client';
import { useEffect, useState } from 'react';
import { Search, Download } from 'lucide-react';
import { api, downloadFile } from '../../lib/api';
import { Alert, Drawer, Field, Kpi, StatusBadge, fdate, fdatetime, inr } from './ui';

const LANG: Record<string, string> = { en: 'English', hi: 'Hindi', hing: 'Hinglish', pa: 'Punjabi', mr: 'Marathi' };

export default function DonorsAdmin() {
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState('recent');
  const [minTotal, setMinTotal] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ donors: any[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const q = new URLSearchParams({ sort, page: String(page) }); if (search.trim()) q.set('search', search.trim()); if (Number(minTotal) > 0) q.set('minTotal', minTotal);
        setData(await api(`/api/admin/donors?${q}`)); setError('');
      } catch (e: any) { setError(e?.message || 'The donor list could not be loaded.'); }
    }, 250);
    return () => clearTimeout(t);
  }, [search, sort, minTotal, page]);

  const pages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  return (
    <div className="adm-card">
      <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12 }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--a-muted)' }} />
          <input className="adm-in" style={{ paddingLeft: 36 }} placeholder="Search name, phone or email" aria-label="Search donors" value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} />
        </div>
        <select className="adm-in" style={{ width: 'auto' }} aria-label="Sort donors" value={sort} onChange={(e) => { setSort(e.target.value); setPage(1); }}>
          <option value="recent">Most recent</option><option value="total">Highest total</option><option value="count">Most donations</option><option value="name">Name A–Z</option>
        </select>
        <input className="adm-in" style={{ width: 150 }} type="number" min="0" placeholder="Min total ₹" aria-label="Minimum total donated" value={minTotal} onChange={(e) => { setMinTotal(e.target.value); setPage(1); }} />
      </div>
      {error && <div style={{ padding: '0 20px 14px' }}><Alert kind="err">{error}</Alert></div>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Donor</th><th>Phone</th><th>Language</th><th className="adm-num">Donations</th><th className="adm-num">Total given</th><th>Last donation</th></tr></thead>
          <tbody>
            {data?.donors.map((d) => (
              <tr key={d.id} style={{ cursor: 'pointer' }} onClick={() => setOpen(d.id)}>
                <td><button className="adm-btn sm" style={{ border: 0, background: 'transparent', padding: 0, fontWeight: 800, boxShadow: 'none' }} onClick={() => setOpen(d.id)}>{d.name || 'Unnamed donor'}</button></td>
                <td>{d.phone}</td><td>{LANG[d.language] || '—'}</td><td className="adm-num">{d.donations}</td><td className="adm-num"><b>{inr(d.totalDonated)}</b></td><td>{fdate(d.lastDonationAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {data && !data.donors.length && <div className="adm-empty">{search || minTotal ? 'No donor matches these filters.' : 'Donors will appear after the first donation.'}</div>}
        {!data && !error && <div className="adm-empty">Loading…</div>}
      </div>
      {data && data.total > data.pageSize && (
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: 16 }}>
          <span className="adm-sub">{data.total} donors · page {page} of {pages}</span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="adm-btn sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
            <button className="adm-btn sm" disabled={page >= pages} onClick={() => setPage(page + 1)}>Next</button>
          </div>
        </div>
      )}
      {open && <DonorDrawer id={open} onClose={() => setOpen(null)} onSaved={() => setPage((p) => p)} />}
    </div>
  );
}

function DonorDrawer({ id, onClose, onSaved }: { id: string; onClose: () => void; onSaved: () => void }) {
  const [p, setP] = useState<any>(null);
  const [form, setForm] = useState({ name: '', email: '', notes: '', liveAlerts: true });
  const [error, setError] = useState(''); const [notice, setNotice] = useState(''); const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<any>(`/api/admin/donors/${id}`).then((r) => { setP(r); setForm({ name: r.name || '', email: r.email || '', notes: r.notes || '', liveAlerts: r.liveAlerts !== false }); }).catch((e) => setError(e?.message || 'Could not load this donor.'));
  }, [id]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    if (form.email.trim() && !/^\S+@\S+\.\S+$/.test(form.email.trim())) return setError('Enter a valid email address.');
    setBusy(true);
    try { const r = await api<any>(`/api/admin/donors/${id}`, { method: 'PATCH', body: JSON.stringify(form) }); setP(r); setNotice('Saved.'); onSaved(); }
    catch (err: any) { setError(err?.message || 'Could not save.'); } finally { setBusy(false); }
  }

  return (
    <Drawer title={p?.name || p?.phone || 'Donor'} onClose={onClose}>
      {error && <Alert kind="err">{error}</Alert>}
      {!p && !error && <p className="adm-sub">Loading…</p>}
      {p && <div className="adm-grid" style={{ gap: 18 }}>
        <div className="adm-kpis" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Kpi label="Total donated" value={inr(p.stats.totalDonated)} note={`${p.stats.donations} paid donation${p.stats.donations === 1 ? '' : 's'}`} hero />
          <Kpi label="Average" value={inr(p.stats.averageDonation)} note={p.stats.lastDonationAt ? `Last: ${fdate(p.stats.lastDonationAt)}` : 'No paid donation yet'} />
        </div>
        <form noValidate onSubmit={save} className="adm-card adm-card-pad adm-grid" style={{ gap: 12 }}>
          <Field label="Name"><input className="adm-in" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
          <Field label="Email (printed on the receipt)"><input className="adm-in" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
          <Field label="Internal notes" hint="Only the Trust team sees this."><textarea className="adm-in" value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></Field>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, fontWeight: 650 }}><input type="checkbox" checked={form.liveAlerts} onChange={(e) => setForm({ ...form, liveAlerts: e.target.checked })} /> Send Live Kirtan alerts to this person</label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}><button className="adm-btn primary" disabled={busy}>{busy ? 'Saving…' : 'Save details'}</button>{notice && <span style={{ color: 'var(--a-ok)', fontWeight: 700, fontSize: 13 }}>{notice}</span>}</div>
          <p className="adm-sub">Phone: {p.phone} · Language: {LANG[p.language] || '—'} · Orders: {p.stats.orders}</p>
        </form>
        <div className="adm-card">
          <div style={{ padding: '18px 20px 8px' }}><h2 className="adm-h2">Donation history</h2></div>
          <div className="adm-table-wrap"><table className="adm-table">
            <thead><tr><th>Receipt / ref</th><th>Date</th><th>Status</th><th className="adm-num">Amount</th><th /></tr></thead>
            <tbody>{p.donations.map((d: any) => (
              <tr key={d.id}><td>{d.receiptNumber || d.reference}{d.campaign && <div style={{ fontSize: 12, color: 'var(--a-muted)' }}>{d.campaign.title}</div>}</td><td>{fdatetime(d.paidAt || d.createdAt)}</td><td><StatusBadge status={d.status} /></td><td className="adm-num"><b>{inr(d.amount)}</b></td>
                <td>{d.status === 'PAID' && <button className="adm-btn sm" aria-label={`Download receipt ${d.receiptNumber || d.reference}`} onClick={() => downloadFile(`/api/admin/donations/${d.id}/receipt`, 'receipt.pdf').catch((e) => setError(e?.message || 'Download failed'))}><Download size={13} /></button>}</td></tr>
            ))}</tbody>
          </table>{!p.donations.length && <div className="adm-empty">No donations yet.</div>}</div>
        </div>
      </div>}
    </Drawer>
  );
}
