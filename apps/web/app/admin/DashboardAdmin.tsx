'use client';
import { useEffect, useState } from 'react';
import { TrendingUp, TrendingDown, Download, RefreshCw } from 'lucide-react';
import { api, downloadFile } from '../../lib/api';
import { Alert, BarChart, Kpi, Progress, StatusBadge, dayLabel, fdatetime, inr, monthLabel } from './ui';

type Range = 'daily' | 'monthly' | 'yearly';

export default function DashboardAdmin({ extra }: { extra?: { orders?: number; customers?: number; revenue?: number } }) {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState('');
  const [range, setRange] = useState<Range>('daily');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    setError('');
    try { setD(await api('/api/admin/reports/dashboard')); } catch (e: any) { setError(e?.message || 'The dashboard could not be loaded.'); }
  }
  useEffect(() => { load(); }, []);

  async function report() {
    setBusy(true); setError('');
    try {
      const q = new URLSearchParams(); if (from) q.set('from', from); if (to) q.set('to', to);
      await downloadFile(`/api/admin/reports/donations.csv?${q}`, 'donations-report.csv');
    } catch (e: any) { setError(e?.message || 'The report could not be downloaded.'); } finally { setBusy(false); }
  }

  if (!d) return error ? <Alert kind="err">{error} <button className="adm-btn sm" onClick={load}>Try again</button></Alert> : <p className="adm-sub">Loading dashboard…</p>;
  const t = d.totals; const g = t.monthGrowthPercent;
  const series = range === 'daily' ? d.daily : range === 'monthly' ? d.monthly : d.yearly;
  const fmt = range === 'daily' ? dayLabel : range === 'monthly' ? monthLabel : (k: string) => k;

  return (
    <div className="adm-grid" style={{ gap: 20 }}>
      {error && <Alert kind="err">{error}</Alert>}
      <div className="adm-kpis">
        <Kpi hero label="Total collected" value={inr(t.allTime.total)} note={`${t.allTime.count} donations · ${t.allTime.donors} donors`} />
        <Kpi label="Today" value={inr(t.today.total)} note={`${t.today.count} donation${t.today.count === 1 ? '' : 's'}`} />
        <Kpi label="This month" value={inr(t.month.total)} note={g === null ? 'No data for last month' : <span style={{ color: g >= 0 ? 'var(--a-ok)' : 'var(--a-bad)', display: 'inline-flex', gap: 4, alignItems: 'center', fontWeight: 800 }}>{g >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{g >= 0 ? '+' : ''}{g}% vs last month</span>} />
        <Kpi label="This year" value={inr(t.year.total)} note={`Financial year: ${inr(t.financialYear.total)}`} />
        <Kpi label="Average donation" value={inr(t.allTime.average)} note={`${t.failed} failed attempts`} />
        <Kpi label="Awaiting payment" value={inr(t.pending.total)} note={`${t.pending.count} pending (last 3 days)`} />
      </div>

      <div className="adm-card adm-card-pad">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
          <div><h2 className="adm-h2">Donation trend</h2><p className="adm-sub">Only verified (paid) donations, in Indian time.</p></div>
          <div className="adm-tabs" role="group" aria-label="Chart period">
            {(['daily', 'monthly', 'yearly'] as Range[]).map((r) => <button key={r} aria-pressed={range === r} onClick={() => setRange(r)}>{r === 'daily' ? '30 days' : r === 'monthly' ? '12 months' : 'Yearly'}</button>)}
          </div>
        </div>
        <BarChart points={series} label={`Donations, ${range}`} format={fmt} />
      </div>

      <div className="adm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))' }}>
        <div className="adm-card adm-card-pad">
          <h2 className="adm-h2">Top campaigns</h2>
          {!d.topCampaigns.length ? <p className="adm-sub" style={{ marginTop: 14 }}>Campaign donations will appear here.</p> : (
            <div style={{ display: 'grid', gap: 16, marginTop: 16 }}>
              {d.topCampaigns.map((c: any) => (
                <div key={c.id}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13.5, fontWeight: 700, marginBottom: 7 }}><span>{c.title}</span><span>{inr(c.raised)}{c.target ? ` / ${inr(c.target)}` : ''}</span></div>
                  <Progress percent={c.target ? (c.raised / c.target) * 100 : 0} label={c.title} />
                </div>
              ))}
            </div>
          )}
          {extra && <p className="adm-sub" style={{ marginTop: 20, paddingTop: 14, borderTop: '1px solid var(--a-line)' }}>Shop: {extra.orders ?? 0} orders · {inr(extra.revenue)} revenue · {extra.customers ?? 0} customers</p>}
        </div>

        <div className="adm-card adm-card-pad">
          <h2 className="adm-h2">Donation report</h2>
          <p className="adm-sub">Download an Excel-ready CSV. Leave the dates empty to export everything.</p>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginTop: 14 }}>
            <label className="adm-field"><span>From</span><input type="date" className="adm-in" value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="adm-field"><span>To</span><input type="date" className="adm-in" value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <button className="adm-btn primary" style={{ marginTop: 16 }} disabled={busy} onClick={report}><Download size={15} />{busy ? 'Preparing…' : 'Download report (CSV)'}</button>
        </div>
      </div>

      <div className="adm-card">
        <div style={{ padding: '20px 22px 8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h2 className="adm-h2">Recent donations</h2>
          <button className="adm-btn sm" onClick={load}><RefreshCw size={13} /> Refresh</button>
        </div>
        <div className="adm-table-wrap">
          <table className="adm-table">
            <thead><tr><th>Donor</th><th>Receipt / reference</th><th>Campaign</th><th>When</th><th>Status</th><th className="adm-num">Amount</th></tr></thead>
            <tbody>
              {d.recent.map((r: any) => (
                <tr key={r.id}><td><b>{r.donor || '—'}</b></td><td>{r.receiptNumber || r.reference}</td><td>{r.campaign || '—'}</td><td>{fdatetime(r.paidAt || r.createdAt)}</td><td><StatusBadge status={r.status} /></td><td className="adm-num"><b>{inr(r.amount)}</b></td></tr>
              ))}
            </tbody>
          </table>
          {!d.recent.length && <div className="adm-empty">No donations yet.</div>}
        </div>
      </div>
    </div>
  );
}
