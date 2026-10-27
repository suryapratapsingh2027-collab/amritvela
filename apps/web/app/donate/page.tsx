'use client';

import Script from 'next/script';
import { useState } from 'react';
import { ArrowLeft, CheckCircle2, HeartHandshake, ShieldCheck } from 'lucide-react';
import Link from 'next/link';
import { api } from '../../lib/api';
import PublicShell from '../../components/PublicShell';

export default function Donate() {
  const [amount, setAmount] = useState('1000');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<any>(null);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    try {
      const result = await api<any>('/api/donations', { method: 'POST', body: JSON.stringify({ amount: Number(amount), name, phone, email }) });
      if (result.payment.id.startsWith('mock_')) {
        const paid = await api<any>(`/api/donations/${result.donationId}/mock-pay`, { method: 'POST' });
        setDone(paid.donation);
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
          const paid = await api<any>(`/api/donations/${result.donationId}/verify`, { method: 'POST', body: JSON.stringify({ razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }) });
          setDone(paid.donation || paid);
        },
      });
      razorpay.open();
    } catch (error: any) {
      alert(error.message || 'Unable to process donation.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <PublicShell>
      <main>
        <Script src="https://checkout.razorpay.com/v1/checkout.js" strategy="afterInteractive" />
        <section className="page-hero">
          <div className="container">
            <span className="section-kicker"><span>01</span> Give with purpose</span>
            <h1>Your support becomes <em>seva.</em></h1>
            <p>Contribute towards the Trust's charitable and community work across food distribution, healthcare, education, spiritual activities and welfare.</p>
          </div>
        </section>

        <section className="section">
          <div className="container contact-layout">
            <div className="form-card">
              <Link href="/" className="text-link"><ArrowLeft size={15} /> Home</Link>
              {done ? (
                <div style={{ paddingTop: 45 }}>
                  <CheckCircle2 size={48} color="#1d6b4d" />
                  <span className="section-kicker" style={{ marginTop: 22 }}><span>Completed</span> Thank you</span>
                  <h2>Your donation is <em>confirmed.</em></h2>
                  <p className="lead-copy">Thank you for supporting the Trust's mission. Your donation reference is <strong>{done.reference}</strong>.</p>
                  <a className="btn btn-primary" style={{ marginTop: 20 }} href={`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000'}/api/donations/${done.id}/receipt`} target="_blank" rel="noreferrer">View receipt <ArrowLeft size={15} style={{ transform: 'rotate(180deg)' }} /></a>
                </div>
              ) : (
                <form onSubmit={submit} style={{ paddingTop: 40 }}>
                  <span className="section-kicker"><span>02</span> Donation details</span>
                  <h2>Choose an amount.</h2>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginTop: 20 }}>
                    {['500', '1000', '2500'].map((value) => <button type="button" key={value} onClick={() => setAmount(value)} className="btn" style={{ borderColor: amount === value ? 'var(--green)' : 'var(--line)', background: amount === value ? 'var(--green)' : '#fff', color: amount === value ? '#fff' : 'var(--ink)' }}>₹{value}</button>)}
                  </div>
                  <div style={{ display: 'grid', gap: 11, marginTop: 13 }}>
                    <input className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Custom amount" required />
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
                    <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp / mobile number" required />
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
                  </div>
                  <button disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>{loading ? 'Preparing payment…' : `Continue with ₹${amount}`}</button>
                </form>
              )}
            </div>

            <div className="contact-card contact-aside">
              <span className="section-kicker light"><span>03</span> Why your support matters</span>
              <h3>One contribution can strengthen an entire chain of care.</h3>
              <p>Amrit Vela Trust's stated mission spans spiritual awakening, hunger eradication, healthcare, emergency relief and education.</p>
              <div className="contact-note">
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><ShieldCheck size={19} /><span>Payments use the configured payment provider. In local development, the project can use a safe mock flow.</span></div>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start', marginTop: 18 }}><HeartHandshake size={19} /><span>For donation queries: 6913001300 · amritvelatrustlive@gmail.com</span></div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </PublicShell>
  );
}
