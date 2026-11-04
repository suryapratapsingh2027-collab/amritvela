'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react';
import {
  LayoutDashboard, Package, HeartHandshake, Users, MessageCircle, BookOpen, LogOut, Truck, Images, CalendarDays, UserCog, Landmark, FileText, Share2,
} from 'lucide-react';
import { api, ApiError } from '../../lib/api';
import ProductsAdmin from './ProductsAdmin';
import SupportInbox from './SupportInbox';
import AccountSettings from './AccountSettings';
import DocumentsAdmin from './DocumentsAdmin';
import TrustsAdmin from './TrustsAdmin';
import SocialAdmin from './SocialAdmin';
import { GalleryAdmin, KnowledgeAdmin, PosterAdmin } from './ContentAdmin';

type NavItem = [key: string, label: string, Icon: LucideIcon];

const nav: NavItem[] = [
  ['overview', 'Overview', LayoutDashboard], ['products', 'Products', Package], ['orders', 'Orders', Truck], ['donations', 'Donations', HeartHandshake],
  ['customers', 'Customers', Users], ['conversations', 'Support', MessageCircle], ['trusts', 'Trusts', Landmark], ['documents', 'Documents (PDF)', FileText],
  ['social', 'Social Links', Share2], ['knowledge', 'AI Knowledge', BookOpen], ['gallery', 'Gallery', Images], ['posters', 'Event Posters', CalendarDays], ['account', 'Account', UserCog],
];

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

  if (loading) return <main className="grid min-h-screen place-items-center">Loading admin…</main>;

  return (
    <main className="min-h-screen bg-[#f5f5f2]">
      <aside className="fixed hidden h-screen w-64 overflow-y-auto border-r bg-white p-5 pb-20 lg:block">
        <div className="px-3 py-4 font-extrabold">AMRIT VELA <span className="text-neutral-400">TRUST</span></div>
        <div className="mt-5 space-y-1">
          {nav.map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm font-semibold ${tab === key ? 'bg-black text-white' : 'hover:bg-neutral-100'}`}><Icon size={17} />{label}</button>
          ))}
        </div>
        <button onClick={() => { localStorage.removeItem('trust_token'); router.push('/login'); }} className="fixed bottom-5 left-5 flex items-center gap-3 px-3 text-sm text-neutral-500"><LogOut size={17} /> Sign out</button>
      </aside>

      <section className="lg:ml-64">
        <header className="sticky top-0 z-10 border-b bg-[#f5f5f2]/90 px-5 py-4 backdrop-blur md:px-8">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Trust Admin Console</div>
              <h1 className="mt-1 text-2xl font-extrabold">{nav.find((n) => n[0] === tab)?.[1]}</h1>
            </div>
            <span className="rounded-full bg-black px-4 py-2 text-xs font-bold text-white">{stats?.pendingPayments || 0} pending payments</span>
          </div>
          {/* phones and tablets: the sidebar is hidden, so show the menu as a dropdown */}
          <select className="input mt-3 lg:hidden" aria-label="Section" value={tab} onChange={(e) => setTab(e.target.value)}>{nav.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
        </header>

        <div className="p-5 md:p-8">
          {loadError && <div role="alert" className="mb-5 rounded-2xl bg-red-50 p-4 text-sm text-red-700">{loadError} <button className="font-bold underline" onClick={() => { setLoadError(''); load(); }}>Try again</button></div>}

          {tab === 'overview' && <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
              {[['Orders', stats?.orders ?? 0], ['Donations', stats?.donations ?? 0], ['Customers', stats?.customers ?? 0], ['Revenue', `₹${stats?.revenue ?? 0}`], ['Donated', `₹${stats?.donationTotal ?? 0}`]].map(([t, v]: any) => (
                <div key={t} className="rounded-3xl border bg-white p-6"><div className="mt-3 text-3xl font-extrabold">{v}</div><div className="mt-1 text-sm text-neutral-500">{t}</div></div>
              ))}
            </div>
            <div className="mt-6 grid gap-4 md:grid-cols-2">
              <div className="rounded-3xl border bg-white p-6">
                <h2 className="font-bold">What you can manage here</h2>
                <div className="mt-5 space-y-3">
                  {['Products, stock and photos (website + WhatsApp)', 'Orders, shipments and donations', 'Support chats (WhatsApp and website)', 'Other trusts with donation QR codes', 'PDF documents for customers to download on WhatsApp', 'Instagram, Facebook and WhatsApp group links', 'AI knowledge, gallery and event posters'].map((x) => <div className="rounded-xl bg-neutral-100 p-3 text-sm font-semibold" key={x}>{x}</div>)}
                </div>
              </div>
              <div className="rounded-3xl border bg-white p-6">
                <h2 className="font-bold">Production checklist</h2>
                <p className="mt-3 text-sm leading-6 text-neutral-500">Set real provider credentials, set MOCK_PROVIDERS=false, deploy the API and the web app, and configure the Meta, Razorpay and Shiprocket webhooks. Check <code>/health</code> on the API to see which settings are missing.</p>
              </div>
            </div>
          </>}

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

          {tab === 'donations' && <div className="space-y-3">
            {!donations.length && <p className="text-sm text-neutral-400">No donations yet.</p>}
            {donations.map((d) => (
              <div key={d.id} className="flex justify-between rounded-3xl border bg-white p-5">
                <div><b>{d.reference}</b><div className="text-sm text-neutral-500">{d.user?.name || d.user?.phone}</div></div>
                <div className="text-right"><b>₹{d.amount}</b><div className="text-xs">{d.paymentStatus}</div></div>
              </div>
            ))}
          </div>}

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
