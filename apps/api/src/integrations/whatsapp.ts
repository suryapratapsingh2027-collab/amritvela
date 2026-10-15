
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
    console.error(
      `[WhatsApp] ${operation} failed:`,
      JSON.stringify(
        {
          status: error.response?.status ?? null,
          responseData: error.response?.data ?? null,
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
