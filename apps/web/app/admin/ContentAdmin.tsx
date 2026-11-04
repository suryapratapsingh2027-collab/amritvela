'use client';
import { useState } from 'react';
import { api } from '../../lib/api';
import { uploadImage } from '../../lib/upload';

const Err = ({ text }: { text: string }) => (text ? <p role="alert" className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-700">{text}</p> : null);

/** AI knowledge: the text the assistant uses to answer questions about the Trust. */
export function KnowledgeAdmin({ docs, reload }: { docs: any[]; reload: () => void }) {
  const [title, setTitle] = useState(''); const [content, setContent] = useState('');
  const [editId, setEditId] = useState<string | null>(null); const [draft, setDraft] = useState('');
  const [err, setErr] = useState(''); const [busy, setBusy] = useState(false);

  async function add() {
    setErr(''); if (!title.trim() || !content.trim()) return setErr('Enter both a title and the content.');
    setBusy(true);
    try { await api('/api/admin/knowledge', { method: 'POST', body: JSON.stringify({ title: title.trim(), content: content.trim() }) }); setTitle(''); setContent(''); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function saveEdit(d: any) {
    setErr(''); if (!draft.trim()) return setErr('The content cannot be empty.');
    setBusy(true);
    try { await api(`/api/admin/knowledge/${d.id}`, { method: 'PATCH', body: JSON.stringify({ content: draft }) }); setEditId(null); reload(); }
    catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function toggle(d: any) {
    try { await api(`/api/admin/knowledge/${d.id}`, { method: 'PATCH', body: JSON.stringify({ active: !d.active }) }); reload(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <div className="rounded-3xl border bg-white p-6">
        <h2 className="font-bold">Add Trust knowledge</h2>
        <p className="mt-1 text-sm text-neutral-500">The assistant answers questions about the Trust from the information written here. Only add correct, verified information.</p>
        <input className="input mt-4" placeholder="Document title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <textarea className="input mt-3 min-h-48" placeholder="Official Trust information, FAQs, policies, product and shipping details…" value={content} onChange={(e) => setContent(e.target.value)} />
        <button disabled={busy} className="btn btn-dark mt-3" onClick={add}>Save knowledge</button>
        <Err text={err} />
      </div>
      <div className="space-y-3">
        {docs.map((d) => (
          <div key={d.id} className="rounded-3xl border bg-white p-5" style={{ opacity: d.active ? 1 : 0.55 }}>
            <div className="flex items-center justify-between gap-2">
              <b>{d.title}</b>
              <div className="flex gap-2">
                <button className="btn btn-light" style={{ padding: '6px 12px' }} onClick={() => { setEditId(editId === d.id ? null : d.id); setDraft(d.content); setErr(''); }}>{editId === d.id ? 'Cancel' : 'Edit'}</button>
                <button className="btn btn-light" style={{ padding: '6px 12px' }} onClick={() => toggle(d)}>{d.active ? 'Turn off' : 'Turn on'}</button>
              </div>
            </div>
            {editId === d.id ? (<>
              <textarea className="input mt-3 min-h-64" value={draft} onChange={(e) => setDraft(e.target.value)} />
              <button disabled={busy} className="btn btn-dark mt-3" onClick={() => saveEdit(d)}>Save changes</button>
            </>) : <p className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap text-sm text-neutral-600">{d.content}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export function GalleryAdmin({ images, reload }: { images: any[]; reload: () => void }) {
  const [title, setTitle] = useState('Sangat Gallery'); const [alt, setAlt] = useState('');
  const [file, setFile] = useState<File | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  async function add() {
    setErr(''); if (!file) return setErr('Choose an image first.');
    setBusy(true);
    try {
      const { imageUrl } = await uploadImage(file, { maxEdge: 2000 });
      await api('/api/admin/gallery', { method: 'POST', body: JSON.stringify({ title, altText: alt, imageUrl }) });
      setFile(null); setAlt(''); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    if (!confirm('Delete this gallery image?')) return;
    try { await api(`/api/admin/gallery/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="rounded-3xl border bg-white p-5 md:p-7">
      <h2 className="text-xl font-bold">Gallery images</h2>
      <p className="mt-1 text-sm text-neutral-500">Upload photos of the Sangat, Kirtan and Trust programmes. Uploaded photos appear on the public Gallery page.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Image title" />
        <input className="input" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="Alt text (optional)" />
        <input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
      </div>
      <button className="btn btn-dark mt-3" disabled={busy} onClick={add}>{busy ? 'Uploading…' : 'Upload to Gallery'}</button>
      <Err text={err} />
      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {images.map((im) => (
          <div className="overflow-hidden rounded-2xl border" key={im.id}>
            <img src={im.imageUrl} alt={im.altText || im.title} className="h-52 w-full object-cover" />
            <div className="flex items-center justify-between gap-2 p-3">
              <div className="min-w-0"><b className="block truncate text-sm">{im.title}</b><span className="text-xs text-neutral-500">{im.active ? 'Published' : 'Hidden'}</span></div>
              <button className="btn btn-light" onClick={() => remove(im.id)}>Delete</button>
            </div>
          </div>
        ))}
      </div>
      {!images.length && <p className="mt-6 text-sm text-neutral-400">There are no images in the gallery yet.</p>}
    </div>
  );
}

export function PosterAdmin({ posters, reload }: { posters: any[]; reload: () => void }) {
  const [title, setTitle] = useState(''); const [description, setDescription] = useState(''); const [eventDate, setEventDate] = useState(''); const [venue, setVenue] = useState('');
  const [file, setFile] = useState<File | null>(null); const [featured, setFeatured] = useState(true); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');

  async function add() {
    setErr(''); if (!title.trim() || !file) return setErr('Both a poster title and an image are required.');
    setBusy(true);
    try {
      const { imageUrl } = await uploadImage(file, { maxEdge: 2000 });
      await api('/api/admin/posters', { method: 'POST', body: JSON.stringify({ title, description, eventDate, venue, imageUrl, featured, active: true }) });
      setTitle(''); setDescription(''); setEventDate(''); setVenue(''); setFile(null); reload();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  async function toggle(p: any) {
    try { await api(`/api/admin/posters/${p.id}`, { method: 'PATCH', body: JSON.stringify({ ...p, featured: !p.featured }) }); reload(); } catch (e: any) { setErr(e.message); }
  }
  async function remove(id: string) {
    if (!confirm('Delete this event poster?')) return;
    try { await api(`/api/admin/posters/${id}`, { method: 'DELETE' }); reload(); } catch (e: any) { setErr(e.message); }
  }

  return (
    <div className="rounded-3xl border bg-white p-5 md:p-7">
      <h2 className="text-xl font-bold">Upcoming events & posters</h2>
      <p className="mt-1 text-sm text-neutral-500">Upload a poster when a new event is announced. The featured poster is shown on the homepage; you can delete old posters or remove their featured status.</p>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        <input className="input" placeholder="Event title *" value={title} onChange={(e) => setTitle(e.target.value)} />
        <input className="input" placeholder="Event date (e.g. 15 Oct – 24 Nov 2026)" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
        <input className="input" placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
        <input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(e) => setFile(e.target.files?.[0] || null)} />
        <textarea className="input md:col-span-2" placeholder="Short event description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} />
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={featured} onChange={(e) => setFeatured(e.target.checked)} /> Set as featured homepage poster</label>
      <button className="btn btn-dark mt-3" disabled={busy} onClick={add}>{busy ? 'Uploading…' : 'Publish event poster'}</button>
      <Err text={err} />
      <div className="mt-7 grid gap-5 md:grid-cols-2">
        {posters.map((p) => (
          <div className="overflow-hidden rounded-2xl border" key={p.id}>
            <img src={p.imageUrl} alt={p.title} className="max-h-[420px] w-full bg-neutral-100 object-contain" />
            <div className="p-4">
              <b>{p.title}</b>
              <p className="mt-1 text-sm text-neutral-500">{[p.eventDate, p.venue].filter(Boolean).join(' · ')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button className="btn btn-light" onClick={() => toggle(p)}>{p.featured ? 'Featured on homepage' : 'Feature on homepage'}</button>
                <button className="btn btn-light" onClick={() => remove(p.id)}>Delete</button>
              </div>
            </div>
          </div>
        ))}
      </div>
      {!posters.length && <p className="mt-6 text-sm text-neutral-400">No event poster has been published yet.</p>}
    </div>
  );
}
