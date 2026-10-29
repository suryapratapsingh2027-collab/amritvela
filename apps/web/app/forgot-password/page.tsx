'use client';
import { useState } from 'react';
import Link from 'next/link';
import { api, ApiError } from '../../lib/api';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState('');
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) { setErr('Apna admin email likhein.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
      setDone(r?.message || 'Agar yeh email admin account se juda hai, to reset link bhej diya gaya hai.');
    } catch (error: any) {
      setErr(error instanceof ApiError ? error.message : 'Server se connect nahi ho paaya. Thodi der baad try karein.');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center grid-bg px-5">
      <form noValidate onSubmit={submit} className="w-full max-w-md rounded-[32px] border bg-white p-8 shadow-soft">
        <div className="font-extrabold">AMRIT VELA<span className="text-neutral-400"> TRUST</span></div>
        <h1 className="mt-10 text-3xl font-extrabold">Password reset</h1>
        <p className="mt-2 text-neutral-500">Apna admin email likhein. Hum password reset ka link bhejenge (30 minute tak valid).</p>
        {done ? (
          <div className="mt-8 space-y-4">
            <div role="status" className="rounded-2xl bg-[#eef5ef] p-4 text-sm text-[#1d4d36]">{done}</div>
            <p className="text-sm text-neutral-500">Email nahi mila? Spam folder dekhein. Email service configure na ho to link API server ke logs me milta hai.</p>
            <Link href="/login" className="btn btn-dark w-full">Sign in par wapas</Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" />
            <button disabled={busy} className="btn btn-dark w-full">{busy ? 'Bhej rahe hain…' : 'Reset link bhejein'}</button>
            {err && <div role="alert" className="text-sm text-red-600">{err}</div>}
            <div className="text-center text-sm"><Link href="/login" className="font-semibold text-neutral-600 underline">Sign in par wapas</Link></div>
          </div>
        )}
      </form>
    </main>
  );
}
