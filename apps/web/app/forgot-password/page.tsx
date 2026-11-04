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
    if (!email.trim()) { setErr('Please enter your admin email.'); return; }
    setBusy(true); setErr('');
    try {
      const r = await api<{ message: string }>('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email: email.trim() }) });
      setDone(r?.message || 'If this email belongs to an admin account, a reset link has been sent.');
    } catch (error: any) {
      setErr(error instanceof ApiError ? error.message : 'Could not reach the server. Please try again shortly.');
    } finally { setBusy(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center grid-bg px-5">
      <form noValidate onSubmit={submit} className="w-full max-w-md rounded-[32px] border bg-white p-8 shadow-soft">
        <div className="font-extrabold">AMRIT VELA<span className="text-neutral-400"> TRUST</span></div>
        <h1 className="mt-10 text-3xl font-extrabold">Password reset</h1>
        <p className="mt-2 text-neutral-500">Enter your admin email. We will send you a password reset link (valid for 30 minutes).</p>
        {done ? (
          <div className="mt-8 space-y-4">
            <div role="status" className="rounded-2xl bg-[#eef5ef] p-4 text-sm text-[#1d4d36]">{done}</div>
            <p className="text-sm text-neutral-500">Did not receive it? Check your spam folder. If email is not configured on the server, the link is printed in the API server log.</p>
            <Link href="/login" className="btn btn-dark w-full">Back to sign in</Link>
          </div>
        ) : (
          <div className="mt-8 space-y-4">
            <input className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Admin email" />
            <button disabled={busy} className="btn btn-dark w-full">{busy ? 'Sending…' : 'Send reset link'}</button>
            {err && <div role="alert" className="text-sm text-red-600">{err}</div>}
            <div className="text-center text-sm"><Link href="/login" className="font-semibold text-neutral-600 underline">Back to sign in</Link></div>
          </div>
        )}
      </form>
    </main>
  );
}
