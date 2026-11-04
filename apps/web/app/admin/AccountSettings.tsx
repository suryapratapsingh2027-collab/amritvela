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
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) return setEmailRes({ ok: false, text: 'Enter a valid email address.' });
    if (!emailPw) return setEmailRes({ ok: false, text: 'Enter your current password to confirm.' });
    setBusy('email');
    try {
      const r = await api<{ message: string; user: { email: string } }>('/api/auth/change-email', { method: 'POST', body: JSON.stringify({ currentPassword: emailPw, newEmail: newEmail.trim() }) });
      setEmail(r!.user.email); setNewEmail(''); setEmailPw(''); setEmailRes({ ok: true, text: r!.message });
    } catch (err: any) { setEmailRes({ ok: false, text: err.message }); } finally { setBusy(''); }
  }

  async function changePassword(e: React.FormEvent) {
    e.preventDefault(); setPwRes(null);
    if (!curPw) return setPwRes({ ok: false, text: 'Enter your current password.' });
    if (newPw.length < 10) return setPwRes({ ok: false, text: 'The new password must be at least 10 characters.' });
    if (!/[A-Za-z]/.test(newPw) || !/\d/.test(newPw)) return setPwRes({ ok: false, text: 'The password must contain at least one letter and one number.' });
    if (newPw !== confirmPw) return setPwRes({ ok: false, text: 'The two new passwords do not match.' });
    setBusy('pw');
    try {
      const r = await api<{ message: string; token: string }>('/api/auth/change-password', { method: 'POST', body: JSON.stringify({ currentPassword: curPw, newPassword: newPw }) });
      localStorage.setItem('trust_token', r!.token); // this browser stays signed in; other sessions are signed out
      setCurPw(''); setNewPw(''); setConfirmPw(''); setPwRes({ ok: true, text: `${r!.message} All other devices have been signed out.` });
    } catch (err: any) { setPwRes({ ok: false, text: err.message }); } finally { setBusy(''); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <form noValidate onSubmit={changeEmail} className="rounded-3xl border bg-white p-6">
        <h2 className="text-lg font-bold">Change email</h2>
        <p className="mt-1 text-sm text-neutral-500">Current email: <b>{email || '…'}</b></p>
        <div className="mt-5 space-y-3">
          <input className="input" type="email" autoComplete="off" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="New email address" />
          <PasswordInput value={emailPw} onChange={setEmailPw} placeholder="Current password (to confirm)" autoComplete="current-password" />
          <button className="btn btn-dark" disabled={busy === 'email'}>{busy === 'email' ? 'Saving…' : 'Change email'}</button>
        </div>
        <Msg r={emailRes} />
      </form>

      <form noValidate onSubmit={changePassword} className="rounded-3xl border bg-white p-6">
        <h2 className="text-lg font-bold">Change password</h2>
        <p className="mt-1 text-sm text-neutral-500">At least 10 characters, with a letter and a number.</p>
        <div className="mt-5 space-y-3">
          <PasswordInput value={curPw} onChange={setCurPw} placeholder="Current password" autoComplete="current-password" />
          <PasswordInput value={newPw} onChange={setNewPw} placeholder="New password" autoComplete="new-password" />
          <PasswordInput value={confirmPw} onChange={setConfirmPw} placeholder="Repeat new password" autoComplete="new-password" />
          <button className="btn btn-dark" disabled={busy === 'pw'}>{busy === 'pw' ? 'Saving…' : 'Change password'}</button>
        </div>
        <Msg r={pwRes} />
      </form>
    </div>
  );
}
