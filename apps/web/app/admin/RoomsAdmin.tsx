'use client';
import { useCallback, useEffect, useState } from 'react';
import { Phone } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, Field, StatusBadge, fdatetime } from './ui';

type Booking = { id: string; reference: string; name: string; phone: string; guests: number; nights: number; checkIn: string; status: string; adminNote: string | null; createdAt: string };
const STATUSES = ['PENDING', 'CONFIRMED', 'REJECTED', 'CANCELLED'];
const phoneLabel = (p: string) => (p.length === 12 && p.startsWith('91') ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : p);

/** Room booking REQUESTS from the WhatsApp bot. A request is only confirmed after the team calls the guest. */
export default function RoomsAdmin({ onChange }: { onChange?: () => void } = {}) {
  const [rows, setRows] = useState<Booking[] | null>(null);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [infoMsg, setInfoMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [filter, setFilter] = useState('PENDING');
  const [busy, setBusy] = useState('');

  const load = useCallback(async () => {
    try { setRows((await api<Booking[]>('/api/admin/room-bookings')) ?? []); setError(''); } catch (e: any) { setError(e?.message || 'The requests could not be loaded.'); }
  }, []);
  useEffect(() => { load(); api<{ info: string }>('/api/admin/settings/rooms').then((r) => setInfo(r?.info || '')).catch(() => undefined); }, [load]);

  async function update(b: Booking, patch: { status?: string; adminNote?: string }) {
    setBusy(b.id); setError('');
    try { await api(`/api/admin/room-bookings/${b.id}`, { method: 'PATCH', body: JSON.stringify(patch) }); await load(); onChange?.(); }
    catch (e: any) { setError(e?.message || 'Could not update the request.'); } finally { setBusy(''); }
  }
  async function saveInfo(e: React.FormEvent) {
    e.preventDefault(); setInfoMsg(null);
    try {
      await api('/api/admin/settings/rooms', { method: 'PUT', body: JSON.stringify({ info }) });
      setInfoMsg({ kind: 'ok', text: info.trim() ? 'Saved. This message is now shown when a customer taps “Room Booking”.' : 'Cleared. The standard message will be shown.' });
    } catch (err: any) { setInfoMsg({ kind: 'err', text: err?.message || 'Could not save.' }); }
  }

  const shown = (rows ?? []).filter((b) => filter === 'ALL' || b.status === filter);
  const pending = (rows ?? []).filter((b) => b.status === 'PENDING').length;

  return (
    <div className="adm-grid" style={{ gap: 18 }}>
      <form onSubmit={saveInfo} className="adm-card adm-card-pad" noValidate>
        <h2 className="adm-h2">Message shown for “Room Booking”</h2>
        <p className="adm-sub" style={{ margin: '6px 0 14px' }}>Write the rooms, rates, check-in time and rules in your own words (up to 900 characters). Customers then tap “Request booking” and send name, date, guests and nights. Leave empty to use the standard message.</p>
        <Field label="Room information" hint={`${info.length}/900`}><textarea className="adm-in" style={{ minHeight: 120 }} maxLength={900} value={info} onChange={(e) => setInfo(e.target.value)} placeholder="e.g. Dharamshala rooms are available for devotees. Check-in 12 noon, check-out 11 am. Contribution per room per night: …" /></Field>
        <div style={{ marginTop: 12 }}><button className="adm-btn primary">Save message</button></div>
        {infoMsg && <div style={{ marginTop: 12 }}><Alert kind={infoMsg.kind}>{infoMsg.text}</Alert></div>}
      </form>

      <div className="adm-card">
        <div style={{ padding: 20, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div><h2 className="adm-h2">Booking requests</h2><p className="adm-sub">{pending} waiting for your call. Call the guest, then mark the request Confirmed or Rejected.</p></div>
          <select className="adm-in" style={{ width: 'auto' }} aria-label="Filter" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="PENDING">Pending</option><option value="CONFIRMED">Confirmed</option><option value="REJECTED">Rejected</option><option value="CANCELLED">Cancelled</option><option value="ALL">All</option>
          </select>
        </div>
        {error && <div style={{ padding: '0 20px 14px' }}><Alert kind="err">{error}</Alert></div>}
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Guest</th><th>Check-in</th><th>Guests</th><th>Nights</th><th>Requested</th><th>Status</th><th>Your note</th></tr></thead>
            <tbody>
              {shown.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.name}</b><div style={{ fontSize: 12 }}><a href={`tel:+${b.phone}`} style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}><Phone size={11} />{phoneLabel(b.phone)}</a></div><div style={{ color: 'var(--a-muted)', fontSize: 11 }}>{b.reference}</div></td>
                  <td>{b.checkIn}</td><td>{b.guests}</td><td>{b.nights}</td><td>{fdatetime(b.createdAt)}</td>
                  <td>
                    <select className="adm-in" style={{ width: 'auto', padding: '6px 8px' }} value={b.status} disabled={busy === b.id} onChange={(e) => update(b, { status: e.target.value })} aria-label={`Status of ${b.reference}`}>
                      {STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
                    </select>
                    <div style={{ marginTop: 4 }}><StatusBadge status={b.status} /></div>
                  </td>
                  <td><input className="adm-in" style={{ minWidth: 150 }} defaultValue={b.adminNote || ''} maxLength={500} placeholder="e.g. Room 3 for 2 nights" aria-label={`Note for ${b.reference}`} onBlur={(e) => { if (e.target.value !== (b.adminNote || '')) update(b, { adminNote: e.target.value }); }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {rows && !shown.length && <div className="adm-empty">{filter === 'PENDING' ? 'No pending requests. 🙏' : 'No requests here.'}</div>}
        </div>
      </div>
    </div>
  );
}
