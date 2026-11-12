'use client';
import { useEffect, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export const inr = (n: number | null | undefined) => `₹${Math.round(Number(n) || 0).toLocaleString('en-IN')}`;
export const fdate = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—');
export const fdatetime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '—');

const TONE: Record<string, string> = { PAID: 'ok', ACTIVE: 'ok', DONE: 'ok', PENDING: 'warn', PAUSED: 'warn', UPCOMING: 'info', RUNNING: 'info', FAILED: 'bad', EXPIRED: 'bad', CANCELLED: 'bad', ENDED: '', COMPLETED: 'gold' };
export function StatusBadge({ status }: { status: string }) {
  const label = status.charAt(0) + status.slice(1).toLowerCase();
  return <span className={`adm-badge ${TONE[status] ?? ''}`}>{label}</span>;
}

export function Kpi({ label, value, note, hero }: { label: string; value: ReactNode; note?: ReactNode; hero?: boolean }) {
  return (
    <div className={`adm-kpi${hero ? ' hero' : ''}`}>
      <div className="adm-kpi-label">{label}</div>
      <div className="adm-kpi-value">{value}</div>
      {note !== undefined && <div className="adm-kpi-note">{note}</div>}
    </div>
  );
}

export function Progress({ percent, label }: { percent: number; label?: string }) {
  const p = Math.max(0, Math.min(100, Math.round(percent || 0)));
  return <div className={`adm-bar${p >= 100 ? ' done' : ''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p} aria-label={label || 'Progress'}><i style={{ width: `${p}%` }} /></div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return <label className="adm-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

export function Alert({ kind, children }: { kind: 'err' | 'ok' | 'warn'; children: ReactNode }) {
  return <div role={kind === 'err' ? 'alert' : 'status'} className={`adm-alert ${kind}`}>{children}</div>;
}

export function Drawer({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey); return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return (
    <div className="adm-drawer-back" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="adm-drawer" role="dialog" aria-modal="true" aria-label={title}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18 }}>
          <h2 className="adm-h2" style={{ fontSize: 20 }}>{title}</h2>
          <button className="adm-btn sm" onClick={onClose} aria-label="Close"><X size={15} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export type Point = { key: string; total: number; count: number };

/** Dependency-free SVG bar chart (accessible: every bar carries its value as a text alternative). */
export function BarChart({ points, label, height = 190, format = (k: string) => k }: { points: Point[]; label: string; height?: number; format?: (key: string) => string }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...points.map((p) => p.total));
  const W = 640, H = height, padL = 6, padB = 26, padT = 10;
  const bw = (W - padL) / Math.max(1, points.length);
  const empty = points.every((p) => p.total === 0);
  const step = points.length > 14 ? Math.ceil(points.length / 7) : 1;
  const hv = hover !== null ? points[hover] : null;
  return (
    <div>
      <div style={{ minHeight: 22, fontSize: 12, color: 'var(--a-muted)', fontWeight: 700 }} aria-live="polite">
        {hv ? <><b style={{ color: 'var(--a-ink)' }}>{inr(hv.total)}</b> · {hv.count} donation{hv.count === 1 ? '' : 's'} · {format(hv.key)}</> : empty ? 'No paid donations in this period yet.' : 'Hover a bar for details'}
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={0} x2={W} y1={padT + (H - padT - padB) * (1 - g)} y2={padT + (H - padT - padB) * (1 - g)} stroke="rgba(20,33,27,.07)" />)}
        {points.map((p, i) => {
          const h = Math.max(p.total > 0 ? 3 : 0, ((H - padT - padB) * p.total) / max);
          const x = padL + i * bw + bw * 0.16; const y = H - padB - h;
          return (
            <g key={p.key} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} tabIndex={0} aria-label={`${format(p.key)}: ${inr(p.total)}, ${p.count} donations`}>
              <rect x={padL + i * bw} y={0} width={bw} height={H - padB} fill="transparent" />
              <rect x={x} y={y} width={bw * 0.68} height={h} rx={4} fill={hover === i ? '#c8953a' : '#17533c'} opacity={p.total === 0 ? 0.15 : 1} />
              {i % step === 0 && <text x={x + bw * 0.34} y={H - 8} textAnchor="middle" fontSize="10.5" fill="#66736c">{format(p.key)}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

export const monthLabel = (k: string) => { const [y, m] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'short', year: '2-digit', timeZone: 'UTC' }); };
export const dayLabel = (k: string) => { const [y, m, d] = k.split('-').map(Number); return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }); };
