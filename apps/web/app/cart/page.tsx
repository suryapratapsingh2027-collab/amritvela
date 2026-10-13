'use client';

import Script from 'next/script';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import { api } from '../../lib/api';
import PublicShell from '../../components/PublicShell';

type Product = { id: string; name: string; description: string; price: number; stock: number; category?: string; imageUrl?: string | null };
type CartItem = { product: Product; quantity: number };

export default function Cart() {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [checkout, setCheckout] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [busy, setBusy] = useState(false);
  const [order, setOrder] = useState<any>(null);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('amritvela_cart');
      if (saved) setCart(JSON.parse(saved));
    } catch { setCart([]); }
  }, []);

  function persist(next: CartItem[]) {
    setCart(next);
    localStorage.setItem('amritvela_cart', JSON.stringify(next));
    window.dispatchEvent(new Event('cart-updated'));
  }

  function changeQuantity(item: CartItem, delta: number) {
    const next = cart.map((entry) => entry.product.id === item.product.id
      ? { ...entry, quantity: Math.max(1, Math.min(entry.product.stock, entry.quantity + delta)) }
      : entry);
    persist(next);
  }

  const subtotal = useMemo(() => cart.reduce((sum, item) => sum + item.product.price * item.quantity, 0), [cart]);
  const delivery = subtotal > 0 && subtotal < 1000 ? 80 : 0;
  const total = subtotal + delivery;

  async function placeOrder() {
    if (!name || !phone || !address || !cart.length) return;
    setBusy(true);
    try {
      const result = await api<any>('/api/orders', {
        method: 'POST',
        body: JSON.stringify({
          phone,
          name,
          email,
          address,
          items: cart.map((item) => ({ productId: item.product.id, quantity: item.quantity })),
        }),
      });

      if (result.payment.id.startsWith('mock_')) {
        const paid = await api<any>(`/api/orders/${result.order.id}/mock-pay`, { method: 'POST' });
        setOrder(paid);
        localStorage.removeItem('amritvela_cart');
        setCart([]);
        return;
      }

      if (!(window as any).Razorpay) throw new Error('Payment gateway is not loaded.');
      const razorpay = new (window as any).Razorpay({
        key: result.keyId,
        amount: result.payment.amount,
        currency: 'INR',
        name: 'Amrit Vela Trust',
        order_id: result.payment.id,
        prefill: { name, email, contact: phone },
        handler: async (response: any) => {
          const paid = await api<any>(`/api/orders/${result.order.id}/verify`, {
            method: 'POST',
            body: JSON.stringify({ razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }),
          });
          setOrder(paid);
          localStorage.removeItem('amritvela_cart');
          setCart([]);
        },
      });
      razorpay.open();
    } catch (error: any) {
      alert(error.message || 'Unable to place order.');
    } finally {
      setBusy(false);
    }
  }

  if (order) {
    return (
      <PublicShell>
        <main className="section grid-bg">
          <div className="container form-shell">
            <div className="form-card">
              <CheckCircle2 size={44} color="#1d6b4d" />
              <span className="section-kicker" style={{ marginTop: 24 }}><span>Success</span> Order confirmed</span>
              <h1 style={{ fontSize: 'clamp(2.5rem,5vw,4.5rem)', lineHeight: .95, letterSpacing: '-.06em', margin: '14px 0' }}>Your resource order is <em>confirmed.</em></h1>
              <p style={{ color: 'var(--muted)', lineHeight: 1.8 }}>Payment has been received and your order is now in the Trust order workflow.</p>
              <div style={{ marginTop: 25, padding: 20, borderRadius: 20, background: '#eef2eb' }}>
                <strong>{order.order?.orderNumber || order.orderNumber}</strong>
                <div style={{ marginTop: 6, color: 'var(--muted)' }}>Total: ₹{order.order?.total || order.total}</div>
              </div>
              <Link href={`/track?order=${order.order?.orderNumber || order.orderNumber}`} className="btn btn-primary" style={{ marginTop: 22 }}>Track order <ArrowLeft size={15} style={{ transform: 'rotate(180deg)' }} /></Link>
            </div>
          </div>
        </main>
      </PublicShell>
    );
  }

  return (
    <PublicShell>
      <main className="section grid-bg">
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        <div className="container">
          <Link href="/shop" className="text-link"><ArrowLeft size={16} /> Back to resources</Link>
          <div className="shop-toolbar" style={{ marginTop: 30 }}>
            <div><span className="section-kicker"><span>01</span> Your selection</span><h2>Shopping cart</h2></div>
          </div>

          {!cart.length ? (
            <div className="empty-products">
              <ShoppingBag size={42} />
              <h3>Your cart is empty.</h3>
              <p>Add a Trust resource from the shop and it will appear here for checkout.</p>
              <Link href="/shop" className="btn btn-primary">Browse resources <ArrowLeft size={15} style={{ transform: 'rotate(180deg)' }} /></Link>
            </div>
          ) : (
            <div className="contact-layout">
              <div className="contact-card">
                {cart.map((item) => (
                  <div key={item.product.id} style={{ display: 'grid', gridTemplateColumns: '92px 1fr auto', gap: 16, alignItems: 'center', padding: '17px 0', borderBottom: '1px solid var(--line)' }}>
                    <div style={{ width: 92, height: 92, borderRadius: 16, overflow: 'hidden', background: '#f0eee7' }}>
                      {item.product.imageUrl ? <img src={item.product.imageUrl} alt={item.product.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <div style={{ height: '100%', display: 'grid', placeItems: 'center' }}><ShoppingBag size={25} /></div>}
                    </div>
                    <div><strong>{item.product.name}</strong><div style={{ color: 'var(--muted)', fontSize: 12, marginTop: 5 }}>₹{item.product.price} each</div><div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10 }}><button type="button" className="nav-icon-link" onClick={() => changeQuantity(item, -1)}><Minus size={14} /></button><span style={{ fontWeight: 850 }}>{item.quantity}</span><button type="button" className="nav-icon-link" onClick={() => changeQuantity(item, 1)}><Plus size={14} /></button></div></div>
                    <button type="button" className="nav-icon-link" onClick={() => persist(cart.filter((entry) => entry.product.id !== item.product.id))} aria-label="Remove"><Trash2 size={15} /></button>
                  </div>
                ))}
              </div>

              <div className="contact-card">
                <span className="section-kicker"><span>02</span> Checkout</span>
                <h2>Delivery details</h2>
                <div style={{ display: 'grid', gap: 11, marginTop: 22 }}>
                  <input className="input" placeholder="Full name" value={name} onChange={(e) => setName(e.target.value)} required />
                  <input className="input" placeholder="Mobile / WhatsApp" value={phone} onChange={(e) => setPhone(e.target.value)} required />
                  <input className="input" type="email" placeholder="Email (optional)" value={email} onChange={(e) => setEmail(e.target.value)} />
                  <textarea className="input" placeholder="Full delivery address" value={address} onChange={(e) => setAddress(e.target.value)} style={{ minHeight: 120, resize: 'vertical' }} required />
                </div>
                <div style={{ borderTop: '1px solid var(--line)', marginTop: 22, paddingTop: 18, display: 'grid', gap: 9 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 13 }}><span>Subtotal</span><strong>₹{subtotal}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--muted)', fontSize: 13 }}><span>Delivery</span><strong>₹{delivery}</strong></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 18, marginTop: 5 }}><strong>Total</strong><strong>₹{total}</strong></div>
                </div>
                <button type="button" className="btn btn-primary" style={{ width: '100%', marginTop: 20 }} disabled={busy} onClick={() => setCheckout(true)}>{busy ? 'Preparing…' : 'Continue to payment'}</button>
              </div>
            </div>
          )}
        </div>

        {checkout && cart.length > 0 && (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(5,25,18,.62)', display: 'grid', placeItems: 'center', padding: 18 }}>
            <div className="form-card" style={{ width: 'min(520px,100%)' }}>
              <span className="section-kicker"><span>03</span> Confirm</span>
              <h2 style={{ fontSize: '2.4rem', marginTop: 12 }}>Ready to pay?</h2>
              <p style={{ color: 'var(--muted)', lineHeight: 1.7 }}>Your order total is <strong>₹{total}</strong>. Continue to Razorpay when production credentials are configured, or the safe mock flow will be used in development.</p>
              <div style={{ display: 'flex', gap: 10, marginTop: 22 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setCheckout(false)}>Go back</button>
                <button type="button" className="btn btn-primary" style={{ flex: 1 }} disabled={busy} onClick={placeOrder}>{busy ? 'Preparing payment…' : 'Pay securely'}</button>
              </div>
            </div>
          </div>
        )}
      </main>
    </PublicShell>
  );
}
