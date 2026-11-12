'use client';
import { useMemo, useState } from 'react';
import { Download, Send, Search } from 'lucide-react';
import { api, downloadFile } from '../../lib/api';
import { Alert, StatusBadge, fdatetime, inr } from './ui';

export default function DonationsAdmin({ donations, reload }: { donations: any[]; reload: () => void }) {
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('ALL');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const rows = useMemo(() => {
    const s = q.trim().toLowerCase();
    return donations.filter((d) => (status === 'ALL' || d.paymentStatus === status) && (!s || [d.reference, d.receiptNumber, d.user?.name, d.user?.phone, d.campaign?.title].some((v) => String(v || '').toLowerCase().includes(s))));
  }, [donations, q, status]);

  async function download(d: any) {
    setBusy(`dl${d.id}`); setNotice(null);
    try { await downloadFile(`/api/admin/donations/${d.id}/receipt`, `${(d.receiptNumber || d.reference).replace(/\//g, '-')}.pdf`); }
    catch (e: any) { setNotice({ kind: 'err', text: e?.message || 'The receipt could not be downloaded.' }); } finally { setBusy(''); }
  }
  async function resend(d: any) {
    setBusy(`rs${d.id}`); setNotice(null);
    try { const r = await api<any>(`/api/admin/donations/${d.id}/resend-receipt`, { method: 'POST' }); setNotice({ kind: 'ok', text: r?.message || 'Receipt sent on WhatsApp.' }); reload(); }
    catch (e: any) { setNotice({ kind: 'err', text: e?.message || 'The receipt could not be sent.' }); } finally { setBusy(''); }
  }

  return (
    <div className="adm-card">
      <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
        <div style={{ position: 'relative', flex: '1 1 240px' }}>
          <Search size={15} style={{ position: 'absolute', left: 12, top: 13, color: 'var(--a-muted)' }} />
          <input className="adm-in" style={{ paddingLeft: 36 }} placeholder="Search name, phone, receipt number…" aria-label="Search donations" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        <select className="adm-in" style={{ width: 'auto' }} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="ALL">All statuses</option><option value="PAID">Paid</option><option value="PENDING">Pending</option><option value="FAILED">Failed</option>
        </select>
      </div>
      {notice && <div style={{ padding: '0 20px 14px' }}><Alert kind={notice.kind}>{notice.text}</Alert></div>}
      <div className="adm-table-wrap">
        <table className="adm-table">
          <thead><tr><th>Donor</th><th>Receipt no.</th><th>Campaign</th><th>Date</th><th>Status</th><th className="adm-num">Amount</th><th>Receipt</th></tr></thead>
          <tbody>
            {rows.map((d) => (
              <tr key={d.id}>
                <td><b>{d.user?.name || '—'}</b><div style={{ color: 'var(--a-muted)', fontSize: 12 }}>{d.user?.phone}</div></td>
                <td>{d.receiptNumber || <span style={{ color: 'var(--a-muted)' }}>{d.reference}</span>}</td>
                <td>{d.campaign?.title || 'General'}</td>
                <td>{fdatetime(d.paidAt || d.createdAt)}</td>
                <td><StatusBadge status={d.paymentStatus} /></td>
                <td className="adm-num"><b>{inr(d.amount)}</b></td>
                <td>{d.paymentStatus === 'PAID' ? (
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="adm-btn sm" disabled={busy === `dl${d.id}`} onClick={() => download(d)} aria-label={`Download receipt ${d.receiptNumber || d.reference}`}><Download size={13} /> PDF</button>
                    <button className="adm-btn sm" disabled={busy === `rs${d.id}`} onClick={() => resend(d)} aria-label={`Resend receipt on WhatsApp to ${d.user?.phone}`}><Send size={13} /> {busy === `rs${d.id}` ? 'Sending…' : 'Resend'}</button>
                  </div>
                ) : <span style={{ color: 'var(--a-muted)', fontSize: 12 }}>After payment</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {!rows.length && <div className="adm-empty">{donations.length ? 'No donation matches your search.' : 'No donations yet.'}</div>}
      </div>
    </div>
  );
}
