'use client';
import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, ApiError } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [err, setErr] = useState('');
  const [loading, setLoading] = useState(false);

  async function go(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim() || !password) { setErr('Please enter your email and password.'); return; }
    setLoading(true); setErr('');
    try {
      const x = await api<{ token: string }>('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
      localStorage.setItem('trust_token', x!.token);
      router.push('/admin');
    } catch (error: any) {
      if (error instanceof ApiError) setErr(error.status === 401 ? 'Incorrect email or password.' : error.message);
      else setErr('Could not reach the server. Please check your internet connection and try again.');
    } finally { setLoading(false); }
  }

  return (
    <main className="min-h-screen grid place-items-center grid-bg px-5">
      <form noValidate onSubmit={go} className="w-full max-w-md rounded-[32px] border bg-white p-8 shadow-soft">
        <div className="font-extrabold">AMRIT VELA<span className="text-neutral-400"> TRUST</span></div>
        <h1 className="mt-10 text-3xl font-extrabold">Admin sign in</h1>
        <p className="mt-2 text-neutral-500">Sign in with your admin email and password.</p>
        <div className="mt-8 space-y-4">
          <input className="input" type="email" name="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" />
          <PasswordInput value={password} onChange={setPassword} name="password" autoComplete="current-password" />
          <button disabled={loading} className="btn btn-dark w-full">{loading ? 'Signing in…' : 'Sign in'}</button>
          {err && <div role="alert" className="text-sm text-red-600">{err}</div>}
          <div className="text-right text-sm"><Link href="/forgot-password" className="font-semibold text-neutral-600 underline">Forgot your password?</Link></div>
        </div>
      </form>
    </main>
  );
}
