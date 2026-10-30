import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import PasswordInput from '../components/PasswordInput';
import ProductsAdmin from '../app/admin/ProductsAdmin';
import SupportInbox from '../app/admin/SupportInbox';
import AccountSettings from '../app/admin/AccountSettings';
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
    await userEvent.click(screen.getByRole('button', { name: /password dikhayein/i }));
    expect(input.type).toBe('text');
    expect(screen.getByRole('button', { name: /password chhupayein/i })).toHaveAttribute('aria-pressed', 'true');
    await userEvent.click(screen.getByRole('button', { name: /password chhupayein/i }));
    expect(input.type).toBe('password');
  });
});

describe('ProductsAdmin form', () => {
  it('explains every field and blocks bad input with a specific message', async () => {
    const reload = vi.fn();
    render(<ProductsAdmin products={[]} reload={reload} />);
    await userEvent.click(screen.getByRole('button', { name: /naya product/i }));
    expect(screen.getByText(/Product ka naam/)).toBeInTheDocument();
    expect(screen.getByText(/Price \(₹ rupaye me\)/)).toBeInTheDocument();
    expect(screen.getByText(/Stock \(kitne piece available hain\)/)).toBeInTheDocument();
    expect(screen.getByText(/Customers WhatsApp par yahi naam/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /product add karein/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/naam likhein/);
    await userEvent.type(screen.getByPlaceholderText('Jaise: Nariyal'), 'Nariyal');
    await userEvent.click(screen.getByRole('button', { name: /product add karein/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Price/);
    expect(calls.filter((c) => c.method === 'POST')).toHaveLength(0);
  });

  it('only accepts digits in price/stock and posts a clean payload', async () => {
    routes['POST /api/admin/products'] = () => ({ status: 201, json: { id: 'p1' } });
    const reload = vi.fn();
    render(<ProductsAdmin products={[]} reload={reload} />);
    await userEvent.click(screen.getByRole('button', { name: /naya product/i }));
    await userEvent.type(screen.getByPlaceholderText('Jaise: Nariyal'), '  Nariyal ');
    await userEvent.type(screen.getByPlaceholderText('Jaise: 100'), '1a0b0');
    await userEvent.type(screen.getByPlaceholderText('Jaise: 25'), '4x0');
    await userEvent.click(screen.getByRole('button', { name: /product add karein/i }));
    await waitFor(() => expect(calls.some((c) => c.method === 'POST')).toBe(true));
    expect(calls.find((c) => c.method === 'POST')!.body).toMatchObject({ name: 'Nariyal', price: 100, stock: 40, active: true, imageUrl: '' });
    await waitFor(() => expect(reload).toHaveBeenCalled());
    expect(screen.getByRole('status')).toHaveTextContent(/save ho gaya/i);
  });

  it('shows the server message (e.g. duplicate name) inside the form', async () => {
    routes['POST /api/admin/products'] = () => ({ status: 409, json: { error: 'Is naam ka product pehle se maujood hai. Alag naam rakhein.' } });
    render(<ProductsAdmin products={[]} reload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /naya product/i }));
    await userEvent.type(screen.getByPlaceholderText('Jaise: Nariyal'), 'Nariyal');
    await userEvent.type(screen.getByPlaceholderText('Jaise: 100'), '100');
    await userEvent.type(screen.getByPlaceholderText('Jaise: 25'), '5');
    await userEvent.click(screen.getByRole('button', { name: /product add karein/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/pehle se maujood/);
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
    expect(screen.getByText('Chhupa hua')).toBeInTheDocument();
    expect(screen.getByText('Photo nahi')).toBeInTheDocument();
    await userEvent.click(screen.getAllByRole('button', { name: /chhupayein/i })[0]);
    await waitFor(() => expect(calls.find((c) => c.method === 'PATCH')?.body).toEqual({ active: false }));
  });

  it('edit form is prefilled and the placeholder description is blanked', async () => {
    render(<ProductsAdmin products={[{ id: 'p1', name: 'Nariyal', description: 'Add product description', price: 100, stock: 7, category: null, imageUrl: null, active: true }]} reload={vi.fn()} />);
    await userEvent.click(screen.getByRole('button', { name: /edit/i }));
    expect(screen.getByDisplayValue('Nariyal')).toBeInTheDocument();
    expect(screen.getByDisplayValue('100')).toBeInTheDocument();
    expect(screen.getByDisplayValue('7')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Product ke baare me likhein/)).toHaveValue('');
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
    expect(await screen.findByText('Reply chahiye', { selector: 'span' })).toBeInTheDocument();
    await userEvent.click(await screen.findByText('Surya'));
    const box = await screen.findByPlaceholderText(/Customer ko reply likhein/);
    await userEvent.type(box, 'Namaste, check kar rahe hain{Enter}');
    await waitFor(() => expect(calls.find((c) => c.url.endsWith('/reply'))?.body).toEqual({ text: 'Namaste, check kar rahe hain' }));
    await waitFor(() => expect(box).toHaveValue(''));
  });

  it('shows the real server reason when sending fails (e.g. 24h WhatsApp window) and keeps the typed text', async () => {
    routes['GET /api/admin/conversations/c1/messages'] = () => ({ json: thread });
    routes['GET /api/admin/conversations'] = () => ({ json: [conv] });
    routes['POST /api/admin/conversations/c1/reply'] = () => ({ status: 409, json: { error: 'Is customer ne 24 ghante se zyada se message nahi kiya.' } });
    render(<SupportInbox />);
    await userEvent.click(await screen.findByText('Surya'));
    const box = await screen.findByPlaceholderText(/Customer ko reply likhein/);
    await userEvent.type(box, 'hello');
    await userEvent.click(screen.getByRole('button', { name: /^send$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/24 ghante/);
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
    routes['POST /api/auth/change-password'] = () => ({ json: { message: 'Password badal diya gaya hai.', token: 'NEW.TOKEN' } });
    render(<AccountSettings />);
    expect(await screen.findByText('owner@trust.org')).toBeInTheDocument();
    const pw = screen.getAllByPlaceholderText('Current password')[0];
    await userEvent.type(pw, 'Old-password-123');
    await userEvent.type(screen.getByPlaceholderText('Naya password'), 'short');
    await userEvent.type(screen.getByPlaceholderText('Naya password dobara'), 'short');
    await userEvent.click(screen.getAllByRole('button', { name: /^password badlein$/i })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent(/10 characters/);
    expect(calls.some((c) => c.method === 'POST')).toBe(false);
    await userEvent.clear(screen.getByPlaceholderText('Naya password')); await userEvent.clear(screen.getByPlaceholderText('Naya password dobara'));
    await userEvent.type(screen.getByPlaceholderText('Naya password'), 'Brand-new-pass-9');
    await userEvent.type(screen.getByPlaceholderText('Naya password dobara'), 'Brand-new-pass-0');
    await userEvent.click(screen.getAllByRole('button', { name: /^password badlein$/i })[0]);
    expect(screen.getByRole('alert')).toHaveTextContent(/match nahi/);
    await userEvent.clear(screen.getByPlaceholderText('Naya password dobara')); await userEvent.type(screen.getByPlaceholderText('Naya password dobara'), 'Brand-new-pass-9');
    await userEvent.click(screen.getAllByRole('button', { name: /^password badlein$/i })[0]);
    await waitFor(() => expect(localStorage.getItem('trust_token')).toBe('NEW.TOKEN'));
    expect(calls.find((c) => c.url === '/api/auth/change-password')!.body).toEqual({ currentPassword: 'Old-password-123', newPassword: 'Brand-new-pass-9' });
  });

  it('change email: needs valid email + password, shows duplicate error from server', async () => {
    routes['GET /api/auth/me'] = () => ({ json: { email: 'owner@trust.org' } });
    routes['POST /api/auth/change-email'] = () => ({ status: 409, json: { error: 'Yeh email kisi aur admin account me use ho rahi hai.' } });
    render(<AccountSettings />);
    await userEvent.type(screen.getByPlaceholderText('Naya email address'), 'nope');
    await userEvent.click(screen.getByRole('button', { name: /^email badlein$/i }));
    expect(screen.getByRole('alert')).toHaveTextContent(/Sahi email/);
    await userEvent.clear(screen.getByPlaceholderText('Naya email address')); await userEvent.type(screen.getByPlaceholderText('Naya email address'), 'staff@trust.org');
    await userEvent.type(screen.getByPlaceholderText(/Current password \(confirm/), 'Old-password-123');
    await userEvent.click(screen.getByRole('button', { name: /^email badlein$/i }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/kisi aur admin/);
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
