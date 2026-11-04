import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordInput from '../components/PasswordInput';
import ProductsAdmin from '../app/admin/ProductsAdmin';
import SupportInbox from '../app/admin/SupportInbox';
import AccountSettings from '../app/admin/AccountSettings';
import DocumentsAdmin from '../app/admin/DocumentsAdmin';
import TrustsAdmin from '../app/admin/TrustsAdmin';
import SocialAdmin from '../app/admin/SocialAdmin';
import Assistant from '../components/Assistant';
import { api, ApiError } from '../lib/api';

type Call = { url: string; method: string; body: any };
let calls: Call[] = [];
let routes: Record<string, (body: any) => { status?: number; json?: any }> = {};

function mockFetch() {
  calls = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: any = {}) => {
    const path = String(url).replace('https://api.test', '');
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(init.body) : undefined;
    calls.push({ url: path, method, body });
    const key = Object.keys(routes).find((k) => `${method} ${path}`.startsWith(k));
    const out = key ? routes[key](body) : { status: 404, json: { error: 'not mocked ' + path } };
    const status = out.status ?? 200;
    return { ok: status < 400, status, text: async () => JSON.stringify(out.json ?? {}), json: async () => out.json ?? {} } as any;
  }));
}
beforeEach(() => { routes = {}; mockFetch(); });

describe('api helper', () => {
  it('turns {"error": "..."} into a readable message, never raw JSON', async () => {
    routes['GET /x'] = () => ({ status: 409, json: { error: 'Is naam ka product pehle se maujood hai.' } });
    await expect(api('/x')).rejects.toMatchObject({ message: 'Is naam ka product pehle se maujood hai.', status: 409 });
    await expect(api('/x')).rejects.toBeInstanceOf(ApiError);
  });
});

describe('PasswordInput (show password)', () => {
  it('is hidden by default and toggles visible/hidden', async () => {
    const onChange = vi.fn();
    render(<PasswordInput value="secret123" onChange={onChange} />);
    const input = screen.getByPlaceholderText('Password') as HTMLInputElement;
    expect(input.type).toBe('password');
    await userEvent.click(screen.getByRole('button', { name: /show password/i }));
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: /hide password/i })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /hide password/i }));
    expect(input.type).toBe('password');
  });
});

describe('ProductsAdmin form', () => {
  it('explains every field and blocks bad input with a specific message', async () => {
    const reload = vi.fn();
    render(<ProductsAdmin products={[]} reload={reload} />);
    await userEvent.click(screen.getByRole('button', { name: /new product/i }));
    expect(screen.getByText(/Product name/)).toBeInTheDocument();
    expect(screen.getByText(/Price \(₹, whole rupees\)/)).toBeInTheDocument();
    expect(screen.getByText(/Stock \(pieces available\)/)).toBeInTheDocument();
    expect(screen.getByText(/Customers type this name on WhatsApp/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /add product/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/product name/i);
    await userEvent.type(screen.getByPlaceholderText('e.g. Nariyal'), 'Nariyal');
    await userEvent.click(screen.getByRole('button', { name: /add product/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/price/i);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('only accepts digits in price/stock and posts a clean payload', async () => {
    routes['POST /api/admin/products'] = () => ({ status: 201, json: { id: 'p1' } });
    const reload = vi.fn();
    render(<ProductsAdmin products={[]} reload={reload} />);
    await userEvent.click(screen.getByRole('button', { name: /new product/i }));
    await userEvent.type(screen.getByPlaceholderText('e.g. Nariyal'), '  Nariyal ');
    await userEvent.type(screen.getByPlaceholderText('e.g. 100'), '1a0b0');
    await userEvent.type(screen.getByPlaceholderText('e.g. 25'), '4x0');
    await userEvent.click(screen.getByRole('button', { name: /add product/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ name: 'Nariyal', price: 100, stock: 40, active: true, imageUrl: '' });
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent(/product saved/i);
  });

  it('shows the server message (e.g. duplicate name) inside the form', async () => {
    routes['POST /api/admin/products'] = () => ({ status: 409, json: { error: 'A product with this name already exists. Please use a different name.' } });
    render(<ProductsAdmin products={[]} reload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /new product/i }));
    await userEvent.type(screen.getByPlaceholderText('e.g. Nariyal'), 'Nariyal');
    await userEvent.type(screen.getByPlaceholderText('e.g. 100'), '100');
    await userEvent.type(screen.getByPlaceholderText('e.g. 25'), '5');
    await userEvent.click(screen.getByRole('button', { name: /add product/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already exists/);
  });

  it('lists products with photo/stock badges and hides/shows via PATCH', async () => {
    routes['PATCH /api/admin/products/p1'] = () => ({ json: {} });
    const reload = vi.fn();
    const products = [
      { id: 'p1', name: 'Nariyal', description: 'Add product description', price: 100, stock: 0, category: null, imageUrl: null, active: true },
      { id: 'p2', name: 'Mala', description: '', price: 10, stock: 3, category: 'Pooja', imageUrl: 'https://x/y.jpg', active: false },
    ];
    render(<ProductsAdmin products={products} reload={reload} />);
    expect(screen.getByText('Out of stock')).toBeInTheDocument();
    expect(screen.getByText('Stock: 3')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument();
    expect(screen.getByText('No photo')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /hide/i })[0]);
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ active: false }));
  });

  it('edit form is prefilled and the placeholder description is blanked', async () => {
    render(<ProductsAdmin products={[{ id: 'p1', name: 'Nariyal', description: 'Add product description', price: 100, stock: 7, category: null, imageUrl: null, active: true }]} reload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByDisplayValue('Nariyal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Write about the product/)).toHaveValue('');
  });
});

describe('SupportInbox', () => {
  const conv = { id: 'c1', mode: 'HUMAN', channel: 'WHATSAPP', lastMessageAt: new Date().toISOString(), user: { id: 'u1', name: 'Surya', phone: '919876500001' }, lastMessage: { text: 'Mera order?', direction: 'IN', createdAt: new Date().toISOString() }, openTickets: 1, awaitingReply: true };
  const thread = { id: 'c1', mode: 'HUMAN', channel: 'WHATSAPP', user: conv.user, messages: [{ id: 'm1', direction: 'IN', text: 'Mera order?', createdAt: new Date().toISOString() }] };

  it('lists chats, opens one, sends a reply with Enter, and clears the box', async () => {
    routes['GET /api/admin/conversations/c1/messages'] = () => ({ json: thread });
    routes['GET /api/admin/conversations'] = () => ({ json: [conv] });
    routes['POST /api/admin/conversations/c1/reply'] = () => ({ status: 201, json: { ok: true } });
    render(<SupportInbox />);
    expect(await screen.findByText('Needs reply', { selector: 'span' })).toBeInTheDocument();
    await userEvent.click(await screen.findByText('Surya'));
    const box = await screen.findByPlaceholderText(/Write a reply/);
    await userEvent.type(box, 'Namaste, check kar rahe hain{Enter}');
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/reply'))?.body).toEqual({ text: 'Namaste, check kar rahe hain' }));
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('shows the real server reason when sending fails (e.g. 24h WhatsApp window) and keeps the typed text', async () => {
    routes['GET /api/admin/conversations/c1/messages'] = () => ({ json: thread });
    routes['GET /api/admin/conversations'] = () => ({ json: [conv] });
    routes['POST /api/admin/conversations/c1/reply'] = () => ({ status: 409, json: { error: 'This customer has not messaged in the last 24 hours.' } });
    render(<SupportInbox />);
    await userEvent.click(await screen.findByText('Surya'));
    const box = await screen.findByPlaceholderText(/Write a reply/);
    await userEvent.type(box, 'hello');
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/24 hours/);
    expect(box).toHaveValue('hello');
  });

  it('Send is disabled for empty text', async () => {
    routes['GET /api/admin/conversations/c1/messages'] = () => ({ json: thread });
    routes['GET /api/admin/conversations'] = () => ({ json: [conv] });
    render(<SupportInbox />);
    await userEvent.click(await screen.findByText('Surya'));
    expect(await screen.findByRole('button', { name: /^send$/i })).toBeDisabled();
  });
});

describe('AccountSettings', () => {
  it('validates before calling the API, then changes password and stores the fresh token', async () => {
    routes['GET /api/auth/me'] = () => ({ json: { email: 'owner@trust.org' } });
    routes['POST /api/auth/change-password'] = () => ({ json: { message: 'Your password has been changed.', token: 'NEW.TOKEN' } });
    render(<AccountSettings />);
    expect(await screen.findByText('owner@trust.org')).toBeInTheDocument();
    const pw = screen.getAllByPlaceholderText('Current password')[0];
    await userEvent.type(pw, 'Old-password-123');
    await userEvent.type(screen.getByPlaceholderText('New password'), 'short');
    await userEvent.type(screen.getByPlaceholderText('Repeat new password'), 'short');
    await userEvent.click(screen.getAllByRole('button', { name: /^change password$/i })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent(/10 characters/);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.clear(screen.getByPlaceholderText('New password')); await userEvent.clear(screen.getByPlaceholderText('Repeat new password'));
    await userEvent.type(screen.getByPlaceholderText('New password'), 'Brand-new-pass-9');
    await userEvent.type(screen.getByPlaceholderText('Repeat new password'), 'Brand-new-pass-0');
    await userEvent.click(screen.getAllByRole('button', { name: /^change password$/i })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/);
    await userEvent.clear(screen.getByPlaceholderText('Repeat new password')); await userEvent.type(screen.getByPlaceholderText('Repeat new password'), 'Brand-new-pass-9');
    await userEvent.click(screen.getAllByRole('button', { name: /^change password$/i })[0]);
    await waitFor(() => expect(localStorage.getItem('trust_token')).toBe('NEW.TOKEN'));
    expect(calls.find((c) => c.url === '/api/auth/change-password')!.body).toEqual({ currentPassword: 'Old-password-123', newPassword: 'Brand-new-pass-9' });
  });

  it('change email: needs valid email + password, shows duplicate error from server', async () => {
    routes['GET /api/auth/me'] = () => ({ json: { email: 'owner@trust.org' } });
    routes['POST /api/auth/change-email'] = () => ({ status: 409, json: { error: 'This email is already used by another admin account.' } });
    render(<AccountSettings />);
    await userEvent.type(screen.getByPlaceholderText('New email address'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: /^change email$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid email/i);
    await userEvent.clear(screen.getByPlaceholderText('New email address')); await userEvent.type(screen.getByPlaceholderText('New email address'), 'staff@trust.org');
    await userEvent.type(screen.getByPlaceholderText(/Current password \(to confirm/), 'Old-password-123');
    await userEvent.click(screen.getByRole('button', { name: /^change email$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/already used/);
  });
});

describe('Assistant widget (website chat)', () => {
  const now = () => new Date().toISOString();
  const langChips = [{ id: 'lang:en', title: 'English' }, { id: 'lang:hi', title: 'हिन्दी (Hindi)' }, { id: 'lang:hing', title: 'Hinglish' }, { id: 'lang:pa', title: 'ਪੰਜਾਬੀ (Punjabi)' }, { id: 'lang:mr', title: 'मराठी (Marathi)' }];

  it('asks for name + 10-digit number, then the bot greets with the language picker; tapping a chip sends its replyId', async () => {
    routes['POST /api/assistant'] = (b) => {
      if (b.replyId === 'lang:hi') return { json: { conversationId: 'conv1', mode: 'AI', text: 'भाषा हिन्दी चुन ली गई है ✅\n\nमैं आपकी क्या सहायता कर सकता हूँ?', options: [{ id: 'menu:donate', title: 'दान करें' }, { id: 'menu:products', title: 'हमारे उत्पाद' }], now: now() } };
      if (b.message === 'Nariyal order') return { json: { conversationId: 'conv1', mode: 'AI', text: 'Nariyal x 1 — ₹100.\nPay: https://rzp.io/rzp/abc.', image: { url: 'https://img/n.jpg' }, options: null, now: now() } };
      return { json: { conversationId: 'conv1', mode: 'AI', text: 'Namaste! Welcome to Amrit Vela Trust.\nPlease select your preferred language.', options: langChips, now: now() } };
    };
    routes['GET /api/assistant/poll'] = () => ({ json: { mode: 'AI', messages: [], now: now() } });
    render(<Assistant floating={false} />);
    await userEvent.type(screen.getByPlaceholderText('Your name'), 'Surya');
    await userEvent.type(screen.getByPlaceholderText('10-digit mobile number'), '12345');
    await userEvent.click(screen.getByRole('button', { name: /start chat/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/10-digit/);
    await userEvent.clear(screen.getByPlaceholderText('10-digit mobile number')); await userEvent.type(screen.getByPlaceholderText('10-digit mobile number'), '+91 98765 00001');
    await userEvent.click(screen.getByRole('button', { name: /start chat/i }));
    // the first message is the bot's own welcome + language chips (sent silently as "hello")
    expect(await screen.findByText(/Welcome to Amrit Vela Trust/)).toBeInTheDocument();
    expect(calls.find((c) => c.url === '/api/assistant')!.body).toMatchObject({ phone: '9876500001', name: 'Surya', message: 'hello' });
    for (const l of ['English', 'हिन्दी (Hindi)', 'Hinglish', 'ਪੰਜਾਬੀ (Punjabi)', 'मराठी (Marathi)']) expect(screen.getByRole('button', { name: l })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'हिन्दी (Hindi)' }));
    expect(await screen.findByText(/भाषा हिन्दी चुन ली गई है/)).toBeInTheDocument();
    expect(calls.filter((c) => c.url === '/api/assistant').at(-1)!.body).toMatchObject({ message: 'हिन्दी (Hindi)', replyId: 'lang:hi' });
    expect(screen.getByRole('button', { name: 'दान करें' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Hinglish' })).toBeNull(); // old chips disappear once used
    await userEvent.type(screen.getByPlaceholderText('Type your message…'), 'Nariyal order{Enter}');
    const link = await screen.findByRole('link', { name: 'https://rzp.io/rzp/abc' });
    expect(link).toHaveAttribute('target', '_blank');
    expect(document.querySelector('img[src="https://img/n.jpg"]')).toBeTruthy();
    expect(localStorage.getItem('trust_chat_conversation')).toBe('conv1');
  });

  it('shows the human-handover note, and an admin reply that arrives by polling (no duplicates)', async () => {
    localStorage.setItem('trust_chat_profile', JSON.stringify({ name: 'S', phone: '9876500001' }));
    localStorage.setItem('trust_chat_conversation', 'c9');
    routes['GET /api/assistant/history'] = () => ({ json: { mode: 'AI', now: now(), messages: [{ id: 'h1', role: 'assistant', text: 'Hi again', createdAt: now() }] } });
    routes['POST /api/assistant'] = () => ({ json: { conversationId: 'c9', mode: 'HUMAN', held: true, text: '', now: now() } });
    let n = 0;
    routes['GET /api/assistant/poll'] = () => ({ json: { mode: 'HUMAN', now: now(), messages: n++ < 5 ? [{ id: 'adm1', text: 'Namaste, main yahan hoon.', createdAt: now() }] : [] } });
    vi.useFakeTimers({ shouldAdvanceTime: true });
    render(<Assistant floating={false} />);
    expect(await screen.findByText('Hi again')).toBeInTheDocument();
    const box = await screen.findByPlaceholderText('Type your message…');
    fireEvent.change(box, { target: { value: 'koi hai?' } });
    fireEvent.submit(box.closest('form')!);
    expect(await screen.findByText(/reached the Trust team/)).toBeInTheDocument();
    await vi.advanceTimersByTimeAsync(7100); await vi.advanceTimersByTimeAsync(7100);
    expect(await screen.findAllByText('Namaste, main yahan hoon.')).toHaveLength(1);
    vi.useRealTimers();
  });

  it('shows the API message for 4xx and a friendly line when the server is down', async () => {
    localStorage.setItem('trust_chat_profile', JSON.stringify({ name: 'S', phone: '9876500001' }));
    localStorage.setItem('trust_chat_conversation', 'c1');
    routes['GET /api/assistant/history'] = () => ({ json: { mode: 'AI', now: now(), messages: [{ id: 'h1', role: 'assistant', text: 'Hello', createdAt: now() }] } });
    routes['POST /api/assistant'] = () => ({ status: 429, json: { error: 'Bahut zyada messages. Thodi der baad try karein.' } });
    render(<Assistant floating={false} />);
    await userEvent.type(await screen.findByPlaceholderText('Type your message…'), 'hi{Enter}');
    expect(await screen.findByText(/Bahut zyada messages/)).toBeInTheDocument();
    routes['POST /api/assistant'] = () => ({ status: 500, json: { error: 'boom internal' } });
    await userEvent.type(screen.getByPlaceholderText('Type your message…'), 'hello{Enter}');
    expect(await screen.findByText(/Could not connect to the assistant/)).toBeInTheDocument();
    expect(screen.queryByText(/boom internal/)).toBeNull();
  });
});


describe('DocumentsAdmin (PDF uploads for the WhatsApp Downloads list)', () => {
  const docs = [
    { id: 'd1', title: 'Trust Brochure', description: 'About our seva', fileName: 'brochure.pdf', size: 204800, active: true, sortOrder: 0, downloads: 3 },
    { id: 'd2', title: 'Donation Form', description: null, fileName: 'form.pdf', size: 1024, active: false, sortOrder: 1, downloads: 0 },
  ];

  it('lists documents with size, downloads and hidden state; toggles visibility', async () => {
    routes['GET /api/admin/documents'] = () => ({ json: docs });
    routes['PATCH /api/admin/documents/d1'] = () => ({ json: {} });
    render(<DocumentsAdmin />);
    expect(await screen.findByText('Trust Brochure')).toBeInTheDocument();
    expect(screen.getByText(/brochure\.pdf · 200 KB · 3 downloads/)).toBeInTheDocument();
    expect(screen.getByText(/form\.pdf · 1 KB · 0 downloads · Hidden from customers/)).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /^hide$/i })[0]);
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ active: false }));
  });

  it('validates the form, then uploads the PDF as a data URL with its file name', async () => {
    routes['GET /api/admin/documents'] = () => ({ json: [] });
    routes['POST /api/admin/documents'] = () => ({ status: 201, json: { id: 'new' } });
    render(<DocumentsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /upload pdf/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/enter a title/i);
    await userEvent.type(screen.getByPlaceholderText('e.g. Trust Brochure'), 'Brochure');
    await userEvent.click(screen.getByRole('button', { name: /upload pdf/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a pdf/i);
    const file = new File(['%PDF-1.4 test'], 'my brochure.pdf', { type: 'application/pdf' });
    await userEvent.upload(document.querySelector('input[type=file]') as HTMLInputElement, file);
    await userEvent.click(screen.getByRole('button', { name: /upload pdf/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    const body = calls.find((c) => c.method === 'POST')!.body;
    expect(body).toMatchObject({ title: 'Brochure', fileName: 'my brochure.pdf' });
    expect(body.dataUrl).toMatch(/^data:application\/pdf;base64,/);
    expect(await screen.findByRole('status')).toHaveTextContent(/Downloads \(PDF\)/);
  });

  it('rejects non-PDF files before uploading and shows the API error for bad PDFs', async () => {
    routes['GET /api/admin/documents'] = () => ({ json: [] });
    routes['POST /api/admin/documents'] = () => ({ status: 400, json: { error: 'This file is not a valid PDF.' } });
    render(<DocumentsAdmin />);
    await userEvent.type(await screen.findByPlaceholderText('e.g. Trust Brochure'), 'X1');
    const input = document.querySelector('input[type=file]') as HTMLInputElement;
    fireEvent.change(input, { target: { files: [new File(['x'], 'photo.png', { type: 'image/png' })] } });
    await userEvent.click(screen.getByRole('button', { name: /upload pdf/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/choose a pdf file/i);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    fireEvent.change(input, { target: { files: [new File(['not really'], 'fake.pdf', { type: 'application/pdf' })] } });
    await userEvent.click(screen.getByRole('button', { name: /upload pdf/i }));
    expect(await screen.findByText(/not a valid PDF/)).toBeInTheDocument();
  });
});

describe('TrustsAdmin (Nanak Roti Trust + donation QR)', () => {
  const draft = { id: 't1', slug: 'nanak-roti-trust', name: 'Nanak Roti Trust', active: false, sortOrder: 0, infoEn: '', infoHi: null, infoHing: null, infoPa: null, qrImageUrl: null, upiId: null, contactPhone: null, contactEmail: null };

  it('shows the hidden draft with a "No QR code" warning', async () => {
    routes['GET /api/admin/trusts'] = () => ({ json: [draft] });
    render(<TrustsAdmin />);
    expect(await screen.findByText('Nanak Roti Trust')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument(); expect(screen.getByText('No QR code')).toBeInTheDocument(); expect(screen.getByText('No information written yet.')).toBeInTheDocument();
  });

  it('will not make a trust visible without English information; then saves everything with the 4 languages and UPI id', async () => {
    routes['GET /api/admin/trusts'] = () => ({ json: [draft] });
    routes['PATCH /api/admin/trusts/t1'] = () => ({ json: {} });
    render(<TrustsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(screen.getByText(/Donation QR code \(PhonePe \/ any UPI app\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Visible to customers/));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/information in English/i);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    await userEvent.type(screen.getByLabelText(/Information \(English\)/), 'Free roti seva every day.');
    await userEvent.type(screen.getByLabelText(/Information \(Hindi\)/), 'रोज़ मुफ़्त रोटी सेवा।');
    await userEvent.type(screen.getByLabelText(/UPI ID/), 'nanak@oksbi');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ name: 'Nanak Roti Trust', active: true, infoEn: 'Free roti seva every day.', infoHi: 'रोज़ मुफ़्त रोटी सेवा।', upiId: 'nanak@oksbi', qrImageUrl: '' });
  });

  it('shows the server validation message (e.g. bad UPI id) inside the form', async () => {
    routes['GET /api/admin/trusts'] = () => ({ json: [{ ...draft, infoEn: 'Some information here.' }] });
    routes['PATCH /api/admin/trusts/t1'] = () => ({ status: 400, json: { error: 'Enter a valid UPI ID, for example name@oksbi' } });
    render(<TrustsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await userEvent.type(screen.getByLabelText(/UPI ID/), 'bad id');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/valid UPI ID/);
  });
});

describe('SocialAdmin (Instagram / Facebook / WhatsApp group links)', () => {
  it('loads saved links, validates https before calling the API, saves, and shows server errors', async () => {
    routes['GET /api/admin/settings/social'] = () => ({ json: { instagram: 'https://www.instagram.com/trust/' } });
    routes['PUT /api/admin/settings/social'] = (b) => (String(b.facebook).includes('instagram.com') ? { status: 400, json: { error: 'Facebook: this does not look like a Facebook link (instagram.com).' } } : { json: b });
    render(<SocialAdmin />);
    expect(await screen.findByDisplayValue('https://www.instagram.com/trust/')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Facebook page link/), 'facebook.com/page');
    await userEvent.click(screen.getByRole('button', { name: /save links/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/must start with https/);
    expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await userEvent.clear(screen.getByLabelText(/Facebook page link/)); await userEvent.type(screen.getByLabelText(/Facebook page link/), 'https://www.instagram.com/oops');
    await userEvent.click(screen.getByRole('button', { name: /save links/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/does not look like a Facebook link/);
    await userEvent.clear(screen.getByLabelText(/Facebook page link/)); await userEvent.type(screen.getByLabelText(/Facebook page link/), 'https://www.facebook.com/trust');
    await userEvent.type(screen.getByLabelText(/WhatsApp group/), 'https://chat.whatsapp.com/AbCd1234');
    await userEvent.click(screen.getByRole('button', { name: /save links/i }));
    expect(await screen.findByRole('status')).toHaveTextContent(/Follow us/);
    expect(calls.filter((c) => c.method === 'PUT').at(-1)!.body).toMatchObject({ instagram: 'https://www.instagram.com/trust/', facebook: 'https://www.facebook.com/trust', whatsappGroup: 'https://chat.whatsapp.com/AbCd1234' });
  });
});
