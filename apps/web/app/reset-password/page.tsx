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
    if (password.length < 10) return setErr('The password must be at least 10 characters.');
    if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) return setErr('The password must contain at least one letter and one number.');
    if (password !== confirm) return setErr('The two passwords do not match.');
    setBusy(true); setErr('');
    try {
      await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
      setDone(true);
    } catch (error: any) {
      setErr(error instanceof ApiError ? error.message : 'Could not reach the server. Please try again shortly.');
    } finally { setBusy(false); }
  }

  if (!token) return <div className="mt-8 space-y-4"><div role="alert" className="text-sm text-red-600">This reset link is incomplete. Please open the full link from your email.</div><Link href="/forgot-password" className="btn btn-dark w-full">Request a new link</Link></div>;
  if (done) return <div className="mt-8 space-y-4"><div role="status" className="rounded-2xl bg-[#eef5ef] p-4 text-sm text-[#1d4d36]">Your password has been changed. You can now sign in with the new password.</div><Link href="/login" className="btn btn-dark w-full">Sign in</Link></div>;

  return (
    <form onSubmit={submit} className="mt-8 space-y-4">
      <PasswordInput value={password} onChange={setPassword} placeholder="New password" autoComplete="new-password" />
      <PasswordInput value={confirm} onChange={setConfirm} placeholder="Repeat new password" autoComplete="new-password" />
      <p className="text-xs text-neutral-500">At least 10 characters, with a letter and a number.</p>
      <button disabled={busy} className="btn btn-dark w-full">{busy ? 'Saving…' : 'Change password'}</button>
      {err && <div role="alert" className="text-sm text-red-600">{err}</div>}
      {err.includes('expire') && <Link href="/forgot-password" className="block text-center text-sm font-semibold underline">Request a new link</Link>}
    </form>
  );
}

export default function ResetPassword() {
  return (
    <main className="min-h-screen grid place-items-center grid-bg px-5">
      <div className="w-full max-w-md rounded-[32px] border bg-white p-8 shadow-soft">
        <div className="font-extrabold">AMRIT VELA<span className="text-neutral-400"> TRUST</span></div>
        <h1 className="mt-10 text-3xl font-extrabold">New password</h1>
        <p className="mt-2 text-neutral-500">Set a new password for your admin account.</p>
        <Suspense fallback={<p className="mt-8 text-sm text-neutral-500">Loading…</p>}><ResetForm /></Suspense>
      </div>
    </main>
  );
}
