'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';

type Result = { ok: boolean; text: string } | null;

function Msg({ r }: { r: Result }) {
  if (!r) return null;
  return <p role={r.ok ? 'status' : 'alert'} className={`mt-4 rounded-xl p-3 text-sm ${r.ok ? 'bg-[#eef5ef] text-[#1d4d36]' : 'bg-red-50 text-red-700'}`}>{r.text}</p>;
}

export default function AccountSettings() {
  const [email, setEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailRes, setEmailRes] = useState<Result>(null);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwRes, setPwRes] = useState<Result>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => { api<{ email: string }>('/api/auth/me').then((u) => setEmail(u?.email || '')).catch(() => undefined); }, []);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault(); setEmailRes(null);
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) return setEmailRes({ ok: false, text: 'Sahi email address likhein.' });
    if (!emailPw) return setEmailRes({ ok: false, text: 'Confirm karne ke liye current password likhein.' });
    setBusy('email');
    try {
      const r = await api<{ message: string; user: { email: string } }>('/api/auth/change-email', { method: 'POST', body: JSON.stringify({ currentPassword: emailPw, newEmail: newEmail.trim() }) });
      setEmail(r!.user.email); setNewEmail(''); setEmailPw(''); setEmailRes({ ok: true, text: r!.message });
    } catch (err: any) { setEmailRes({ ok: false, text: err.message }); } finally { setBusy(''); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setPwRes(null);
    if (!curPw) return setPwRes({ ok: false, text: 'Current password likhein.' });
    if (newPw.length < 10) return setPwRes({ ok: false, text: 'Naya password kam se kam 10 characters ka hona chahiye.' });
    if (!/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) return setPwRes({ ok: false, text: 'Password me kam se kam ek letter aur ek number hona chahiye.' });
    if (newPw !== confirmPw) return setPwRes({ ok: false, text: 'Dono naye password match nahi karte.' });
    setBusy('pw');
    try {
      const r = await api<{ message: string; token: string }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }) });
      localStorage.setItem('trust_token', r!.token); // this browser stays signed in; other sessions are signed out
      setCurPw(''); setNewPw(''); setConfirmPw(''); setPwRes({ ok: true, text: `${r!.message} Baaki sabhi devices se sign out ho gaya hai.` });
    } catch (err: any) { setPwRes({ ok: false, text: err.message }); } finally { setBusy(''); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form noValidate onSubmit={changeEmail} className="rounded-3xl border bg-white p-6">
        <h2 className="text-lg font-bold">Email badlein</h2>
        <p className="mt-1 text-sm text-neutral-500">Abhi ka email: <b>{email || '…'}</b></p>
        <div className="mt-5 space-y-3">
          <input className="input" type="email" autoComplete="off" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="Naya email address" />
          <PasswordInput value={emailPw} onChange={setEmailPw} placeholder="Current password (confirm karne ke liye)" autoComplete="current-password" />
          <button className="btn btn-dark" disabled={busy === 'email'}>{busy === 'email' ? 'Save ho raha hai…' : 'Email badlein'}</button>
        </div>
        <Msg r={emailRes} />
      </form>

      <form noValidate onSubmit={changePassword} className="rounded-3xl border bg-white p-6">
        <h2 className="text-lg font-bold">Password badlein</h2>
        <p className="mt-1 text-sm text-neutral-500">Kam se kam 10 characters, ek letter aur ek number.</p>
        <div className="mt-5 space-y-3">
          <PasswordInput value={curPw} onChange={setCurPw} placeholder="Current password" autoComplete="current-password" />
          <PasswordInput value={newPw} onChange={setNewPw} placeholder="Naya password" autoComplete="new-password" />
          <PasswordInput value={confirmPw} onChange={setConfirmPw} placeholder="Naya password dobara" autoComplete="new-password" />
          <button className="btn btn-dark" disabled={busy === 'pw'}>{busy === 'pw' ? 'Save ho raha hai…' : 'Password badlein'}</button>
        </div>
        <Msg r={pwRes} />
      </form>
    </div>
  );
}
