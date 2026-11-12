'use client';
import { useEffect, useState } from 'react';
import { Radio, Send, Plus, Trash2, Power, FlaskConical } from 'lucide-react';
import { api } from '../../lib/api';
import { Alert, Field, Kpi, StatusBadge, fdatetime } from './ui';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
const to12 = (hm: string) => { const [h, m] = hm.split(':').map(Number); return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`; };

export default function LiveAdmin() {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [s, setS] = useState({ url: '', title: '', enabled: true, windowHours: 3 });
  const [busy, setBusy] = useState('');
  const [testPhone, setTestPhone] = useState('');
  const [slot, setSlot] = useState<{ label: string; time: string; mode: 'daily' | 'days' | 'once'; days: number[]; onceDate: string }>({ label: 'Subah ka Kirtan', time: '09:00', mode: 'daily', days: ALL_DAYS, onceDate: '' });

  async function load(keepForm = true) {
    try {
      const r = await api<any>('/api/admin/live'); setData(r);
      if (!keepForm) setS({ url: r.settings.url, title: r.settings.title, enabled: r.settings.enabled, windowHours: r.settings.windowHours });
    } catch (e: any) { setError(e?.message || 'Live Kirtan settings could not be loaded.'); }
  }
  useEffect(() => { load(false); }, []);
  useEffect(() => { // keep the history fresh while an alert is being sent
    if (!data?.broadcasts?.some((b: any) => b.status === 'RUNNING')) return;
    const t = setInterval(() => load(), 3000); return () => clearInterval(t);
  }, [data]);

  const run = async (key: string, fn: () => Promise<string | void>) => {
    setBusy(key); setError(''); setNotice('');
    try { const msg = await fn(); if (msg) setNotice(msg); await load(); } catch (e: any) { setError(e?.message || 'Something went wrong.'); } finally { setBusy(''); }
  };

  const saveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (s.url.trim() && !/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(s.url.trim())) return setError('Paste a YouTube link (https://www.youtube.com/… or https://youtu.be/…).');
    if (s.title.trim().length < 2) return setError('Enter a title (at least 2 characters).');
    return run('save', async () => { await api('/api/admin/live/settings', { method: 'PUT', body: JSON.stringify({ ...s, url: s.url.trim(), windowHours: Number(s.windowHours) }) }); return 'Settings saved.'; });
  };
  const goLive = () => {
    if (!data?.settings.url) return setError('Save the YouTube live link first.');
    if (!confirm(`Send the live link to all subscribed customers now?\n\n${data.audience.reachable} customer(s) can receive it.`)) return;
    return run('live', async () => { await api('/api/admin/live/broadcast', { method: 'POST', body: JSON.stringify({ title: s.title }) }); return 'Alert is being sent. Progress shows in the history below.'; });
  };
  const addSlot = (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(slot.time)) return setError('Choose a valid time.');
    if (slot.mode === 'days' && !slot.days.length) return setError('Choose at least one day.');
    if (slot.mode === 'once' && !slot.onceDate) return setError('Choose the date for this one-time alert.');
    return run('slot', async () => {
      await api('/api/admin/live/schedules', { method: 'POST', body: JSON.stringify({ label: slot.label.trim() || s.title, time: slot.time, days: slot.mode === 'daily' ? ALL_DAYS : slot.mode === 'days' ? slot.days : [], onceDate: slot.mode === 'once' ? slot.onceDate : null }) });
      return 'Schedule added.';
    });
  };

  if (!data) return error ? <Alert kind="err">{error}</Alert> : <p className="adm-sub">Loading…</p>;
  const a = data.audience; const live = data.settings.isLiveNow;

  return (
    <div className="adm-grid" style={{ gap: 20 }}>
      {error && <Alert kind="err">{error}</Alert>}
      {notice && <Alert kind="ok">{notice}</Alert>}

      <div className="adm-card adm-card-pad" style={{ display: 'flex', flexWrap: 'wrap', gap: 16, alignItems: 'center', justifyContent: 'space-between', background: live ? 'linear-gradient(135deg,#fff,#fdecea)' : undefined }}>
        <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
          {live ? <span className="adm-live-dot" aria-hidden /> : <Radio size={22} color="var(--a-muted)" aria-hidden />}
          <div><h2 className="adm-h2" style={{ fontSize: 18 }}>{live ? 'Kirtan is marked LIVE' : 'Kirtan is not live right now'}</h2>
            <p className="adm-sub">{live ? `Customers who ask “live” on WhatsApp get the link until ${fdatetime(data.settings.liveUntil)}.` : 'Alerts go out automatically at your schedule times, or press “Go live now”.'}</p></div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button className="adm-btn gold" disabled={!!busy} onClick={goLive}><Send size={15} /> {busy === 'live' ? 'Sending…' : 'Go live now — alert everyone'}</button>
          {live && <button className="adm-btn" disabled={!!busy} onClick={() => run('end', async () => { await api('/api/admin/live/end', { method: 'POST' }); return 'Live status cleared.'; })}><Power size={15} /> End live</button>}
        </div>
      </div>

      <div className="adm-kpis">
        <Kpi label="Subscribers" value={a.subscribers} note="Chatted with the bot" />
        <Kpi label="Reachable now" value={a.reachable} note={a.templateConfigured ? 'Everyone (approved template)' : 'Messaged in last 24h'} hero />
        <Kpi label="Outside 24h window" value={a.outsideWindow} note={a.templateConfigured ? 'Sent via template' : 'Skipped without a template'} />
        <Kpi label="Opted out" value={a.optedOut} note="Replied STOP" />
      </div>
      {!a.whatsappLive && <Alert kind="warn">WhatsApp is in mock/test mode, so alerts are not actually sent.</Alert>}
      {a.whatsappLive && !a.templateConfigured && a.outsideWindow > 0 && (
        <Alert kind="warn">WhatsApp only allows free messages to people who wrote in the last 24 hours. {a.outsideWindow} subscriber(s) are outside that window and will be skipped. To reach everyone, get a “live kirtan” message template approved in Meta and set <code>WHATSAPP_LIVE_TEMPLATE_NAME</code> on the server (see the audit notes).</Alert>
      )}

      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', alignItems: 'start' }}>
        <form noValidate onSubmit={saveSettings} className="adm-card adm-card-pad adm-grid" style={{ gap: 14 }}>
          <div><h2 className="adm-h2">Live link & message</h2><p className="adm-sub">Paste the link of your YouTube live stream (or channel “/live” link). It is sent in every alert.</p></div>
          <Field label="YouTube live link"><input className="adm-in" value={s.url} onChange={(e) => setS({ ...s, url: e.target.value })} placeholder="https://www.youtube.com/watch?v=…" /></Field>
          <Field label="Alert title" hint="Shown in the WhatsApp message, e.g. “Subah ka Kirtan”."><input className="adm-in" maxLength={60} value={s.title} onChange={(e) => setS({ ...s, title: e.target.value })} /></Field>
          <Field label="Keep “live” status for (hours)" hint="While live, the bot's Live Kirtan option shows the link."><input className="adm-in" type="number" min={1} max={12} value={s.windowHours} onChange={(e) => setS({ ...s, windowHours: Number(e.target.value) })} /></Field>
          <label style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, fontWeight: 650 }}><input type="checkbox" checked={s.enabled} onChange={(e) => setS({ ...s, enabled: e.target.checked })} /> Live Kirtan alerts are ON (untick to pause all automatic alerts)</label>
          <div><button className="adm-btn primary" disabled={!!busy}>{busy === 'save' ? 'Saving…' : 'Save settings'}</button></div>
          <div style={{ borderTop: '1px solid var(--a-line)', paddingTop: 14 }}>
            <Field label="Send a test to one number first" hint="Check exactly what customers will receive."><div style={{ display: 'flex', gap: 8 }}><input className="adm-in" inputMode="numeric" placeholder="10-digit mobile" value={testPhone} onChange={(e) => setTestPhone(e.target.value)} />
              <button type="button" className="adm-btn" disabled={!!busy} onClick={() => run('test', async () => { const r = await api<any>('/api/admin/live/test', { method: 'POST', body: JSON.stringify({ phone: testPhone }) }); return r?.message; })}><FlaskConical size={15} /> Test</button></div></Field>
          </div>
        </form>

        <div className="adm-card adm-card-pad adm-grid" style={{ gap: 14 }}>
          <div><h2 className="adm-h2">Schedule (India time)</h2><p className="adm-sub">The alert goes out by itself at these times — change them any time (9 AM, 12 noon, night…).</p></div>
          {!data.schedules.length && <p className="adm-sub">No schedule yet. Add one below.</p>}
          {data.schedules.map((x: any) => (
            <div key={x.id} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', border: '1px solid var(--a-line)', borderRadius: 14, opacity: x.active ? 1 : .55 }}>
              <div><b style={{ fontFamily: 'var(--a-display)', fontSize: 20 }}>{to12(x.time)}</b> <span style={{ fontWeight: 700 }}>{x.label}</span>
                <div className="adm-sub">{x.summary}{x.active && x.next ? ` · next: ${x.next.ymd} ${to12(x.next.time)}` : ''}</div></div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="adm-btn sm" disabled={!!busy} aria-label={x.active ? `Pause ${x.label}` : `Resume ${x.label}`} onClick={() => run('t' + x.id, async () => { await api(`/api/admin/live/schedules/${x.id}`, { method: 'PATCH', body: JSON.stringify({ active: !x.active }) }); })}>{x.active ? 'Pause' : 'Resume'}</button>
                <button className="adm-btn sm danger" disabled={!!busy} aria-label={`Delete ${x.label}`} onClick={() => confirm('Delete this schedule?') && run('d' + x.id, async () => { await api(`/api/admin/live/schedules/${x.id}`, { method: 'DELETE' }); })}><Trash2 size={13} /></button>
              </div>
            </div>
          ))}
          <form noValidate onSubmit={addSlot} className="adm-grid" style={{ gap: 12, borderTop: '1px solid var(--a-line)', paddingTop: 14 }}>
            <b style={{ fontSize: 13 }}>Add a time</b>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 140px', gap: 10 }}>
              <Field label="Name"><input className="adm-in" value={slot.label} maxLength={40} onChange={(e) => setSlot({ ...slot, label: e.target.value })} /></Field>
              <Field label="Time"><input type="time" className="adm-in" value={slot.time} onChange={(e) => setSlot({ ...slot, time: e.target.value })} /></Field>
            </div>
            <div className="adm-tabs" role="group" aria-label="Repeat">
              {([['daily', 'Every day'], ['days', 'Selected days'], ['once', 'One time']] as const).map(([k, l]) => <button type="button" key={k} aria-pressed={slot.mode === k} onClick={() => setSlot({ ...slot, mode: k })}>{l}</button>)}
            </div>
            {slot.mode === 'days' && <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>{DAYS.map((d, i) => <button type="button" key={d} className={`adm-btn sm${slot.days.includes(i) ? ' primary' : ''}`} aria-pressed={slot.days.includes(i)} onClick={() => setSlot({ ...slot, days: slot.days.includes(i) ? slot.days.filter((x) => x !== i) : [...slot.days, i].sort() })}>{d}</button>)}</div>}
            {slot.mode === 'once' && <Field label="Date"><input type="date" className="adm-in" value={slot.onceDate} onChange={(e) => setSlot({ ...slot, onceDate: e.target.value })} /></Field>}
            <div><button className="adm-btn" disabled={!!busy}><Plus size={14} /> Add schedule</button></div>
          </form>
        </div>
      </div>

      <div className="adm-card">
        <div style={{ padding: '20px 22px 8px' }}><h2 className="adm-h2">Alert history</h2></div>
        <div className="adm-table-wrap"><table className="adm-table">
          <thead><tr><th>When</th><th>Type</th><th>Title</th><th>Status</th><th className="adm-num">Sent</th><th className="adm-num">Skipped</th><th className="adm-num">Failed</th></tr></thead>
          <tbody>{data.broadcasts.map((b: any) => (
            <tr key={b.id}><td>{fdatetime(b.createdAt)}</td><td>{b.trigger === 'SCHEDULE' ? 'Scheduled' : b.trigger === 'TEST' ? 'Test' : 'Manual'}</td><td>{b.title}{b.error && <div style={{ color: 'var(--a-bad)', fontSize: 12 }}>{b.error}</div>}</td><td><StatusBadge status={b.status} /></td><td className="adm-num">{b.sent}/{b.total}</td><td className="adm-num">{b.skipped}</td><td className="adm-num">{b.failed}</td></tr>
          ))}</tbody>
        </table>{!data.broadcasts.length && <div className="adm-empty">No alerts sent yet.</div>}</div>
      </div>
    </div>
  );
}
