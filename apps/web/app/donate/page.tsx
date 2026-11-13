'use client';

import Script from 'next/script';
import { useEffect, useState } from 'react';
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
  const [campaigns, setCampaigns] = useState<any[]>([]);
  const [campaign, setCampaign] = useState('');
  const [trusts, setTrusts] = useState<any[]>([]);
  const [trust, setTrust] = useState('');
  const [showQr, setShowQr] = useState(false);

  useEffect(() => {
    api<any[]>('/api/campaigns').then((list) => {
      const active = list || []; setCampaigns(active);
      const wanted = new URLSearchParams(window.location.search).get('campaign');
      if (wanted && active.some((c) => c.slug === wanted && c.acceptingDonations)) setCampaign(wanted);
    }).catch(() => undefined); // campaigns are optional: the general donation form still works
    api<any[]>('/api/donations/trusts').then((list) => {
      const rows = (list || []).filter((t) => t.slug !== 'general-donation'); setTrusts(rows);
      const wanted = new URLSearchParams(window.location.search).get('trust');
      if (wanted && rows.some((t) => t.slug === wanted)) setTrust(wanted);
    }).catch(() => undefined); // trusts are optional too
  }, []);
  const pickedTrust = trusts.find((t) => t.slug === trust);
  const qrOnly = Boolean(pickedTrust && !pickedTrust.online);
  const hasQr = Boolean(pickedTrust && (pickedTrust.qrImageUrl || pickedTrust.upiId));
  const picked = campaigns.find((c) => c.slug === campaign);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = Number(amount);
    if (!Number.isInteger(value) || value < 1) { alert('Kripya poore rupaye me donation amount likhein, jaise 500.'); return; }
    if (!/^[6-9]\d{9}$/.test(phone.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, ''))) { alert('Kripya sahi 10-digit mobile number likhein (receipt isi number se jude rahegi).'); return; }
    setLoading(true);
    try {
      const result = await api<any>('/api/donations', { method: 'POST', body: JSON.stringify({ amount: Number(amount), name, phone, email, ...(campaign ? { campaignSlug: campaign } : {}), ...(trust && !campaign ? { trustSlug: trust } : {}) }) });
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
          try {
            const paid = await api<any>(`/api/donations/${result.donationId}/verify`, { method: 'POST', body: JSON.stringify({ razorpayPaymentId: response.razorpay_payment_id, razorpaySignature: response.razorpay_signature }) });
            setDone(paid.donation || paid);
          } catch {
            // The payment itself succeeded at Razorpay; our webhook/reconciliation will still mark it paid.
            alert('Aapka payment Razorpay par mil gaya hai, par confirmation page abhi load nahi ho paaya. Chinta na karein, donation thodi der me confirm ho jaayega. Zaroorat ho to Trust team se 6913001300 par sampark karein.');
          }
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
                  {trusts.length > 0 && (
                    <>
                      <p className="lead-copy" style={{ marginTop: 14, marginBottom: 8, fontWeight: 700 }}>Which trust would you like to support?</p>
                      <div className="camp-list" role="radiogroup" aria-label="Trust">
                        <button type="button" role="radio" aria-checked={!trust} className={`camp-card${!trust ? ' on' : ''}`} onClick={() => { setTrust(''); setShowQr(false); }}><strong>Amrit Vela Trust</strong><small>General donation</small></button>
                        {trusts.map((t) => (
                          <button type="button" role="radio" aria-checked={trust === t.slug} key={t.slug} className={`camp-card${trust === t.slug ? ' on' : ''}`} onClick={() => { setTrust(t.slug); setCampaign(''); setShowQr(false); }}>
                            <strong>{t.name}</strong><small>{t.online ? 'Goes to this trust’s own account' : 'Pay by QR / UPI'}</small>
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {campaigns.length > 0 && (
                    <div className="camp-list" role="radiogroup" aria-label="Donate to">
                      <button type="button" role="radio" aria-checked={!campaign} className={`camp-card${!campaign ? ' on' : ''}`} onClick={() => { setCampaign(''); }}><strong>General donation</strong><small>Wherever the Trust needs it most</small></button>
                      {campaigns.map((c) => (
                        <button type="button" role="radio" aria-checked={campaign === c.slug} disabled={!c.acceptingDonations} key={c.slug} className={`camp-card${campaign === c.slug ? ' on' : ''}`} onClick={() => { setCampaign(c.slug); setTrust(''); }}>
                          {c.imageUrl && <img src={c.imageUrl} alt="" />}
                          <strong>{c.title}</strong>
                          <div className="camp-bar" role="progressbar" aria-valuenow={c.percent} aria-valuemin={0} aria-valuemax={100} aria-label={`${c.title} progress`}><i style={{ width: `${c.percent}%` }} /></div>
                          <small>₹{Number(c.raised).toLocaleString('en-IN')} raised of ₹{Number(c.targetAmount).toLocaleString('en-IN')} · {c.percent}%{c.acceptingDonations ? '' : ' · Completed'}</small>
                        </button>
                      ))}
                    </div>
                  )}
                  {picked?.description?.en && <p className="lead-copy" style={{ marginTop: 14 }}>{picked.description.en}</p>}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 9, marginTop: 20 }}>
                    {['500', '1000', '2500'].map((value) => <button type="button" key={value} onClick={() => setAmount(value)} className="btn" style={{ borderColor: amount === value ? 'var(--green)' : 'var(--line)', background: amount === value ? 'var(--green)' : '#fff', color: amount === value ? '#fff' : 'var(--ink)' }}>₹{value}</button>)}
                  </div>
                  <div style={{ display: 'grid', gap: 11, marginTop: 13 }}>
                    <input className="input" type="number" min="1" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Custom amount" required />
                    <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" required />
                    <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp / mobile number" required />
                    <input className="input" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email (optional)" />
                  </div>
                  {qrOnly ? (
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      {pickedTrust?.qrImageUrl && <img src={pickedTrust.qrImageUrl} alt={`${pickedTrust.name} donation QR code`} style={{ width: 240, maxWidth: '100%', margin: '0 auto', background: '#fff', borderRadius: 14, border: '1px solid var(--line)' }} />}
                      <p className="lead-copy" style={{ marginTop: 10 }}>Scan this QR code with PhonePe, Google Pay, Paytm or any UPI app to donate to <b>{pickedTrust?.name}</b>.{pickedTrust?.upiId ? <> UPI ID: <b>{pickedTrust.upiId}</b></> : null}</p>
                      {!hasQr && <p className="lead-copy">The QR code for this trust is not available yet. Please contact {pickedTrust?.contactPhone || '6913001300'}.</p>}
                    </div>
                  ) : (
                    <button disabled={loading} className="btn btn-primary" style={{ width: '100%', marginTop: 16 }}>{loading ? 'Preparing payment…' : `Continue with ₹${amount}${picked ? ` · ${picked.title}` : pickedTrust ? ` · ${pickedTrust.name}` : ''}`}</button>
                  )}
                  {!qrOnly && hasQr && (
                    <div style={{ marginTop: 12, textAlign: 'center' }}>
                      <button type="button" className="text-link" onClick={() => setShowQr((v) => !v)}>{showQr ? 'Hide QR code' : 'Payment not working? Pay by QR code'}</button>
                      {showQr && (
                        <div style={{ marginTop: 10 }}>
                          {pickedTrust?.qrImageUrl && <img src={pickedTrust.qrImageUrl} alt={`${pickedTrust.name} donation QR code`} style={{ width: 220, maxWidth: '100%', margin: '0 auto', background: '#fff', borderRadius: 14, border: '1px solid var(--line)' }} />}
                          <p className="lead-copy" style={{ marginTop: 8 }}>Scan with any UPI app.{pickedTrust?.upiId ? <> UPI ID: <b>{pickedTrust.upiId}</b></> : null}</p>
                        </div>
                      )}
                    </div>
                  )}
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
