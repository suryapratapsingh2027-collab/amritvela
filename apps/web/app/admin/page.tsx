'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { LucideIcon } from 'lucide-react'; import { api } from '../../lib/api';
import { LayoutDashboard, Package, HeartHandshake, Users, MessageCircle, BookOpen, LogOut, Truck, Plus, Save, Images, CalendarDays } from 'lucide-react';

type NavItem = [key: string, label: string, Icon: LucideIcon];

const nav: NavItem[] = [['overview','Overview',LayoutDashboard],['products','Products',Package],['orders','Orders',Truck],['donations','Donations',HeartHandshake],['customers','Customers',Users],['conversations','Support',MessageCircle],['knowledge','AI Knowledge',BookOpen],['gallery','Gallery',Images],['posters','Event Posters',CalendarDays]];

export default function Admin(){const router=useRouter();const [tab,setTab]=useState('overview'),[stats,setStats]=useState<any>(),[products,setProducts]=useState<any[]>([]),[orders,setOrders]=useState<any[]>([]),[donations,setDonations]=useState<any[]>([]),[customers,setCustomers]=useState<any[]>([]),[convos,setConvos]=useState<any[]>([]),[knowledge,setKnowledge]=useState<any[]>([]),[gallery,setGallery]=useState<any[]>([]),[posters,setPosters]=useState<any[]>([]),[loading,setLoading]=useState(true);

 async function load(){try{const [s,p,o,d,c,cv,k,g,ep]=await Promise.all([api('/api/admin/stats'),api<any[]>('/api/admin/products'),api<any[]>('/api/admin/orders'),api<any[]>('/api/admin/donations'),api<any[]>('/api/admin/customers'),api<any[]>('/api/admin/conversations'),api<any[]>('/api/admin/knowledge'),api<any[]>('/api/admin/gallery'),api<any[]>('/api/admin/posters')]);setStats(s ?? {});setProducts(p ?? []);setOrders(o ?? []);setDonations(d ?? []);setCustomers(c ?? []);setConvos(cv ?? []);setKnowledge(k ?? []);setGallery(g ?? []);setPosters(ep ?? [])}catch{localStorage.removeItem('trust_token');router.replace('/login')}finally{setLoading(false)}}

 useEffect(()=>{if(!localStorage.getItem('trust_token'))router.replace('/login');else load()},[]);

 async function saveProduct(p:any){const {id,createdAt,updatedAt,...data}=p; await api(`/api/admin/products/${id}`,{method:'PATCH',body:JSON.stringify(data)});await load()}

 async function addProduct(){const p=await api<any>('/api/admin/products',{method:'POST',body:JSON.stringify({name:'New Product',slug:`product-${Date.now()}`,description:'Add product description',price:0,stock:0,category:'General',active:true})});if (p) setProducts(x=>[p,...x]);}

 async function ship(id:string){try{await api(`/api/admin/orders/${id}/ship`,{method:'POST'});await load()}catch(e:any){alert(e.message)}}

 async function mode(id:string,mode:string){await api(`/api/admin/conversations/${id}`,{method:'PATCH',body:JSON.stringify({mode})});await load()}

 if(loading)return <main className="grid min-h-screen place-items-center">Loading admin…</main>;

 return <main className="min-h-screen bg-[#f5f5f2]"><aside className="fixed hidden h-screen w-64 border-r bg-white p-5 lg:block"><div className="px-3 py-4 font-extrabold">AMRIT VELA <span className="text-neutral-400">TRUST</span></div><div className="mt-7 space-y-1">{nav.map(([key,label,Icon])=><button key={key} onClick={()=>setTab(key)} className={`flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left text-sm font-semibold ${tab===key?'bg-black text-white':'hover:bg-neutral-100'}`}><Icon size={17}/>{label}</button>)}</div><button onClick={()=>{localStorage.removeItem('trust_token');router.push('/login')}} className="absolute bottom-5 left-5 flex items-center gap-3 px-3 text-sm text-neutral-500"><LogOut size={17}/> Sign out</button></aside>

 <section className="lg:ml-64"><header className="sticky top-0 z-10 border-b bg-[#f5f5f2]/90 px-5 py-4 backdrop-blur md:px-8"><div className="flex items-center justify-between"><div><div className="text-xs font-bold uppercase tracking-widest text-neutral-400">Trust Admin Console</div><h1 className="mt-1 text-2xl font-extrabold">{nav.find(n=>n[0]===tab)?.[1]}</h1></div><span className="rounded-full bg-black px-4 py-2 text-xs font-bold text-white">{stats?.pendingPayments||0} pending payments</span></div></header><div className="p-5 md:p-8">

 {tab==='overview'&&<><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">{[['Orders',(stats?.orders ?? 0)],['Donations',(stats?.donations ?? 0)],['Customers',(stats?.customers ?? 0)],['Revenue',`₹${(stats?.revenue ?? 0)}`],['Donated',`₹${(stats?.donationTotal ?? 0)}`]].map(([t,v]:any)=><div key={t} className="rounded-3xl border bg-white p-6"><div className="mt-3 text-3xl font-extrabold">{v}</div><div className="mt-1 text-sm text-neutral-500">{t}</div></div>)}</div><div className="mt-6 grid gap-4 md:grid-cols-2"><div className="rounded-3xl border bg-white p-6"><h2 className="font-bold">Connected workflows</h2><div className="mt-5 space-y-3">{['WhatsApp Cloud API','AI assistant + knowledge base','Razorpay payments','Order + inventory management','Shiprocket shipment tracking','Human support handover'].map(x=><div className="rounded-xl bg-neutral-100 p-3 text-sm font-semibold" key={x}>{x}</div>)}</div></div><div className="rounded-3xl border bg-white p-6"><h2 className="font-bold">Production checklist</h2><p className="mt-3 text-sm leading-6 text-neutral-500">Set real provider credentials, set MOCK_PROVIDERS=false, deploy API and web, run Prisma migrations and seed once, then configure Meta/Razorpay/Shiprocket webhooks.</p></div></div></>}

 {tab==='products'&&<div className="rounded-3xl border bg-white p-6"><div className="mb-5 flex justify-between"><h2 className="font-bold">Product catalogue</h2><button onClick={addProduct} className="btn btn-dark"><Plus size={16}/> Add product</button></div><div className="space-y-3">{products.map(p=><ProductRow key={p.id} p={p} onSave={saveProduct}/>)}</div></div>}

 {tab==='orders'&&<div className="space-y-3">{orders.map(o=><div key={o.id} className="rounded-3xl border bg-white p-5"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><b>{o.orderNumber}</b><div className="mt-1 text-sm text-neutral-500">{o.user?.name||o.user?.phone} · ₹{o.total}</div></div><div className="flex gap-2 text-xs font-bold"><span className="rounded-full bg-neutral-100 px-3 py-2">{o.paymentStatus}</span><span className="rounded-full bg-neutral-100 px-3 py-2">{o.status}</span>{o.paymentStatus==='PAID'&&o.status!=='SHIPPED'&&o.status!=='DELIVERED'&&<button className="btn btn-dark py-2" onClick={()=>ship(o.id)}>Create shipment</button>}</div></div><div className="mt-4 text-sm text-neutral-600">{o.items.map((i:any)=><div key={i.id}>{i.product.name} × {i.quantity}</div>)}</div>{o.awb&&<div className="mt-3 text-sm">AWB: <b>{o.awb}</b> · {o.courier}</div>}</div>)}</div>}

 {tab==='donations'&&<div className="space-y-3">{donations.map(d=><div key={d.id} className="rounded-3xl border bg-white p-5 flex justify-between"><div><b>{d.reference}</b><div className="text-sm text-neutral-500">{d.user?.name||d.user?.phone}</div></div><div className="text-right"><b>₹{d.amount}</b><div className="text-xs">{d.paymentStatus}</div></div></div>)}</div>}

 {tab==='customers'&&<div className="overflow-x-auto rounded-3xl border bg-white"><table className="w-full text-left text-sm"><thead className="border-b bg-neutral-50"><tr><th className="p-4">Customer</th><th>Phone</th><th>Orders</th><th>Donations</th><th>Conversations</th></tr></thead><tbody>{customers.map(c=><tr className="border-b last:border-0" key={c.id}><td className="p-4 font-semibold">{c.name||'—'}</td><td>{c.phone}</td><td>{c._count.orders}</td><td>{c._count.donations}</td><td>{c._count.conversations}</td></tr>)}</tbody></table></div>}

 {tab==='conversations'&&<div className="space-y-3">{convos.map(c=><div key={c.id} className="rounded-3xl border bg-white p-5"><div className="flex flex-col justify-between gap-3 md:flex-row"><div><b>{c.user.name||c.user.phone}</b><div className="mt-1 text-xs text-neutral-400">{c.messages?.length||0} recent messages</div></div><div className="flex gap-2"><span className="rounded-full bg-neutral-100 px-3 py-2 text-xs font-bold">{c.mode}</span>{c.mode!=='HUMAN'&&<button onClick={()=>mode(c.id,'HUMAN')} className="btn btn-dark py-2">Take over</button>}{c.mode==='HUMAN'&&<button onClick={()=>mode(c.id,'AI')} className="btn btn-light py-2">Return to AI</button>}</div></div><div className="mt-4 space-y-2">{c.messages?.slice(0,6).reverse().map((m:any)=><div key={m.id} className="rounded-xl bg-neutral-100 p-3 text-sm"><b>{m.direction==='IN'?'Customer':'Assistant'}:</b> {m.text}</div>)}<ReplyBox id={c.id} reload={load}/></div></div>)}</div>}

 {tab==='knowledge'&&<Knowledge docs={knowledge} reload={load}/>}

 {tab==='gallery'&&<GalleryAdmin images={gallery} reload={load}/>}

 {tab==='posters'&&<PosterAdmin posters={posters} reload={load}/>} 

 </div></section></main>}

function ProductRow({p,onSave}:{p:any;onSave:(p:any)=>void}){const [x,setX]=useState(p);return <div className="rounded-2xl border p-4"><div className="grid gap-3 md:grid-cols-5"><input className="input" value={x.name} onChange={e=>setX({...x,name:e.target.value})}/><input className="input" value={x.price} type="number" onChange={e=>setX({...x,price:Number(e.target.value)})}/><input className="input" value={x.stock} type="number" onChange={e=>setX({...x,stock:Number(e.target.value)})}/><input className="input" value={x.category||''} onChange={e=>setX({...x,category:e.target.value})}/><button className="btn btn-dark" onClick={()=>onSave(x)}><Save size={15}/> Save</button></div><textarea className="input mt-3" value={x.description} onChange={e=>setX({...x,description:e.target.value})}/></div>}

function ReplyBox({id,reload}:{id:string;reload:()=>void}){const [text,setText]=useState('');async function send(){if(!text.trim())return;try{await api(`/api/admin/conversations/${id}/reply`,{method:'POST',body:JSON.stringify({text})});setText('');reload()}catch(e:any){alert(e.message)}}return <div className="mt-4 flex gap-2"><input className="input" value={text} onChange={e=>setText(e.target.value)} placeholder="Reply to customer on WhatsApp…"/><button className="btn btn-dark" onClick={send}>Send</button></div>}

function Knowledge({docs,reload}:{docs:any[];reload:()=>void}){const [title,setTitle]=useState(''),[content,setContent]=useState('');async function add(){if(!title||!content)return;await api('/api/admin/knowledge',{method:'POST',body:JSON.stringify({title,content})});setTitle('');setContent('');reload()}return <div className="grid gap-5 lg:grid-cols-2"><div className="rounded-3xl border bg-white p-6"><h2 className="font-bold">Add Trust knowledge</h2><input className="input mt-4" placeholder="Document title" value={title} onChange={e=>setTitle(e.target.value)}/><textarea className="input mt-3 min-h-48" placeholder="Official Trust information, FAQs, policies, product/shipping details…" value={content} onChange={e=>setContent(e.target.value)}/><button className="btn btn-dark mt-3" onClick={add}>Save knowledge</button></div><div className="space-y-3">{docs.map(d=><div key={d.id} className="rounded-3xl border bg-white p-5"><b>{d.title}</b><p className="mt-2 whitespace-pre-wrap text-sm text-neutral-600">{d.content}</p></div>)}</div></div>}





async function uploadImage(file: File): Promise<{ imageUrl: string } | null> {

  if (!['image/png','image/jpeg','image/webp'].includes(file.type)) throw new Error('PNG, JPG ya WebP image select karein.');

  if (file.size > 7 * 1024 * 1024) throw new Error('Image 7 MB se chhoti honi chahiye.');

  const dataUrl = await new Promise<string>((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result));reader.onerror=()=>reject(new Error('Image read nahi ho paayi.'));reader.readAsDataURL(file)});

  return api<{imageUrl:string}>('/api/admin/media/upload',{method:'POST',body:JSON.stringify({dataUrl,fileName:file.name})});

}

function GalleryAdmin({images,reload}:{images:any[];reload:()=>void}) {

 const [title,setTitle]=useState('Sangat Gallery'),[alt,setAlt]=useState(''),[file,setFile]=useState<File|null>(null),[busy,setBusy]=useState(false);

 async function add(){if(!file){alert('Pehle image select karein.');return}setBusy(true);try{const uploaded=await uploadImage(file);const imageUrl=uploaded?.imageUrl;if(!imageUrl)throw new Error('Image upload did not return an image URL.');await api('/api/admin/gallery',{method:'POST',body:JSON.stringify({title,altText:alt,imageUrl})});setFile(null);setAlt('');reload()}catch(e:any){alert(e.message)}finally{setBusy(false)}}

 async function remove(id:string){if(!confirm('Is gallery image ko delete karna hai?'))return;await api(`/api/admin/gallery/${id}`,{method:'DELETE'});reload()}

 return <div className="rounded-3xl border bg-white p-5 md:p-7"><h2 className="text-xl font-bold">Gallery images</h2><p className="mt-1 text-sm text-neutral-500">Sangat, kirtan aur Trust programmes ki photos yahan upload karein. Upload ki gayi photos public Gallery page par dikhengi.</p><div className="mt-5 grid gap-3 md:grid-cols-3"><input className="input" value={title} onChange={e=>setTitle(e.target.value)} placeholder="Image title"/><input className="input" value={alt} onChange={e=>setAlt(e.target.value)} placeholder="Alt text (optional)"/><input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/></div><button className="btn btn-dark mt-3" disabled={busy} onClick={add}>{busy?'Uploading…':'Upload to Gallery'}</button><div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{images.map(im=><div className="overflow-hidden rounded-2xl border" key={im.id}><img src={im.imageUrl} alt={im.altText||im.title} className="h-52 w-full object-cover"/><div className="flex items-center justify-between gap-2 p-3"><div className="min-w-0"><b className="block truncate text-sm">{im.title}</b><span className="text-xs text-neutral-500">{im.active?'Published':'Hidden'}</span></div><button className="btn btn-light" onClick={()=>remove(im.id)}>Delete</button></div></div>)}</div>{!images.length&&<p className="mt-6 text-sm text-neutral-400">Abhi gallery mein koi image nahi hai.</p>}</div>

}

function PosterAdmin({posters,reload}:{posters:any[];reload:()=>void}) {

 const [title,setTitle]=useState(''),[description,setDescription]=useState(''),[eventDate,setEventDate]=useState(''),[venue,setVenue]=useState(''),[file,setFile]=useState<File|null>(null),[featured,setFeatured]=useState(true),[busy,setBusy]=useState(false);

 async function add(){if(!title.trim()||!file){alert('Poster title aur image dono zaroori hain.');return}setBusy(true);try{const uploaded=await uploadImage(file);const imageUrl=uploaded?.imageUrl;if(!imageUrl)throw new Error('Image upload did not return an image URL.');await api('/api/admin/posters',{method:'POST',body:JSON.stringify({title,description,eventDate,venue,imageUrl,featured,active:true})});setTitle('');setDescription('');setEventDate('');setVenue('');setFile(null);reload()}catch(e:any){alert(e.message)}finally{setBusy(false)}}

 async function toggle(p:any){await api(`/api/admin/posters/${p.id}`,{method:'PATCH',body:JSON.stringify({...p,featured:!p.featured})});reload()}

 async function remove(id:string){if(!confirm('Is event poster ko delete karna hai?'))return;await api(`/api/admin/posters/${id}`,{method:'DELETE'});reload()}

 return <div className="rounded-3xl border bg-white p-5 md:p-7"><h2 className="text-xl font-bold">Upcoming events & posters</h2><p className="mt-1 text-sm text-neutral-500">Naya event aane par yahan poster upload karein. Featured poster homepage par show hoga; purane posters ko delete ya unfeatured kar sakte hain.</p><div className="mt-5 grid gap-3 md:grid-cols-2"><input className="input" placeholder="Event title *" value={title} onChange={e=>setTitle(e.target.value)}/><input className="input" placeholder="Event date (e.g. 15 Oct – 24 Nov 2026)" value={eventDate} onChange={e=>setEventDate(e.target.value)}/><input className="input" placeholder="Venue" value={venue} onChange={e=>setVenue(e.target.value)}/><input className="input" type="file" accept="image/png,image/jpeg,image/webp" onChange={e=>setFile(e.target.files?.[0]||null)}/><textarea className="input md:col-span-2" placeholder="Short event description (optional)" value={description} onChange={e=>setDescription(e.target.value)}/></div><label className="mt-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={featured} onChange={e=>setFeatured(e.target.checked)}/> Set as featured homepage poster</label><button className="btn btn-dark mt-3" disabled={busy} onClick={add}>{busy?'Uploading…':'Publish event poster'}</button><div className="mt-7 grid gap-5 md:grid-cols-2">{posters.map(p=><div className="overflow-hidden rounded-2xl border" key={p.id}><img src={p.imageUrl} alt={p.title} className="max-h-[420px] w-full bg-neutral-100 object-contain"/><div className="p-4"><b>{p.title}</b><p className="mt-1 text-sm text-neutral-500">{[p.eventDate,p.venue].filter(Boolean).join(' · ')}</p><div className="mt-3 flex flex-wrap gap-2"><button className="btn btn-light" onClick={()=>toggle(p)}>{p.featured?'Featured on homepage':'Feature on homepage'}</button><button className="btn btn-light" onClick={()=>remove(p.id)}>Delete</button></div></div></div>)}</div>{!posters.length&&<p className="mt-6 text-sm text-neutral-400">Abhi koi event poster publish nahi hua.</p>}</div>

}
