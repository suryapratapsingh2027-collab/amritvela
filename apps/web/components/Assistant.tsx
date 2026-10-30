'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Bot, Send, Sparkles, UserRound, X } from 'lucide-react';
import { api, ApiError } from '../lib/api';

type Option = { id: string; title: string; description?: string };
type Msg = { id: string; role: 'user' | 'assistant' | 'system'; text: string; image?: string | null; byAdmin?: boolean; options?: Option[] | null };
type Profile = { name: string; phone: string };

const PROFILE_KEY = 'trust_chat_profile';
const CONV_KEY = 'trust_chat_conversation';

const uid = () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : String(Math.random()).slice(2));
const tenDigits = (v: string) => v.replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

/** Turns URLs inside a message into tappable links (payment link, receipt download, tracking). */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(https?:\/\/[^\s]+)/g);
  return <>{parts.map((p, i) => /^https?:\/\//.test(p)
    ? <a key={i} href={p.replace(/[.,)]+$/, '')} target="_blank" rel="noopener noreferrer" style={{ textDecoration: 'underline', fontWeight: 700, wordBreak: 'break-all' }}>{p.replace(/[.,)]+$/, '')}</a>
    : <span key={i}>{p}</span>)}</>;
}

export default function Assistant({ floating = true }: { floating?: boolean }) {
  const [open, setOpen] = useState(!floating);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [formError, setFormError] = useState('');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [human, setHuman] = useState(false);
  const conversationId = useRef<string | null>(null);
  const lastPoll = useRef<string>(new Date().toISOString());
  const bottom = useRef<HTMLDivElement>(null);
  const greeted = useRef(false);

  // restore profile + conversation after a reload
  useEffect(() => {
    try {
      const p = localStorage.getItem(PROFILE_KEY);
      if (p) setProfile(JSON.parse(p));
      const c = localStorage.getItem(CONV_KEY);
      if (c) {
        conversationId.current = c;
        api<any>(`/api/assistant/history?conversationId=${encodeURIComponent(c)}`).then((h) => {
          if (h?.messages?.length) setMessages([...h.messages.map((m: any) => ({ id: m.id, role: m.role, text: m.text, image: m.image, byAdmin: m.byAdmin }))]);
          if (h?.mode === 'HUMAN') setHuman(true);
          if (h?.now) lastPoll.current = h.now;
        }).catch(() => undefined);
      }
    } catch { /* storage blocked */ }
  }, []);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: 'smooth' }); }, [messages, busy, open]);

  // pick up replies typed by a human agent in the admin console
  const poll = useCallback(async () => {
    const id = conversationId.current;
    if (!id) return;
    try {
      const r = await api<any>(`/api/assistant/poll?conversationId=${encodeURIComponent(id)}&since=${encodeURIComponent(lastPoll.current)}`);
      if (!r) return;
      setHuman(r.mode === 'HUMAN');
      if (r.now) lastPoll.current = r.now; // server clock, so client clock drift can never skip or repeat a reply
      if (r.messages?.length) {
        setMessages((m) => { const seen = new Set(m.map((x) => x.id)); return [...m, ...r.messages.filter((x: any) => !seen.has(x.id)).map((x: any) => ({ id: x.id, role: 'assistant' as const, text: x.text, byAdmin: true }))]; });
      }
    } catch { /* offline blip */ }
  }, []);
  useEffect(() => {
    if (!open || !profile) return;
    const t = setInterval(poll, 7000);
    return () => clearInterval(t);
  }, [open, profile, poll]);

  // A brand-new chat opens with the bot's own welcome + language picker (same as WhatsApp).
  useEffect(() => {
    if (!profile || greeted.current || conversationId.current || messages.length) return;
    greeted.current = true;
    send('hello', undefined, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile, messages.length]);

  function startChat(e: React.FormEvent) {
    e.preventDefault();
    const digits = tenDigits(phone);
    if (name.trim().length < 2) return setFormError('Please enter your name.');
    if (!/^[6-9]\d{9}$/.test(digits)) return setFormError('Please enter a valid 10-digit mobile number.');
    const p = { name: name.trim(), phone: digits };
    try { localStorage.setItem(PROFILE_KEY, JSON.stringify(p)); } catch { /* ignore */ }
    setProfile(p); setFormError('');
  }

  function resetProfile() {
    try { localStorage.removeItem(PROFILE_KEY); localStorage.removeItem(CONV_KEY); } catch { /* ignore */ }
    conversationId.current = null; greeted.current = false; setProfile(null); setMessages([]); setHuman(false);
  }

  async function send(raw?: string, replyId?: string, silent = false) {
    const text = (raw ?? input).trim();
    if (!text || busy || !profile) return;
    setInput(''); setBusy(true);
    if (!silent) setMessages((m) => [...m.map((x) => (x.options ? { ...x, options: null } : x)), { id: uid(), role: 'user', text }]);
    try {
      const r = await api<any>('/api/assistant', { method: 'POST', body: JSON.stringify({ phone: profile.phone, name: profile.name, message: text, replyId, conversationId: conversationId.current || undefined }) });
      if (r?.conversationId) { conversationId.current = r.conversationId; try { localStorage.setItem(CONV_KEY, r.conversationId); } catch { /* ignore */ } }
      setHuman(r?.mode === 'HUMAN');
      if (r?.now) lastPoll.current = r.now;
      if (r?.held) {
        setMessages((m) => (m.some((x) => x.id === 'held') ? m : [...m, { id: 'held', role: 'system', text: 'Your message has reached the Trust team. Their reply will appear here. Type "menu" to return to the assistant.' }]));
      } else if (r?.text) {
        setMessages((m) => [...m, { id: uid(), role: 'assistant', text: r.text, image: r.image?.url, options: r.options || null }]);
      }
    } catch (error: any) {
      const msg = error instanceof ApiError && error.status < 500
        ? error.message
        : 'Could not connect to the assistant right now. Please try again shortly or call the Trust team on 6913001300.';
      setMessages((m) => [...m, { id: uid(), role: 'assistant', text: msg }]);
    } finally { setBusy(false); }
  }

  if (floating && !open) {
    return <button onClick={() => setOpen(true)} className="assistant-launch fixed bottom-5 right-5 z-40 flex items-center gap-2 rounded-full px-5 py-4 text-sm font-bold text-white"><Sparkles size={17} /> Ask the Trust</button>;
  }

  return (
    <div className={`${floating ? 'fixed bottom-5 right-5 z-40 w-[min(410px,calc(100vw-24px))]' : 'w-full'} overflow-hidden rounded-[28px] border border-[#dbe2d9] bg-[#fffefa] shadow-[0_25px_80px_rgba(17,35,25,.18)]`}>
      <div className="assistant-head flex items-center justify-between p-4 text-white">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-2xl bg-white/12"><Bot size={18} /></div>
          <div><b>Trust Assistant</b><div className="text-xs text-white/60">{human ? 'Talking to the Trust team' : 'Donation · Orders · Trust info'}</div></div>
        </div>
        {floating && <button onClick={() => setOpen(false)} aria-label="Close chat"><X size={18} /></button>}
      </div>

      {!profile ? (
        <form onSubmit={startChat} className="space-y-3 bg-[#fbfaf5] p-5">
          <p className="text-sm leading-6 text-[#33423a]">Please enter your name and mobile number to start the chat. Your orders, donations and receipts stay linked to this number.</p>
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" autoComplete="name" />
          <div style={{ display: 'flex', gap: 8 }}>
            <span className="input" style={{ width: 64, display: 'grid', placeItems: 'center', flexShrink: 0 }}>+91</span>
            <input className="input" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="10-digit mobile number" inputMode="tel" autoComplete="tel-national" />
          </div>
          {formError && <p role="alert" className="text-sm text-red-600">{formError}</p>}
          <button className="btn btn-primary w-full">Start chat</button>
        </form>
      ) : (
        <>
          <div className="max-h-96 min-h-48 space-y-3 overflow-y-auto bg-[#fbfaf5] p-4" aria-live="polite">
            {messages.map((m) => m.role === 'system'
              ? <div key={m.id} className="rounded-xl bg-[#eef2eb] p-3 text-center text-xs leading-5 text-[#46564d]">{m.text}</div>
              : (
                <div key={m.id} className={`flex gap-2 ${m.role === 'user' ? 'justify-end' : ''}`}>
                  {m.role === 'assistant' && (m.byAdmin ? <UserRound className="mt-1 text-[#173f2e]" size={15} /> : <Bot className="mt-1 text-[#587162]" size={15} />)}
                  <div className={`max-w-[82%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6 ${m.role === 'user' ? 'bg-[#173f2e] text-white' : 'border border-[#e5e9e3] bg-white text-[#33423a]'}`}>
                    {m.image && <img src={m.image} alt="" style={{ width: '100%', borderRadius: 12, marginBottom: 8, aspectRatio: '1 / 1', objectFit: 'cover' }} />}
                    {m.byAdmin && <div className="mb-1 text-[11px] font-bold text-[#587162]">Trust team</div>}
                    <Linkified text={m.text} />
                    {m.options && m.options.length > 0 && (
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                        {m.options.map((o) => (
                          <button key={o.id} type="button" disabled={busy} onClick={() => send(o.title, o.id)} title={o.description}
                            className="rounded-full border border-[#173f2e] px-3 py-1 text-xs font-semibold text-[#173f2e] hover:bg-[#173f2e] hover:text-white" style={{ cursor: 'pointer' }}>{o.title}</button>
                        ))}
                      </div>
                    )}
                  </div>
                  {m.role === 'user' && <UserRound className="mt-1 text-[#587162]" size={15} />}
                </div>
              ))}
            {busy && <div className="text-xs text-[#77827b]">Typing…</div>}
            <div ref={bottom} />
          </div>
          <div className="border-t border-[#e5e9e3] bg-white p-3">
            <form onSubmit={(e) => { e.preventDefault(); send(); }} className="flex gap-2">
              <input className="input" value={input} onChange={(e) => setInput(e.target.value)} placeholder="Type your message…" maxLength={1000} />
              <button className="btn btn-primary px-4" disabled={busy || !input.trim()} aria-label="Send"><Send size={16} /></button>
            </form>
            <button type="button" onClick={resetProfile} className="mt-2 text-[11px] text-[#77827b] underline">+91 {profile.phone} · change number</button>
          </div>
        </>
      )}
    </div>
  );
}
