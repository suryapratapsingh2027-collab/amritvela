const configuredApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/+$/, '');
export const API = configuredApiUrl || (process.env.NODE_ENV === 'development' ? 'http://localhost:4000' : '');

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
    const message = await response.text();
    throw new Error(message || `Request failed (${response.status})`);
  }
  if (response.status === 204) return null;
  return await response.json() as T;
}
