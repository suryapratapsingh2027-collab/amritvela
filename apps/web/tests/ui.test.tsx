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
import RoomsAdmin from '../app/admin/RoomsAdmin';
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
    expect((await screen.findAllByText('owner@trust.org')).length).toBeGreaterThan(0);
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
  const draft = { id: 't1', slug: 'nanak-roti-trust', name: 'Nanak Roti Trust', active: false, sortOrder: 0, infoEn: '', infoHi: null, infoHing: null, infoPa: null, qrImageUrl: null, upiId: null, contactPhone: null, contactEmail: null, accountMode: 'DEFAULT', razorpayKeyId: null, hasKeySecret: false, hasWebhookSecret: false, offerQr: true, presets: [] };

  it('shows the hidden draft with a "No QR code" warning', async () => {
    routes['GET /api/admin/trusts'] = () => ({ json: [draft] });
    render(<TrustsAdmin />);
    expect(await screen.findByText('Nanak Roti Trust')).toBeInTheDocument();
    expect(screen.getByText('Hidden')).toBeInTheDocument(); expect(screen.getByText('No QR code')).toBeInTheDocument(); expect(screen.getByText('No information written yet.')).toBeInTheDocument();
  });

  it('rejects a too-short English text; then saves everything with the 4 languages, UPI id, account mode and a quick amount', async () => {
    routes['GET /api/admin/trusts'] = () => ({ json: [draft] });
    routes['PATCH /api/admin/trusts/t1'] = () => ({ json: {} });
    render(<TrustsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    expect(screen.getByText(/Donation QR code \(PhonePe \/ any UPI app\)/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText(/Visible to customers/));
    await userEvent.type(screen.getByLabelText(/Information \(English\)/), 'short');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 10 characters/i);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    await userEvent.clear(screen.getByLabelText(/Information \(English\)/));
    await userEvent.type(screen.getByLabelText(/Information \(English\)/), 'Free roti seva every day.');
    await userEvent.click(screen.getByRole('button', { name: /add quick amount/i }));
    await userEvent.type(screen.getByLabelText('Quick amount name'), 'One time langar');
    await userEvent.type(screen.getByLabelText('Quick amount'), '13000');
    await userEvent.type(screen.getByLabelText(/Information \(Hindi\)/), 'रोज़ मुफ़्त रोटी सेवा।');
    await userEvent.type(screen.getByLabelText(/UPI ID \(optional\)/), 'nanak@oksbi');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ accountMode: 'DEFAULT', presets: [{ label: 'One time langar', amount: 13000 }], name: 'Nanak Roti Trust', active: true, infoEn: 'Free roti seva every day.', infoHi: 'रोज़ मुफ़्त रोटी सेवा।', upiId: 'nanak@oksbi', qrImageUrl: '' });
  });

  it('shows the server validation message (e.g. bad UPI id) inside the form', async () => {
    routes['GET /api/admin/trusts'] = () => ({ json: [{ ...draft, infoEn: 'Some information here.' }] });
    routes['PATCH /api/admin/trusts/t1'] = () => ({ status: 400, json: { error: 'Enter a valid UPI ID, for example name@oksbi' } });
    render(<TrustsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await userEvent.type(screen.getByLabelText(/UPI ID \(optional\)/), 'bad id');
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

import DashboardAdmin from '../app/admin/DashboardAdmin';
import DonationsAdmin from '../app/admin/DonationsAdmin';
import DonorsAdmin from '../app/admin/DonorsAdmin';
import CampaignsAdmin from '../app/admin/CampaignsAdmin';
import LiveAdmin from '../app/admin/LiveAdmin';

const zeros = (n: number) => Array.from({ length: n }, (_, i) => ({ key: `2026-11-${String(i + 1).padStart(2, '0')}`, total: i === n - 1 ? 1500 : 0, count: i === n - 1 ? 2 : 0 }));
const dash = {
  totals: { allTime: { total: 25000, count: 40, average: 625, donors: 31 }, today: { total: 1500, count: 2 }, month: { total: 9000, count: 12 }, prevMonth: { total: 6000, count: 8 }, year: { total: 25000, count: 40 }, financialYear: { total: 22000, count: 35 }, monthGrowthPercent: 50, pending: { total: 700, count: 2 }, failed: 3 },
  daily: zeros(30), monthly: zeros(12).map((p, i) => ({ ...p, key: `2026-${String(i + 1).padStart(2, '0')}` })), yearly: [{ key: '2026', total: 25000, count: 40 }],
  topCampaigns: [{ id: 'c1', title: 'Langar Seva', target: 50000, raised: 20000 }],
  recent: [{ id: 'd1', reference: 'DON-1', receiptNumber: 'AVT/2026-27/000001', amount: 500, status: 'PAID', createdAt: '2026-11-12T10:00:00Z', paidAt: '2026-11-12T10:01:00Z', donor: 'Ramesh Kumar', campaign: 'Langar Seva' }],
};

describe('Round 6 admin: Dashboard', () => {
  it('shows totals, growth, top campaigns, recent donations and switches the chart period', async () => {
    routes['GET /api/admin/reports/dashboard'] = () => ({ json: dash });
    render(<DashboardAdmin />);
    expect((await screen.findAllByText('₹25,000')).length).toBeGreaterThan(0);
    expect(screen.getByText(/\+50% vs last month/)).toBeInTheDocument();
    expect(screen.getByText('Langar Seva', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('AVT/2026-27/000001')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /Donations, daily/ })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: '12 months' }));
    expect(screen.getByRole('img', { name: /Donations, monthly/ })).toBeInTheDocument();
  });
  it('shows a readable error with a retry when the dashboard fails', async () => {
    routes['GET /api/admin/reports/dashboard'] = () => ({ status: 500, json: { error: 'Database is down' } });
    render(<DashboardAdmin />);
    expect(await screen.findByText(/Database is down/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Try again/ })).toBeInTheDocument();
  });
});

describe('Round 6 admin: Donations + receipts', () => {
  const rows = [
    { id: 'd1', reference: 'DON-1', receiptNumber: 'AVT/2026-27/000001', amount: 500, paymentStatus: 'PAID', createdAt: '2026-11-12T10:00:00Z', paidAt: '2026-11-12T10:01:00Z', user: { name: 'Ramesh', phone: '919876500001' }, campaign: { title: 'Langar Seva' } },
    { id: 'd2', reference: 'DON-2', receiptNumber: null, amount: 300, paymentStatus: 'PENDING', createdAt: '2026-11-12T11:00:00Z', user: { name: 'Sita', phone: '919876500002' }, campaign: null },
  ];
  it('lists receipt numbers, offers receipt actions only for PAID, and filters by search', async () => {
    render(<DonationsAdmin donations={rows} reload={() => undefined} />);
    expect(screen.getByText('AVT/2026-27/000001')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Download receipt/ })).toHaveLength(1);
    await userEvent.type(screen.getByLabelText('Search donations'), 'sita');
    expect(screen.queryByText('AVT/2026-27/000001')).not.toBeInTheDocument(); expect(screen.getByText('DON-2')).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText('Search donations')); await userEvent.type(screen.getByLabelText('Search donations'), 'zzz');
    expect(screen.getByText(/No donation matches your search/)).toBeInTheDocument();
  });
  it('resend: success message shown; the 24-hour-window refusal is shown as a sentence', async () => {
    const reload = vi.fn();
    routes['POST /api/admin/donations/d1/resend-receipt'] = () => ({ json: { ok: true, message: 'Receipt sent to 919876500001 on WhatsApp.' } });
    render(<DonationsAdmin donations={rows} reload={reload} />);
    await userEvent.click(screen.getByRole('button', { name: /Resend receipt on WhatsApp/ }));
    expect(await screen.findByText(/Receipt sent to 919876500001/)).toBeInTheDocument(); expect(reload).toHaveBeenCalled();
    routes['POST /api/admin/donations/d1/resend-receipt'] = () => ({ status: 409, json: { error: 'This donor has not messaged in the last 24 hours, so WhatsApp does not allow sending the receipt now.' } });
    await userEvent.click(screen.getByRole('button', { name: /Resend receipt on WhatsApp/ }));
    expect(await screen.findByText(/last 24 hours/)).toBeInTheDocument();
  });
});

describe('Round 6 admin: Donors', () => {
  it('lists donors, searches (debounced, sent to the API) and opens the profile with history', async () => {
    routes['GET /api/admin/donors/u1'] = () => ({ json: { id: 'u1', name: 'Ramesh Kumar', phone: '919876500001', email: null, notes: 'Regular', language: 'hi', liveAlerts: true, stats: { totalDonated: 1200, donations: 2, attempts: 3, averageDonation: 600, lastDonationAt: '2026-11-12T10:00:00Z', orders: 1 }, donations: [{ id: 'd1', reference: 'DON-1', receiptNumber: 'AVT/2026-27/000001', amount: 500, status: 'PAID', createdAt: '2026-11-12T10:00:00Z', paidAt: '2026-11-12T10:00:00Z', campaign: null }] } });
    routes['GET /api/admin/donors'] = () => ({ json: { page: 1, pageSize: 25, total: 1, donors: [{ id: 'u1', name: 'Ramesh Kumar', phone: '919876500001', language: 'hi', donations: 2, attempts: 3, totalDonated: 1200, lastDonationAt: '2026-11-12T10:00:00Z' }] } });
    render(<DonorsAdmin />);
    expect(await screen.findByText('₹1,200')).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Search donors'), 'ramesh');
    await waitFor(() => expect(calls.some((c) => c.url.includes('search=ramesh'))).toBe(true));
    await userEvent.click(screen.getByRole('button', { name: 'Ramesh Kumar' }));
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(await screen.findByText('AVT/2026-27/000001')).toBeInTheDocument(); expect(screen.getByDisplayValue('Regular')).toBeInTheDocument();
  });
  it('rejects an invalid email before calling the API', async () => {
    routes['GET /api/admin/donors/u1'] = () => ({ json: { id: 'u1', name: 'R', phone: '1', email: null, notes: '', language: 'en', liveAlerts: true, stats: { totalDonated: 0, donations: 0, attempts: 0, averageDonation: 0, orders: 0 }, donations: [] } });
    routes['GET /api/admin/donors'] = () => ({ json: { page: 1, pageSize: 25, total: 1, donors: [{ id: 'u1', name: 'R', phone: '1', donations: 0, attempts: 0, totalDonated: 0 }] } });
    render(<DonorsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: 'R' }));
    await userEvent.type(await screen.findByLabelText(/Email/), 'not-an-email'); await userEvent.click(screen.getByRole('button', { name: 'Save details' }));
    expect(await screen.findByText('Enter a valid email address.')).toBeInTheDocument();
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
  });
});

describe('Round 6 admin: Campaigns', () => {
  const camp = { id: 'c1', slug: 'langar-seva', title: 'Langar Seva', status: 'ACTIVE', effectiveStatus: 'ACTIVE', targetAmount: 50000, raised: 20000, percent: 40, donations: 12, donors: 9, goalReached: false, endsAt: null, startsAt: null, imageUrl: null, descriptionEn: 'Daily langar', descriptionHi: null, descriptionHing: null, descriptionPa: null };
  it('shows progress bars with collected amount, status and donor counts', async () => {
    routes['GET /api/admin/campaigns'] = () => ({ json: [camp] });
    render(<CampaignsAdmin />);
    expect(await screen.findByText('Langar Seva')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: /Langar Seva progress/ })).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText(/₹20,000 raised/)).toBeInTheDocument(); expect(screen.getByText(/12 donations · 9 donors/)).toBeInTheDocument();
  });
  it('new campaign: validates title/target/dates in plain English, then creates it', async () => {
    routes['GET /api/admin/campaigns'] = () => ({ json: [] });
    routes['POST /api/admin/campaigns'] = () => ({ status: 201, json: camp });
    render(<CampaignsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /New campaign/ }));
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }));
    expect(await screen.findByText(/campaign title/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText('Campaign title'), 'Medical Camp'); await userEvent.type(screen.getByLabelText(/Target amount/), '50');
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }));
    expect(await screen.findByText(/at least ₹100/)).toBeInTheDocument();
    await userEvent.clear(screen.getByLabelText(/Target amount/)); await userEvent.type(screen.getByLabelText(/Target amount/), '75000');
    await userEvent.click(screen.getByRole('button', { name: 'Create campaign' }));
    await waitFor(() => expect(calls.find((c) => c.method === 'POST')?.body).toMatchObject({ title: 'Medical Camp', targetAmount: 75000, status: 'ACTIVE' }));
  });
  it('a campaign that has donations cannot be deleted: the server sentence is shown', async () => {
    routes['GET /api/admin/campaigns'] = () => ({ json: [camp] });
    routes['DELETE /api/admin/campaigns/c1'] = () => ({ status: 409, json: { error: 'This campaign has 12 donation records, so it cannot be deleted. Set its status to Completed or Paused instead.' } });
    vi.stubGlobal('confirm', () => true);
    render(<CampaignsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /Delete/ }));
    expect(await screen.findByText(/cannot be deleted/)).toBeInTheDocument();
  });
});

describe('Round 6 admin: Live Kirtan', () => {
  const live = (over: any = {}) => ({ now: '2026-11-12T03:00:00Z', settings: { url: 'https://www.youtube.com/watch?v=abc', title: 'Subah ka Kirtan', enabled: true, windowHours: 3, liveUntil: null, isLiveNow: false }, audience: { subscribers: 10, withinWindow: 4, outsideWindow: 6, optedOut: 1, templateConfigured: false, reachable: 4, whatsappLive: true }, schedules: [{ id: 's1', label: 'Subah 9 baje', time: '09:00', days: [0, 1, 2, 3, 4, 5, 6], onceDate: null, active: true, summary: 'Every day at 9:00 AM', next: { ymd: '2026-11-13', time: '09:00' } }], broadcasts: [], ...over });
  it('shows the schedule, the audience and the 24-hour-window warning', async () => {
    routes['GET /api/admin/live'] = () => ({ json: live() });
    render(<LiveAdmin />);
    expect(await screen.findByText('9:00 AM')).toBeInTheDocument(); expect(screen.getByText(/Every day at 9:00 AM/)).toBeInTheDocument();
    expect(screen.getByText(/6 subscriber\(s\) are outside that window/)).toBeInTheDocument();
  });
  it('rejects a non-YouTube link and a bad schedule before calling the API', async () => {
    routes['GET /api/admin/live'] = () => ({ json: live() });
    render(<LiveAdmin />);
    const url = await screen.findByLabelText('YouTube live link'); await userEvent.clear(url); await userEvent.type(url, 'https://example.com/x');
    await userEvent.click(screen.getByRole('button', { name: 'Save settings' }));
    expect(await screen.findByText(/Paste a YouTube link/)).toBeInTheDocument(); expect(calls.some((c) => c.method === 'PUT')).toBe(false);
    await userEvent.click(screen.getByRole('button', { name: 'One time' })); await userEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    expect(await screen.findByText(/Choose the date/)).toBeInTheDocument(); expect(calls.some((c) => c.url.endsWith('/schedules') && c.method === 'POST')).toBe(false);
  });
  it('adds a 12 noon schedule and sends a Go-live-now alert after confirmation', async () => {
    routes['GET /api/admin/live'] = () => ({ json: live() });
    routes['POST /api/admin/live/schedules'] = () => ({ status: 201, json: {} });
    routes['POST /api/admin/live/broadcast'] = () => ({ status: 202, json: {} });
    vi.stubGlobal('confirm', () => true);
    render(<LiveAdmin />);
    const time = await screen.findByLabelText('Time'); fireEvent.change(time, { target: { value: '12:00' } });
    await userEvent.click(screen.getByRole('button', { name: /Add schedule/ }));
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/schedules') && c.method === 'POST')?.body).toMatchObject({ time: '12:00', days: [0, 1, 2, 3, 4, 5, 6] }));
    await userEvent.click(screen.getByRole('button', { name: /Go live now/ }));
    await waitFor(() => expect(calls.some((c) => c.url.endsWith('/live/broadcast') && c.method === 'POST')).toBe(true));
  });
});


describe('Round 7: profile, delivery charge, trust payment account, room bookings', () => {
  it('admin profile: validates the phone, then saves name / phone / photo', async () => {
    routes['GET /api/auth/me'] = () => ({ json: { email: 'owner@trust.org', name: null, phone: null, avatarUrl: null, lastLoginAt: '2026-11-13T10:00:00Z', createdAt: '2026-01-01T00:00:00Z', role: 'ADMIN' } });
    routes['PATCH /api/auth/me'] = (b) => ({ json: { email: 'owner@trust.org', ...b } });
    render(<AccountSettings />);
    await userEvent.type(await screen.findByLabelText('Full name'), 'Rinku Ji');
    await userEvent.type(screen.getByLabelText('Mobile number'), '12ab');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/valid mobile number/i);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    await userEvent.clear(screen.getByLabelText('Mobile number')); await userEvent.type(screen.getByLabelText('Mobile number'), '9876543210');
    await userEvent.click(screen.getByRole('button', { name: /save profile/i }));
    expect(await screen.findByText('Profile saved.')).toBeInTheDocument();
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ name: 'Rinku Ji', phone: '9876543210' });
  });

  it('product form: delivery charge defaults to 0 (free), must be whole rupees, and is sent to the API', async () => {
    const reload = vi.fn();
    routes['GET /api/admin/settings/shipping'] = () => ({ json: { freeAbove: 1000 } });
    routes['POST /api/admin/products'] = () => ({ json: {} });
    render(<ProductsAdmin products={[]} reload={reload} />);
    expect(await screen.findByDisplayValue('1000')).toBeInTheDocument(); // free-delivery offer loaded
    await userEvent.click(screen.getByRole('button', { name: /new product/i }));
    expect(screen.getByLabelText(/Delivery charge \(₹ per piece\)/)).toHaveValue('0');
    await userEvent.type(screen.getByPlaceholderText('e.g. Nariyal'), 'Gurbani Pendrive');
    await userEvent.type(screen.getByPlaceholderText('e.g. 100'), '500');
    await userEvent.type(screen.getByPlaceholderText('e.g. 25'), '9');
    await userEvent.clear(screen.getByLabelText(/Delivery charge \(₹ per piece\)/)); await userEvent.type(screen.getByLabelText(/Delivery charge \(₹ per piece\)/), '80');
    await userEvent.click(screen.getByRole('button', { name: /add product/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST' && c.url === '/api/admin/products')).toBe(true));
    expect(calls.find((c) => c.url === '/api/admin/products')!.body).toMatchObject({ name: 'Gurbani Pendrive', price: 500, deliveryCharge: 80 });
  });

  it('trust with its own Razorpay account: both keys are required, the secret is never pre-filled, then saved with presets', async () => {
    const own = { id: 't9', slug: 'helping', name: 'Helping Bezubaan', active: true, sortOrder: 2, infoEn: '', infoHi: null, infoHing: null, infoPa: null, qrImageUrl: null, upiId: null, contactPhone: null, contactEmail: null, accountMode: 'DEFAULT', razorpayKeyId: null, hasKeySecret: false, hasWebhookSecret: false, offerQr: true, presets: [] };
    routes['GET /api/admin/trusts'] = () => ({ json: [own] });
    routes['PATCH /api/admin/trusts/t9'] = () => ({ json: {} });
    render(<TrustsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await userEvent.click(screen.getByLabelText(/This trust’s own Razorpay account/));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/both its Key ID and Key Secret/);
    expect(calls.some((c) => c.method === 'PATCH')).toBe(false);
    await userEvent.type(screen.getByPlaceholderText('rzp_live_xxxxxxxxxx'), 'rzp_live_abc12345678');
    await userEvent.type(screen.getByPlaceholderText('Key Secret'), 'supersecret123');
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'PATCH')).toBe(true));
    expect(calls.find((c) => c.method === 'PATCH')!.body).toMatchObject({ accountMode: 'OWN', razorpayKeyId: 'rzp_live_abc12345678', razorpayKeySecret: 'supersecret123' });
  });

  it('QR-only trust must have a QR image or UPI id', async () => {
    const t = { id: 't8', slug: 'q', name: 'QR Trust', active: true, sortOrder: 1, infoEn: '', infoHi: null, infoHing: null, infoPa: null, qrImageUrl: null, upiId: null, contactPhone: null, contactEmail: null, accountMode: 'QR_ONLY', razorpayKeyId: null, hasKeySecret: false, hasWebhookSecret: false, offerQr: true, presets: [] };
    routes['GET /api/admin/trusts'] = () => ({ json: [t] });
    render(<TrustsAdmin />);
    await userEvent.click(await screen.findByRole('button', { name: /edit/i }));
    await userEvent.click(screen.getByRole('button', { name: /save changes/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/needs its QR code image/);
  });

  it('room bookings: lists pending requests and changes the status', async () => {
    const b = { id: 'r1', reference: 'RM-1-2', name: 'Gurpreet', phone: '919876543210', guests: 4, nights: 2, checkIn: '25 Dec 2026', status: 'PENDING', adminNote: null, createdAt: '2026-11-13T10:00:00Z' };
    routes['GET /api/admin/room-bookings'] = () => ({ json: [b] });
    routes['GET /api/admin/settings/rooms'] = () => ({ json: { info: '' } });
    routes['PATCH /api/admin/room-bookings/r1'] = () => ({ json: { ...b, status: 'CONFIRMED' } });
    render(<RoomsAdmin />);
    expect(await screen.findByText('Gurpreet')).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText('Status of RM-1-2'), 'CONFIRMED');
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ status: 'CONFIRMED' }));
  });
});
