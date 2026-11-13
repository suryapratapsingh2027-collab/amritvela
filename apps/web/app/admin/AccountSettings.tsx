'use client';
import { useEffect, useState } from 'react';
import { api } from '../../lib/api';
import PasswordInput from '../../components/PasswordInput';
import ImageUploader from '../../components/ImageUploader';

type Result = { ok: boolean; text: string } | null;

function Msg({ r }: { r: Result }) {
  if (!r) return null;
  return <p role={r.ok ? 'status' : 'alert'} className={`mt-4 rounded-xl p-3 text-sm ${r.ok ? 'bg-[#eef5ef] text-[#1d4d36]' : 'bg-red-50 text-red-700'}`}>{r.text}</p>;
}

type Me = { email: string; name: string | null; phone: string | null; avatarUrl: string | null; lastLoginAt: string | null; createdAt: string | null; role?: string };
const when = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }) : '—');

/** Admin profile: name, phone and photo (shown in the sidebar), plus sign-in details. */
function ProfileCard({ me, onSaved }: { me: Me | null; onSaved: (m: Me) => void }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [avatar, setAvatar] = useState<string | null>(null);
  const [res, setRes] = useState<Result>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (me) { setName(me.name || ''); setPhone(me.phone || ''); setAvatar(me.avatarUrl || null); } }, [me]);

  async function save(e: React.FormEvent) {
    e.preventDefault(); setRes(null);
    if (name.trim() && name.trim().length < 2) return setRes({ ok: false, text: 'Enter your full name (at least 2 characters).' });
    if (phone.trim() && !/^\+?\d{10,13}$/.test(phone.replace(/[\s-]/g, ''))) return setRes({ ok: false, text: 'Enter a valid mobile number, for example 9876543210.' });
    setBusy(true);
    try {
      const r = await api<Me>('/api/auth/me', { method: 'PATCH', body: JSON.stringify({ name: name.trim(), phone: phone.trim(), avatarUrl: avatar || '' }) });
      onSaved(r!); setRes({ ok: true, text: 'Profile saved.' });
    } catch (err: any) { setRes({ ok: false, text: err.message }); } finally { setBusy(false); }
  }

  return (
    <form noValidate onSubmit={save} className="rounded-3xl border bg-white p-6 lg:col-span-2">
      <h2 className="text-lg font-bold">My profile</h2>
      <p className="mt-1 text-sm text-neutral-500">Your name and photo are shown in the admin panel sidebar. Email and password are changed below.</p>
      <div className="mt-5 grid gap-6 md:grid-cols-[auto_1fr]">
        <div><div className="mb-2 text-sm font-bold">Photo</div><ImageUploader value={avatar} onChange={setAvatar} square hint="A clear square photo works best." /></div>
        <div className="grid gap-3 content-start">
          <label className="grid gap-1.5"><span className="text-sm font-bold">Full name</span><input className="input" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rinku Ji" autoComplete="name" /></label>
          <label className="grid gap-1.5"><span className="text-sm font-bold">Mobile number</span><input className="input" inputMode="tel" value={phone} maxLength={16} onChange={(e) => setPhone(e.target.value)} placeholder="e.g. 9876543210" autoComplete="tel" /></label>
          <div className="grid gap-1 rounded-2xl bg-[#f7f8f4] p-3 text-sm text-neutral-600 sm:grid-cols-2">
            <div><span className="text-xs font-bold uppercase tracking-wide text-neutral-400">Email (sign-in)</span><br /><b>{me?.email || '…'}</b></div>
            <div><span className="text-xs font-bold uppercase tracking-wide text-neutral-400">Role</span><br /><b>{me?.role === 'ADMIN' || !me?.role ? 'Administrator' : me.role}</b></div>
            <div><span className="text-xs font-bold uppercase tracking-wide text-neutral-400">Last sign-in</span><br /><b>{when(me?.lastLoginAt)}</b></div>
            <div><span className="text-xs font-bold uppercase tracking-wide text-neutral-400">Account created</span><br /><b>{when(me?.createdAt)}</b></div>
          </div>
          <div><button className="btn btn-dark" disabled={busy}>{busy ? 'Saving…' : 'Save profile'}</button></div>
          <Msg r={res} />
        </div>
      </div>
    </form>
  );
}

export default function AccountSettings({ onProfile }: { onProfile?: (m: Me) => void } = {}) {
  const [me, setMe] = useState<Me | null>(null);
  const [email, setEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [emailPw, setEmailPw] = useState('');
  const [emailRes, setEmailRes] = useState<Result>(null);
  const [curPw, setCurPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [confirmPw, setConfirmPw] = useState('');
  const [pwRes, setPwRes] = useState<Result>(null);
  const [busy, setBusy] = useState('');

  useEffect(() => { api<Me>('/api/auth/me').then((u) => { setMe(u ?? null); setEmail(u?.email || ''); }).catch(() => undefined); }, []);

  async function changeEmail(e: React.FormEvent) {
    e.preventDefault(); setEmailRes(null);
    if (!/^\S+@\S+\.\S+$/.test(newEmail.trim())) return setEmailRes({ ok: false, text: 'Enter a valid email address.' });
    if (!emailPw) return setEmailRes({ ok: false, text: 'Enter your current password to confirm.' });
    setBusy('email');
    try {
      const r = await api<{ message: string; user: { email: string } }>('/api/auth/change-email', { method: 'POST', body: JSON.stringify({ currentPassword: emailPw, newEmail: newEmail.trim() }) });
      setEmail(r!.user.email); setMe((x) => (x ? { ...x, email: r!.user.email } : x)); setNewEmail(''); setEmailPw(''); setEmailRes({ ok: true, text: r!.message });
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
      <ProfileCard me={me} onSaved={(m) => { setMe((x) => ({ ...(x as Me), ...m })); onProfile?.(m); }} />
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
