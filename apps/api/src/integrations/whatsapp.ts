
import axios from 'axios';
import { env } from '../config';

const getWhatsAppMessagesUrl = (): string => {
  return `https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/messages`;
};

function isMockMode(): boolean {
  return (
    env.MOCK_PROVIDERS ||
    !env.WHATSAPP_ACCESS_TOKEN ||
    !env.WHATSAPP_PHONE_NUMBER_ID
  );
}

function logWhatsAppError(operation: string, error: unknown): void {
  if (axios.isAxiosError(error)) {
    const responseData = error.response?.data;

    console.error(
      `[WhatsApp] ${operation} failed:`,
      JSON.stringify(
        {
          status: error.response?.status ?? null,
          responseData: responseData ?? null,
          metaError: responseData?.error
            ? {
                message: responseData.error.message ?? null,
                type: responseData.error.type ?? null,
                code: responseData.error.code ?? null,
                error_subcode:
                  responseData.error.error_subcode ?? null,
                fbtrace_id:
                  responseData.error.fbtrace_id ?? null,
              }
            : null,
          message: error.message,
          code: error.code ?? null,
        },
        null,
        2
      )
    );

    return;
  }

  console.error(`[WhatsApp] ${operation} failed:`, error);
}

export async function sendWhatsAppText(
  to: string,
  text: string
): Promise<any> {
  if (isMockMode()) {
    console.warn(
      '[WhatsApp] Mock mode enabled or credentials missing; message not sent.'
    );

    return { mock: true, to, text };
  }

  try {
    const response = await axios.post(
      getWhatsAppMessagesUrl(),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'text',
        text: {
          preview_url: false,
          body: text,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('[WhatsApp] Text message sent successfully.');
    return response.data;
  } catch (error: unknown) {
    logWhatsAppError('Text message', error);
    throw error;
  }
}

export async function sendWhatsAppDocument(
  to: string,
  link: string,
  filename: string
): Promise<any> {
  if (isMockMode()) {
    console.warn(
      '[WhatsApp] Mock mode enabled or credentials missing; document not sent.'
    );

    return { mock: true, to, link, filename };
  }

  try {
    const response = await axios.post(
      getWhatsAppMessagesUrl(),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: {
          link,
          filename,
        },
      },
      {
        headers: {
          Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      }
    );

    console.log('[WhatsApp] Document message sent successfully.');
    return response.data;
  } catch (error: unknown) {
    logWhatsAppError('Document message', error);
    throw error;
  }
}

/**
 * Uploads a PDF to WhatsApp's media endpoint and sends it as a document by media id.
 * This avoids WhatsApp having to download from our server (slow cold start / URL problems)
 * and is the most reliable way to deliver a receipt or invoice.
 */
export async function sendWhatsAppPdf(to: string, pdf: Buffer, filename: string, caption?: string): Promise<any> {
  if (isMockMode()) {
    console.warn('[WhatsApp] Mock mode enabled or credentials missing; PDF not sent.');
    return { mock: true, to, filename, bytes: pdf.length };
  }
  try {
    const form = new FormData();
    form.append('messaging_product', 'whatsapp');
    form.append('type', 'application/pdf');
    form.append('file', new Blob([new Uint8Array(pdf)], { type: 'application/pdf' }), filename);
    const upload = await fetch(`https://graph.facebook.com/v23.0/${env.WHATSAPP_PHONE_NUMBER_ID}/media`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}` },
      body: form,
      signal: AbortSignal.timeout(30000),
    });
    const uploaded: any = await upload.json().catch(() => ({}));
    if (!upload.ok || !uploaded?.id) {
      throw new Error(`WhatsApp media upload failed (${upload.status}): ${JSON.stringify(uploaded?.error || uploaded)}`);
    }
    const response = await axios.post(
      getWhatsAppMessagesUrl(),
      {
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        to,
        type: 'document',
        document: { id: uploaded.id, filename, ...(caption ? { caption } : {}) },
      },
      { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 15000 },
    );
    console.log('[WhatsApp] PDF document sent successfully.');
    return response.data;
  } catch (error: unknown) {
    logWhatsAppError('PDF document', error);
    throw error;
  }
}

/** Normalises an admin-uploaded image URL into something WhatsApp can fetch (public https, JPEG/PNG, < 5 MB). */
export function toWhatsAppImageUrl(raw?: string | null): string | null {
  let url = String(raw || '').trim();
  if (!url) return null;
  if (url.startsWith('/')) url = `${env.WEB_URL.replace(/\/$/, '')}${url}`;
  if (!/^https:\/\//i.test(url)) return null;
  // Cloudinary may serve WebP/AVIF/huge originals, which WhatsApp rejects. Force a 1000px JPEG.
  if (/res\.cloudinary\.com/.test(url) && url.includes('/image/upload/') && !/\/image\/upload\/[^/]*(?:f_|w_)/.test(url)) {
    url = url.replace('/image/upload/', '/image/upload/f_jpg,q_auto,w_1000/');
  }
  return url;
}

export async function sendWhatsAppImage(to: string, imageUrl: string, caption?: string): Promise<any> {
  if (isMockMode()) {
    console.warn('[WhatsApp] Mock mode enabled or credentials missing; image not sent.');
    return { mock: true, to, imageUrl };
  }
  try {
    const response = await axios.post(
      getWhatsAppMessagesUrl(),
      {
        messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'image',
        image: { link: imageUrl, ...(caption ? { caption: caption.slice(0, 1000) } : {}) },
      },
      { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 20000 },
    );
    return response.data;
  } catch (error: unknown) {
    logWhatsAppError('image', error);
    throw error;
  }
}

/** Extracts a human-readable reason + Meta error code from a failed WhatsApp send. */
export function whatsappErrorInfo(error: any): { code?: number; message: string; windowClosed: boolean } {
  const e = error?.response?.data?.error;
  const code = typeof e?.code === 'number' ? e.code : undefined;
  const message = String(e?.error_data?.details || e?.message || error?.message || 'WhatsApp send failed');
  // 131047 = more than 24h since the customer's last message (free-form messages not allowed)
  const windowClosed = code === 131047 || /re-?engagement|24 hours|24-hour/i.test(message);
  return { code, message, windowClosed };
}

export function whatsappLive(): boolean { return !isMockMode(); }

/* ------------------------------------------------------------------ interactive messages */

export type InteractiveRow = { id: string; title: string; description?: string };
export type InteractiveSpec =
  | { kind: 'list'; header?: string; body: string; footer?: string; button: string; sections: { title?: string; rows: InteractiveRow[] }[] }
  | { kind: 'buttons'; body: string; buttons: { id: string; title: string }[] };

const cut = (s: string, n: number) => (s.length <= n ? s : s.slice(0, n - 1).trimEnd() + '…');

/** Enforces WhatsApp's hard limits so a long translation can never make Meta reject the whole message. */
export function sanitizeInteractive(spec: InteractiveSpec): InteractiveSpec {
  if (spec.kind === 'buttons') {
    return { kind: 'buttons', body: cut(spec.body, 1024), buttons: spec.buttons.slice(0, 3).map((b) => ({ id: cut(b.id, 256), title: cut(b.title, 20) })) };
  }
  let remaining = 10; // WhatsApp allows at most 10 rows across all sections
  const sections = spec.sections.map((s) => {
    const rows = s.rows.slice(0, Math.max(0, remaining)).map((r) => ({ id: cut(r.id, 200), title: cut(r.title, 24), ...(r.description ? { description: cut(r.description, 72) } : {}) }));
    remaining -= rows.length;
    return { ...(s.title ? { title: cut(s.title, 24) } : {}), rows };
  }).filter((s) => s.rows.length);
  return { kind: 'list', ...(spec.header ? { header: cut(spec.header, 60) } : {}), body: cut(spec.body, 1024), ...(spec.footer ? { footer: cut(spec.footer, 60) } : {}), button: cut(spec.button, 20), sections };
}

/** Plain-text rendering of an interactive message (fallback when Meta rejects it, website chat, admin inbox). */
export function interactiveToText(spec: InteractiveSpec): string {
  if (spec.kind === 'buttons') return `${spec.body}\n\n${spec.buttons.map((b, i) => `${i + 1}. ${b.title}`).join('\n')}`;
  const rows = spec.sections.flatMap((s) => s.rows);
  return `${spec.body}\n\n${rows.map((r, i) => `${i + 1}. ${r.title}${r.description ? ` — ${r.description}` : ''}`).join('\n')}`;
}

export async function sendWhatsAppInteractive(to: string, rawSpec: InteractiveSpec): Promise<any> {
  const spec = sanitizeInteractive(rawSpec);
  if (isMockMode()) {
    console.warn('[WhatsApp] Mock mode enabled or credentials missing; interactive message not sent.');
    return { mock: true, to };
  }
  const interactive: any = spec.kind === 'buttons'
    ? { type: 'button', body: { text: spec.body }, action: { buttons: spec.buttons.map((b) => ({ type: 'reply', reply: { id: b.id, title: b.title } })) } }
    : {
        type: 'list',
        ...(spec.header ? { header: { type: 'text', text: spec.header } } : {}),
        body: { text: spec.body },
        ...(spec.footer ? { footer: { text: spec.footer } } : {}),
        action: { button: spec.button, sections: spec.sections },
      };
  try {
    const response = await axios.post(
      getWhatsAppMessagesUrl(),
      { messaging_product: 'whatsapp', recipient_type: 'individual', to, type: 'interactive', interactive },
      { headers: { Authorization: `Bearer ${env.WHATSAPP_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, timeout: 20000 },
    );
    return response.data;
  } catch (error: unknown) {
    logWhatsAppError('interactive', error);
    throw error;
  }
}
