'use client';
import { Suspense, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';

function ResetForm() {
  const token = useSearchParams().get('token') || '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [err, setErr] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 10) return setErr('Password kam se kam 10 characters ka hona chahiye.');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setErr('Password me kam se kam ek letter aur ek number hona chahiye.');
    if (password !== confirm) return setErr('Dono password match nahi karte.');
    setBusy(true); setErr('');
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (error: any) {
      setErr(error instanceof ApiError ? error.message : 'Server se connect nahi ho paaya. Thodi der baad try karein.');
    } finally { setBusy(false); }
  }

  if (!token) return <div className="mt-8 space-y-4"><div role="alert" className="text-sm text-red-600">Reset link adhoora hai. Email wala poora link kholein.</div><Link href="/forgot-password" className="btn btn-dark w-full">Naya link mangwayein</Link></div>;
  if (done) return <div className="mt-8 space-y-4"><div role="status" className="rounded-2xl bg-[#eef5ef] p-4 text-sm text-[#1d4d36]">Password badal diya gaya hai. Ab naye password se sign in karein.</div><Link href="/login" className="btn btn-dark w-full">Sign in</Link></div>;

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <PasswordInput value={password} onChange={setPassword} placeholder="Naya password" autoComplete="new-password" />
      <PasswordInput value={confirm} onChange={setConfirm} placeholder="Naya password dobara" autoComplete="new-password" />
      <p className="text-xs text-neutral-500">Kam se kam 10 characters, ek letter aur ek number.</p>
      <button disabled={busy} className="btn btn-dark w-full">{busy ? 'Save ho raha hai…' : 'Password badlein'}</button>
      {err && <div role="alert" className="text-sm text-red-600">{err}</div>}
      {err.includes('expire') && <Link href="/forgot-password" className="block text-center text-sm font-semibold underline">Naya link mangwayein</Link>}
    </form>
  );
}

export default function ResetPassword() {
  return (
    <main className="min-h-screen grid place-items-center grid-bg px-5">
      <div className="w-full max-w-md rounded-[32px] border bg-white p-8 shadow-soft">
        <div className="font-extrabold">AMRIT VELA<span className="text-neutral-400"> TRUST</span></div>
        <h1 className="mt-10 text-3xl font-extrabold">Naya password</h1>
        <p className="mt-2 text-neutral-500">Admin account ke liye naya password set karein.</p>
        <Suspense fallback={<p className="mt-8 text-sm text-neutral-500">Loading…</p>}><ResetForm /></Suspense>
      </div>
    </main>
  );
}
