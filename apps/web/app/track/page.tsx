'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, CheckCircle2, PackageCheck, Search, Truck } from 'lucide-react';
import { api } from '../../lib/api';
import PublicShell from '../../components/PublicShell';

export default function Track() {
  const [id, setId] = useState('');
  const [order, setOrder] = useState<any>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const query = new URLSearchParams(window.location.search).get('order');
    if (query) {
      setId(query);
      api(`/api/orders/${encodeURIComponent(query)}`).then(setOrder).catch(() => undefined);
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    try {
      setOrder(await api(`/api/orders/${encodeURIComponent(id.trim())}`));
    } catch {
      setOrder(null);
      setError('Order not found. Please check the order number and try again.');
    }
  }

  return (
    <PublicShell>
      <main>
        <section className="page-hero">
          <div className="container">
            <span className="section-kicker"><span>01</span> Order tracking</span>
            <h1>Know where your <em>order stands.</em></h1>
            <p>Enter the order number you received after checkout to view the latest status available from the Trust order system.</p>
          </div>
        </section>
        <section className="section">
          <div className="container form-shell">
            <div className="form-card">
              <Link href="/shop" className="text-link"><ArrowLeft size={15} /> Back to resources</Link>
              <div style={{ width: 52, height: 52, display: 'grid', placeItems: 'center', borderRadius: 16, background: '#eaf0e8', color: 'var(--green)', marginTop: 35 }}><Search size={21} /></div>
              <h2 style={{ marginTop: 22 }}>Track an order</h2>
              <form onSubmit={submit} style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <input className="input" value={id} onChange={(e) => setId(e.target.value)} placeholder="ORD-..." required />
                <button className="btn btn-primary">Track</button>
              </form>
              {error && <p style={{ color: '#b42318', fontSize: 13, marginTop: 13 }}>{error}</p>}
              {order && (
                <div style={{ marginTop: 28, padding: 25, borderRadius: 22, background: '#eef2eb' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><PackageCheck size={21} color="#1d6b4d" /><strong>{order.orderNumber}</strong></div>
                  <div style={{ marginTop: 18, display: 'grid', gap: 10 }}>
                    <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Status</span><strong style={{ display: 'block', marginTop: 3 }}>{String(order.status).replaceAll('_', ' ')}</strong></div>
                    <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Payment</span><strong style={{ display: 'block', marginTop: 3 }}>{order.paymentStatus}</strong></div>
                    {order.awb && <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>AWB</span><strong style={{ display: 'block', marginTop: 3 }}>{order.awb}</strong></div>}
                    {order.courier && <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Courier</span><strong style={{ display: 'block', marginTop: 3 }}>{order.courier}</strong></div>}
                    <div><span style={{ color: 'var(--muted)', fontSize: 11 }}>Total</span><strong style={{ display: 'block', marginTop: 3 }}>₹{order.total}</strong></div>
                  </div>
                  <div style={{ marginTop: 22, display: 'flex', gap: 8, alignItems: 'center', color: '#315744', fontSize: 12 }}><Truck size={16} /> Shipment information appears here when available.</div>
                </div>
              )}
              {!order && !error && <div style={{ marginTop: 24, padding: 18, border: '1px dashed #ccd4cc', borderRadius: 18, color: 'var(--muted)', fontSize: 13, display: 'flex', gap: 9 }}><CheckCircle2 size={17} /> Your order number is shown on the confirmation screen after successful checkout.</div>}
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
