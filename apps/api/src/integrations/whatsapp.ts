
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
