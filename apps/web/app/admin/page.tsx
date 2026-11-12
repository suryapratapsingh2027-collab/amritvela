'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Package, HeartHandshake, Users, MessageCircle, BookOpen, LogOut, Truck, Images, CalendarDays, UserCog, Landmark, FileText, Share2, Megaphone, Radio, Contact,
} from 'lucide-react';
import './admin.css';
import { api, ApiError } from '../../lib/api';
import ProductsAdmin from './ProductsAdmin';
import SupportInbox from './SupportInbox';
import AccountSettings from './AccountSettings';
import DocumentsAdmin from './DocumentsAdmin';
import TrustsAdmin from './TrustsAdmin';
import SocialAdmin from './SocialAdmin';
import DashboardAdmin from './DashboardAdmin';
import DonationsAdmin from './DonationsAdmin';
import DonorsAdmin from './DonorsAdmin';
import CampaignsAdmin from './CampaignsAdmin';
import LiveAdmin from './LiveAdmin';
import { GalleryAdmin, KnowledgeAdmin, PosterAdmin } from './ContentAdmin';

type NavItem = [key: string, label: string, Icon: LucideIcon];

const groups: { title: string; items: NavItem[] }[] = [
  { title: 'Overview', items: [['overview', 'Dashboard', LayoutDashboard]] },
  { title: 'Donations', items: [['donations', 'Donations', HeartHandshake], ['donors', 'Donors', Contact], ['campaigns', 'Campaigns', Megaphone], ['live', 'Live Kirtan', Radio]] },
  { title: 'Shop', items: [['products', 'Products', Package], ['orders', 'Orders', Truck], ['customers', 'Customers', Users]] },
  { title: 'WhatsApp & content', items: [['conversations', 'Support', MessageCircle], ['trusts', 'Trusts', Landmark], ['documents', 'Documents (PDF)', FileText], ['social', 'Social Links', Share2], ['knowledge', 'AI Knowledge', BookOpen], ['gallery', 'Gallery', Images], ['posters', 'Event Posters', CalendarDays]] },
  { title: 'Settings', items: [['account', 'Account', UserCog]] },
];
const nav: NavItem[] = groups.flatMap((g) => g.items);

export default function Admin() {
  const router = useRouter();
  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState<any>();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [donations, setDonations] = useState<any[]>([]);
  const [customers, setCustomers] = useState<any[]>([]);
  const [knowledge, setKnowledge] = useState<any[]>([]);
  const [gallery, setGallery] = useState<any[]>([]);
  const [posters, setPosters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [shipping, setShipping] = useState('');

  async function load() {
    try {
      const [s, p, o, d, c, k, g, ep] = await Promise.all([
        api('/api/admin/stats'), api<any[]>('/api/admin/products'), api<any[]>('/api/admin/orders'), api<any[]>('/api/admin/donations'),
        api<any[]>('/api/admin/customers'), api<any[]>('/api/admin/knowledge'), api<any[]>('/api/admin/gallery'), api<any[]>('/api/admin/posters'),
      ]);
      setStats(s ?? {}); setProducts(p ?? []); setOrders(o ?? []); setDonations(d ?? []); setCustomers(c ?? []); setKnowledge(k ?? []); setGallery(g ?? []); setPosters(ep ?? []);
    } catch (e: any) {
      if (e instanceof ApiError && e.status === 401) { localStorage.removeItem('trust_token'); router.replace('/login'); }
      else setLoadError(e?.message || 'The data could not be loaded. Check your internet connection and refresh the page.');
    } finally { setLoading(false); }
  }

  useEffect(() => { if (!localStorage.getItem('trust_token')) router.replace('/login'); else load(); }, []);

  async function ship(id: string) {
    if (shipping) return;
    setShipping(id);
    try { await api(`/api/admin/orders/${id}/ship`, { method: 'POST' }); await load(); }
    catch (e: any) { alert(e.message); await load(); }
    finally { setShipping(''); }
  }

  if (loading) return <main className="adm grid min-h-screen place-items-center">Loading admin…</main>;

  const pending = stats?.pendingPayments || 0;
  return (
    <main className="adm">
      <aside className="adm-side" aria-label="Admin navigation">
        <div className="adm-brand"><div className="adm-logo" aria-hidden>अ</div><div><b>AMRIT VELA</b><small>TRUST</small></div></div>
        <nav className="adm-nav">
          {groups.map((g) => (
            <div key={g.title}>
              <div className="adm-group">{g.title}</div>
              {g.items.map(([key, label, Icon]) => (
                <button key={key} className="adm-link" aria-current={tab === key ? 'page' : undefined} onClick={() => setTab(key)}>
                  <Icon size={17} />{label}{key === 'donations' && pending > 0 && <span className="count">{pending}</span>}
                </button>
              ))}
            </div>
          ))}
        </nav>
        <div className="adm-foot"><button className="adm-link" onClick={() => { localStorage.removeItem('trust_token'); router.push('/login'); }}><LogOut size={17} /> Sign out</button></div>
      </aside>

      <section className="adm-main">
        <header className="adm-top">
          <div className="adm-top-row">
            <div>
              <div className="adm-eyebrow">Trust Admin Console</div>
              <h1 className="adm-title">{nav.find((n) => n[0] === tab)?.[1]}</h1>
            </div>
            <span className={`adm-badge ${pending ? 'warn' : 'ok'}`}>{pending} pending payment{pending === 1 ? '' : 's'}</span>
          </div>
          {/* phones and tablets: the sidebar is hidden, so show the menu as a dropdown */}
          <select className="adm-in lg:hidden" aria-label="Section" value={tab} onChange={(e) => setTab(e.target.value)}>{groups.map((g) => <optgroup key={g.title} label={g.title}>{g.items.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</optgroup>)}</select>
        </header>

        <div className="adm-content">
          {loadError && <div role="alert" className="adm-alert err" style={{ marginBottom: 18 }}>{loadError} <button className="adm-btn sm" onClick={() => { setLoadError(''); load(); }}>Try again</button></div>}

          {tab === 'overview' && <DashboardAdmin extra={{ orders: stats?.orders, customers: stats?.customers, revenue: stats?.revenue }} />}

          {tab === 'products' && <ProductsAdmin products={products} reload={load} />}

          {tab === 'orders' && <div className="space-y-3">
            {!orders.length && <p className="text-sm text-neutral-400">No orders yet.</p>}
            {orders.map((o) => (
              <div key={o.id} className="rounded-3xl border bg-white p-5">
                <div className="flex flex-col justify-between gap-3 md:flex-row">
                  <div><b>{o.orderNumber}</b><div className="mt-1 text-sm text-neutral-500">{o.user?.name || o.user?.phone} · ₹{o.total}</div></div>
                  <div className="flex flex-wrap gap-2 text-xs font-bold">
                    <span className="rounded-full bg-neutral-100 px-3 py-2">{o.paymentStatus}</span>
                    <span className="rounded-full bg-neutral-100 px-3 py-2">{o.status}</span>
                    {o.paymentStatus === 'PAID' && o.status !== 'SHIPPED' && o.status !== 'DELIVERED' && <button className="btn btn-dark py-2" disabled={shipping === o.id} onClick={() => ship(o.id)}>{shipping === o.id ? 'Creating…' : 'Create shipment'}</button>}
                  </div>
                </div>
                <div className="mt-4 text-sm text-neutral-600">{o.items.map((i: any) => <div key={i.id}>{i.product.name} × {i.quantity}</div>)}</div>
                {o.awb && <div className="mt-3 text-sm">AWB: <b>{o.awb}</b> · {o.courier}</div>}
              </div>
            ))}
          </div>}

          {tab === 'donations' && <DonationsAdmin donations={donations} reload={load} />}
          {tab === 'donors' && <DonorsAdmin />}
          {tab === 'campaigns' && <CampaignsAdmin />}
          {tab === 'live' && <LiveAdmin />}

          {tab === 'customers' && <div className="overflow-x-auto rounded-3xl border bg-white">
            <table className="w-full text-left text-sm">
              <thead className="border-b bg-neutral-50"><tr><th className="p-4">Customer</th><th>Phone</th><th>Language</th><th>Orders</th><th>Donations</th><th>Conversations</th></tr></thead>
              <tbody>{customers.map((c) => (
                <tr className="border-b last:border-0" key={c.id}><td className="p-4 font-semibold">{c.name || '—'}</td><td>{c.phone}</td><td>{({ en: 'English', hi: 'Hindi', hing: 'Hinglish', pa: 'Punjabi' } as any)[c.language] || '—'}</td><td>{c._count.orders}</td><td>{c._count.donations}</td><td>{c._count.conversations}</td></tr>
              ))}</tbody>
            </table>
          </div>}

          {tab === 'conversations' && <SupportInbox />}
          {tab === 'trusts' && <TrustsAdmin />}
          {tab === 'documents' && <DocumentsAdmin />}
          {tab === 'social' && <SocialAdmin />}
          {tab === 'knowledge' && <KnowledgeAdmin docs={knowledge} reload={load} />}
          {tab === 'gallery' && <GalleryAdmin images={gallery} reload={load} />}
          {tab === 'posters' && <PosterAdmin posters={posters} reload={load} />}
          {tab === 'account' && <AccountSettings />}
        </div>
      </section>
    </main>
  );
}
