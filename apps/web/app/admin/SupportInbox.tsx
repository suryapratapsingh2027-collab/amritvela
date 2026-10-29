'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Bot, Globe, MessageCircle, Send, UserCheck } from 'lucide-react';
import { api } from '../../lib/api';

type Summary = {
  id: string; mode: 'AI' | 'HUMAN' | 'CLOSED'; channel: 'WHATSAPP' | 'WEB'; lastMessageAt: string;
  user: { id: string; name: string | null; phone: string };
  lastMessage: { text: string; direction: 'IN' | 'OUT'; createdAt: string } | null;
  openTickets: number; awaitingReply: boolean;
};
type Message = { id: string; direction: 'IN' | 'OUT'; text: string; createdAt: string; metadata?: { by?: string } | null };
type Thread = { id: string; mode: string; channel: string; user: Summary['user']; messages: Message[] };

const time = (iso: string) => {
  const d = new Date(iso); const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay ? d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
};
const phoneLabel = (p: string) => (p.length === 12 && p.startsWith('91') ? `+91 ${p.slice(2, 7)} ${p.slice(7)}` : p);

export default function SupportInbox() {
  const [list, setList] = useState<Summary[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [thread, setThread] = useState<Thread | null>(null);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<'all' | 'needs'>('all');
  const bottom = useRef<HTMLDivElement>(null);
  const lastCount = useRef(0);

  const loadList = useCallback(async () => {
    try { setList((await api<Summary[]>('/api/admin/conversations')) ?? []); } catch { /* keep the previous list on a blip */ } finally { setLoading(false); }
  }, []);

  const loadThread = useCallback(async (id: string) => {
    try { setThread(await api<Thread>(`/api/admin/conversations/${id}/messages`)); } catch { /* ignore */ }
  }, []);

  useEffect(() => { loadList(); const t = setInterval(loadList, 15000); return () => clearInterval(t); }, [loadList]);
  useEffect(() => {
    if (!selected) { setThread(null); return; }
    setError(''); lastCount.current = 0; loadThread(selected);
    const t = setInterval(() => loadThread(selected), 6000);
    return () => clearInterval(t);
  }, [selected, loadThread]);
  useEffect(() => {
    if (thread && thread.messages.length !== lastCount.current) { lastCount.current = thread.messages.length; bottom.current?.scrollIntoView({ behavior: 'smooth' }); }
  }, [thread]);

  async function send() {
    const body = text.trim();
    if (!body || !selected || sending) return;
    setSending(true); setError('');
    try {
      await api(`/api/admin/conversations/${selected}/reply`, { method: 'POST', body: JSON.stringify({ text: body }) });
      setText('');
      await Promise.all([loadThread(selected), loadList()]);
    } catch (e: any) {
      setError(e?.message || 'Message nahi bheja ja saka.'); // shown right under the box, with the real reason
    } finally { setSending(false); }
  }

  async function setMode(mode: 'AI' | 'HUMAN') {
    if (!selected) return;
    try { await api(`/api/admin/conversations/${selected}`, { method: 'PATCH', body: JSON.stringify({ mode }) }); await Promise.all([loadThread(selected), loadList()]); }
    catch (e: any) { setError(e?.message || 'Mode badal nahi saka.'); }
  }

  const visible = list.filter((c) => (filter === 'needs' ? c.awaitingReply || c.openTickets > 0 : true));
  const needs = list.filter((c) => c.awaitingReply).length;

  return (
    <div className="overflow-hidden rounded-3xl border bg-white" style={{ minHeight: 560 }}>
      <div className="grid md:grid-cols-[340px_1fr]" style={{ minHeight: 560 }}>
        {/* conversation list */}
        <div className={`${selected ? 'hidden md:block' : ''} border-r`} style={{ maxHeight: 680, overflowY: 'auto' }}>
          <div className="flex gap-2 border-b p-3">
            <button className={`btn ${filter === 'all' ? 'btn-dark' : 'btn-light'}`} style={{ padding: '8px 14px' }} onClick={() => setFilter('all')}>Sab ({list.length})</button>
            <button className={`btn ${filter === 'needs' ? 'btn-dark' : 'btn-light'}`} style={{ padding: '8px 14px' }} onClick={() => setFilter('needs')}>Reply chahiye ({needs})</button>
          </div>
          {loading && <p className="p-5 text-sm text-neutral-400">Loading…</p>}
          {!loading && !visible.length && <p className="p-5 text-sm text-neutral-400">{filter === 'needs' ? 'Koi pending reply nahi. 🙏' : 'Abhi koi conversation nahi hai.'}</p>}
          {visible.map((c) => (
            <button key={c.id} onClick={() => setSelected(c.id)} className="block w-full border-b p-4 text-left hover:bg-neutral-50" style={{ background: selected === c.id ? '#f3f6f1' : undefined }}>
              <div className="flex items-center justify-between gap-2">
                <b className="truncate">{c.user.name || phoneLabel(c.user.phone)}</b>
                <span className="text-xs text-neutral-400">{time(c.lastMessageAt)}</span>
              </div>
              <div className="mt-1 truncate text-sm text-neutral-500">{c.lastMessage ? `${c.lastMessage.direction === 'IN' ? '' : 'You/Bot: '}${c.lastMessage.text}` : '—'}</div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] font-bold">
                <span className="inline-flex items-center gap-1 rounded-full bg-neutral-100 px-2 py-1">{c.channel === 'WEB' ? <><Globe size={11} /> Website</> : <><MessageCircle size={11} /> WhatsApp</>}</span>
                <span className="rounded-full px-2 py-1" style={{ background: c.mode === 'HUMAN' ? '#e3ecff' : '#eef2eb' }}>{c.mode === 'HUMAN' ? 'Team' : 'Bot'}</span>
                {c.awaitingReply && <span className="rounded-full bg-red-100 px-2 py-1 text-red-700">Reply chahiye</span>}
              </div>
            </button>
          ))}
        </div>

        {/* thread */}
        <div className={`${selected ? '' : 'hidden md:flex'} flex-col`} style={{ maxHeight: 680 }}>
          {!selected || !thread ? (
            <div className="grid flex-1 place-items-center p-10 text-center text-sm text-neutral-400">{selected ? 'Loading…' : 'Left se koi conversation chunein.'}</div>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3 border-b p-4">
                <div className="flex items-center gap-3">
                  <button className="md:hidden" onClick={() => setSelected(null)} aria-label="Wapas"><ArrowLeft size={18} /></button>
                  <div><b>{thread.user.name || phoneLabel(thread.user.phone)}</b><div className="text-xs text-neutral-500">{phoneLabel(thread.user.phone)} · {thread.channel === 'WEB' ? 'Website chat' : 'WhatsApp'}</div></div>
                </div>
                {thread.mode === 'HUMAN'
                  ? <button className="btn btn-light" style={{ padding: '9px 14px' }} onClick={() => setMode('AI')}><Bot size={14} /> Bot ko wapas dein</button>
                  : <button className="btn btn-dark" style={{ padding: '9px 14px' }} onClick={() => setMode('HUMAN')}><UserCheck size={14} /> Main sambhalta hoon</button>}
              </div>

              <div className="flex-1 space-y-3 overflow-y-auto bg-[#f7f8f4] p-4" style={{ minHeight: 280 }}>
                {thread.messages.map((m) => {
                  const mine = m.direction === 'OUT'; const admin = m.metadata?.by === 'admin';
                  return (
                    <div key={m.id} className={`flex ${mine ? 'justify-end' : ''}`}>
                      <div className="max-w-[80%] whitespace-pre-wrap rounded-2xl px-4 py-3 text-sm leading-6" style={{ background: admin ? '#173f2e' : mine ? '#e4e8e1' : '#fff', color: admin ? '#fff' : '#26332b', border: mine ? undefined : '1px solid #e5e9e3' }}>
                        <div className="mb-1 text-[11px] font-bold opacity-60">{mine ? (admin ? 'Aap (team)' : 'Bot') : 'Customer'} · {time(m.createdAt)}</div>
                        {m.text}
                      </div>
                    </div>
                  );
                })}
                <div ref={bottom} />
              </div>

              <div className="border-t p-3">
                {thread.channel === 'WHATSAPP' && <p className="mb-2 text-xs text-neutral-500">WhatsApp par reply sirf customer ke last message ke 24 ghante ke andar jaa sakta hai.</p>}
                {thread.mode !== 'HUMAN' && <p className="mb-2 text-xs text-neutral-500">Reply bhejte hi chat aapke paas aa jaayegi (bot chup ho jaayega).</p>}
                <div className="flex gap-2">
                  <textarea className="input" rows={2} value={text} onChange={(e) => setText(e.target.value)} placeholder="Customer ko reply likhein… (Enter = bhejein, Shift+Enter = nayi line)" style={{ resize: 'none' }}
                    onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
                  <button className="btn btn-dark" onClick={send} disabled={sending || !text.trim()} aria-label="Send"><Send size={16} /> {sending ? '…' : 'Send'}</button>
                </div>
                {error && <p role="alert" className="mt-2 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
