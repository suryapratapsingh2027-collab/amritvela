const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
export const API = configuredApiUrl || (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '');

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) { super(message); this.status = status; this.name = 'ApiError'; }
}

export async function api<T>(path: string, options: RequestInit = {}): Promise<T | null> {
  if (!API) {
    throw new Error('The API URL is not configured. Set NEXT_PUBLIC_API_URL in the web deployment environment.');
  }

  const token = typeof window !== 'undefined' ? localStorage.getItem('trust_token') : null;
  const response = await fetch(`${API}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...options.headers,
    },
  });

  if (!response.ok) {
    // The API answers errors as {"error": "..."}; show the sentence, never the raw JSON.
    const raw = await response.text();
    let message = raw;
    try { const parsed = JSON.parse(raw); message = parsed?.error || parsed?.message || raw; } catch { /* plain text */ }
    throw new ApiError(message || `Request failed (${response.status})`, response.status);
  }
  if (response.status === 204) return null;
  return await response.json() as T;
}

/** Downloads a protected file (PDF / CSV) with the admin token and saves it in the browser. */
export async function downloadFile(path: string, fallbackName: string): Promise<void> {
  if (!API) throw new Error('The API URL is not configured. Set NEXT_PUBLIC_API_URL in the web deployment environment.');
  const token = typeof window !== 'undefined' ? localStorage.getItem('trust_token') : null;
  const response = await fetch(`${API}${path}`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    const raw = await response.text(); let message = raw;
    try { message = JSON.parse(raw)?.error || raw; } catch { /* plain text */ }
    throw new ApiError(message || `Download failed (${response.status})`, response.status);
  }
  const blob = await response.blob();
  const cd = response.headers?.get?.('content-disposition') || '';
  const name = /filename="?([^";]+)"?/i.exec(cd)?.[1] || fallbackName;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
