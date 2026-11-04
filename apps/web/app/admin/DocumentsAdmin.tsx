'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Eye, EyeOff, ExternalLink, FileText, Pencil, Trash2, Upload } from 'lucide-react';
import { API, api } from '../../lib/api';
import { pdfToDataUrl } from '../../lib/upload';

type Doc = { id: string; title: string; description: string | null; fileName: string; size: number; active: boolean; sortOrder: number; downloads: number };

const kb = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`);

export default function DocumentsAdmin() {
  const [docs, setDocs] = useState<Doc[]>([]);
  const [loading, setLoading] = useState(true);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    try { setDocs((await api<Doc[]>('/api/admin/documents')) ?? []); } catch (e: any) { setError(e?.message || 'Could not load the documents.'); } finally { setLoading(false); }
  }, []);
  useEffect(() => { load(); }, [load]);

  async function upload(e: React.FormEvent) {
    e.preventDefault(); setError(''); setNotice('');
    if (title.trim().length < 2) return setError('Enter a title (at least 2 characters).');
    if (!file) return setError('Choose a PDF file.');
    setBusy(true);
    try {
      const dataUrl = await pdfToDataUrl(file);
      await api('/api/admin/documents', { method: 'POST', body: JSON.stringify({ title: title.trim(), description: description.trim(), fileName: file.name, dataUrl }) });
      setTitle(''); setDescription(''); setFile(null); if (input.current) input.current.value = '';
      setNotice('PDF uploaded. Customers can now download it from the WhatsApp menu under “Downloads (PDF)”.');
      await load();
    } catch (err: any) { setError(err?.message || 'The upload failed.'); } finally { setBusy(false); }
  }

  async function patch(id: string, body: object) {
    setError('');
    try { await api(`/api/admin/documents/${id}`, { method: 'PATCH', body: JSON.stringify(body) }); await load(); }
    catch (err: any) { setError(err?.message || 'Could not update the document.'); }
  }
  async function remove(d: Doc) {
    if (!confirm(`Delete “${d.title}”? Customers will no longer be able to download it.`)) return;
    try { await api(`/api/admin/documents/${d.id}`, { method: 'DELETE' }); await load(); } catch (err: any) { setError(err?.message || 'Could not delete the document.'); }
  }
  async function move(index: number, dir: -1 | 1) {
    const a = docs[index]; const b = docs[index + dir]; if (!a || !b) return;
    try {
      await Promise.all([api(`/api/admin/documents/${a.id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: b.sortOrder === a.sortOrder ? b.sortOrder + dir : b.sortOrder }) }), api(`/api/admin/documents/${b.id}`, { method: 'PATCH', body: JSON.stringify({ sortOrder: a.sortOrder }) })]);
      await load();
    } catch (err: any) { setError(err?.message || 'Could not reorder.'); }
  }
  async function saveEdit(d: Doc) {
    await patch(d.id, { title: editTitle.trim(), description: editDesc.trim() });
    setEditId(null);
  }

  return (
    <div className="space-y-5">
      <form noValidate onSubmit={upload} className="rounded-3xl border bg-white p-6">
        <h2 className="text-xl font-bold">Upload a PDF</h2>
        <p className="mt-1 text-sm text-neutral-500">Uploaded PDFs appear in the WhatsApp menu under <b>Downloads (PDF)</b>. When a customer taps one, the file is sent to them on WhatsApp.</p>
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="grid gap-1.5"><span className="text-sm font-extrabold">Title <span className="text-red-700">*</span></span>
            <input className="input" value={title} maxLength={24} onChange={(e) => setTitle(e.target.value)} placeholder="e.g. Trust Brochure" />
            <span className="text-xs text-neutral-500">{title.length}/24 characters. This is the name customers see in the WhatsApp list.</span></label>
          <label className="grid gap-1.5"><span className="text-sm font-extrabold">Short description (optional)</span>
            <input className="input" value={description} maxLength={72} onChange={(e) => setDescription(e.target.value)} placeholder="e.g. Our seva and activities" />
            <span className="text-xs text-neutral-500">{description.length}/72 characters. Shown under the title.</span></label>
          <label className="grid gap-1.5 md:col-span-2"><span className="text-sm font-extrabold">PDF file <span className="text-red-700">*</span></span>
            <input ref={input} className="input" type="file" accept="application/pdf,.pdf" onChange={(e) => setFile(e.target.files?.[0] || null)} />
            <span className="text-xs text-neutral-500">PDF only, up to 8 MB.</span></label>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl bg-[#eef5ef] p-3 text-sm text-[#1d4d36]">{notice}</p>}
        <button className="btn btn-dark mt-5" disabled={busy}><Upload size={16} /> {busy ? 'Uploading…' : 'Upload PDF'}</button>
      </form>

      <div className="rounded-3xl border bg-white p-6">
        <h2 className="text-xl font-bold">Documents ({docs.length})</h2>
        {loading && <p className="mt-4 text-sm text-neutral-400">Loading…</p>}
        {!loading && !docs.length && <p className="mt-4 text-sm text-neutral-400">No documents yet. Upload your first PDF above.</p>}
        <div className="mt-4 space-y-3">
          {docs.map((d, i) => (
            <div key={d.id} className="rounded-2xl border p-4" style={{ opacity: d.active ? 1 : 0.6 }}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <FileText className="mt-1 shrink-0 text-neutral-400" size={22} />
                  <div className="min-w-0">
                    {editId === d.id ? (
                      <div className="grid gap-2">
                        <input className="input" value={editTitle} maxLength={24} onChange={(e) => setEditTitle(e.target.value)} aria-label="Title" />
                        <input className="input" value={editDesc} maxLength={72} onChange={(e) => setEditDesc(e.target.value)} placeholder="Short description (optional)" aria-label="Description" />
                        <div className="flex gap-2"><button className="btn btn-dark" style={{ padding: '8px 14px' }} onClick={() => saveEdit(d)}>Save</button><button className="btn btn-light" style={{ padding: '8px 14px' }} onClick={() => setEditId(null)}>Cancel</button></div>
                      </div>
                    ) : (<>
                      <div className="font-bold">{d.title}</div>
                      {d.description && <div className="text-sm text-neutral-500">{d.description}</div>}
                      <div className="mt-1 text-xs text-neutral-400">{d.fileName} · {kb(d.size)} · {d.downloads} download{d.downloads === 1 ? '' : 's'}{!d.active ? ' · Hidden from customers' : ''}</div>
                    </>)}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn btn-light" style={{ padding: '8px 12px' }} disabled={i === 0} onClick={() => move(i, -1)} aria-label="Move up"><ArrowUp size={14} /></button>
                  <button className="btn btn-light" style={{ padding: '8px 12px' }} disabled={i === docs.length - 1} onClick={() => move(i, 1)} aria-label="Move down"><ArrowDown size={14} /></button>
                  {d.active && <a className="btn btn-light" style={{ padding: '8px 12px' }} href={`${API}/api/documents/${d.id}/file`} target="_blank" rel="noopener noreferrer"><ExternalLink size={14} /> Preview</a>}
                  <button className="btn btn-light" style={{ padding: '8px 12px' }} onClick={() => { setEditId(d.id); setEditTitle(d.title); setEditDesc(d.description || ''); }}><Pencil size={14} /> Edit</button>
                  <button className="btn btn-light" style={{ padding: '8px 12px' }} onClick={() => patch(d.id, { active: !d.active })}>{d.active ? <><EyeOff size={14} /> Hide</> : <><Eye size={14} /> Show</>}</button>
                  <button className="btn btn-light" style={{ padding: '8px 12px' }} onClick={() => remove(d)}><Trash2 size={14} /> Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
        <p className="mt-5 text-xs text-neutral-400">WhatsApp lists show at most 10 documents (in the order above).</p>
      </div>
    </div>
  );
}
