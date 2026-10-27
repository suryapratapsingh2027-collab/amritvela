import axios from 'axios';
import { env } from '../config';

let token = '';
let tokenAt = 0;
const TOKEN_TTL_MS = 8 * 24 * 60 * 60 * 1000; // Shiprocket tokens last 10 days

/** Flattens Shiprocket's validation errors ({ errors: { field: [msg] } }) into one readable sentence. */
export function shiprocketErrorMessage(e: any): string {
  const data = e?.response?.data;
  if (!data) return e?.message || String(e);
  const parts: string[] = [];
  if (data.message) parts.push(String(data.message));
  const errors = data.errors;
  if (errors && typeof errors === 'object') {
    for (const [field, msgs] of Object.entries(errors)) parts.push(`${field}: ${Array.isArray(msgs) ? msgs.join(', ') : String(msgs)}`);
  }
  if (!parts.length) parts.push(typeof data === 'string' ? data : JSON.stringify(data).slice(0, 400));
  return `${parts.join(' | ')} (HTTP ${e.response.status})`;
}

async function login(force = false): Promise<string> {
  if (env.MOCK_PROVIDERS) return 'mock';
  if (!force && token && Date.now() - tokenAt < TOKEN_TTL_MS) return token;
  if (!env.SHIPROCKET_EMAIL || !env.SHIPROCKET_PASSWORD) throw new Error('Shiprocket is not configured. Add SHIPROCKET_EMAIL and SHIPROCKET_PASSWORD (an API user, not your main login).');
  try {
    const r = await axios.post(`${env.SHIPROCKET_BASE_URL}/auth/login`, { email: env.SHIPROCKET_EMAIL, password: env.SHIPROCKET_PASSWORD }, { timeout: 20000 });
    token = r.data.token; tokenAt = Date.now();
    return token;
  } catch (e: any) {
    throw new Error(`Shiprocket login failed: ${shiprocketErrorMessage(e)}. Create an API user in Shiprocket > Settings > API and use its email/password.`);
  }
}

async function call<T = any>(method: 'get' | 'post', path: string, data?: unknown): Promise<T> {
  const run = async (t: string) => (await axios.request({
    method, url: `${env.SHIPROCKET_BASE_URL}${path}`, data, timeout: 30000,
    headers: { Authorization: `Bearer ${t}`, 'Content-Type': 'application/json' },
  })).data as T;
  try {
    return await run(await login());
  } catch (e: any) {
    if (e?.response?.status === 401) { try { return await run(await login(true)); } catch (e2: any) { throw new Error(`Shiprocket: ${shiprocketErrorMessage(e2)}`); } }
    if (e?.response) throw new Error(`Shiprocket: ${shiprocketErrorMessage(e)}`);
    throw e;
  }
}

/**
 * Picks the pickup-location nickname out of Shiprocket's pickup-address response.
 * Handles the documented shape ({data:{shipping_address:[...]}}) and the variants seen in the wild,
 * preferring a verified address. Exported for unit tests.
 */
export function extractPickupLocation(res: any): string | null {
  const candidates = [res?.data?.shipping_address, res?.shipping_address, res?.data?.pickup_addresses, res?.data?.data?.shipping_address, res?.data, res];
  const list: any[] = (candidates.find((c) => Array.isArray(c) && c.length) as any[]) || [];
  const named = list.filter((x) => x && typeof (x.pickup_location ?? x.nickname) === 'string' && String(x.pickup_location ?? x.nickname).trim());
  if (!named.length) return null;
  const verified = named.find((x) => x.phone_verified === 1 || x.phone_verified === true || x.status === 2);
  const pick = verified || named[0];
  return String(pick.pickup_location ?? pick.nickname).trim();
}

/** The pickup location nickname must match Shiprocket exactly, otherwise order creation fails. */
export async function getPickupLocation(): Promise<string> {
  if (env.SHIPROCKET_PICKUP_LOCATION?.trim()) return env.SHIPROCKET_PICKUP_LOCATION.trim();
  if (env.MOCK_PROVIDERS) return 'Primary';
  const res: any = await call('get', '/settings/company/pickup');
  const found = extractPickupLocation(res);
  if (found) return found;
  const summary = JSON.stringify(res)?.slice(0, 300);
  console.error('[SHIPROCKET] No pickup address in response:', summary);
  throw new Error(`Shiprocket ne is API login ke liye koi pickup address nahi diya (response: ${summary}). Shiprocket panel > Settings > Pickup Addresses me address ka "Pickup Location" naam dekhein aur use Render me SHIPROCKET_PICKUP_LOCATION ke roop me set karein. Dhyan dein: API user ka account wahi hona chahiye jisme pickup address bana hai.`);
}

export async function createShipment(payload: any) {
  if (env.MOCK_PROVIDERS) return { order_id: `mock_${Date.now()}`, shipment_id: `mock_s_${Date.now()}`, awb_code: `MOCK${Date.now()}`, courier_name: 'Mock Courier' };
  return call('post', '/orders/create/adhoc', payload);
}

/** Assigns the best available courier and returns the AWB. Needs wallet balance and a serviceable route. */
export async function assignAwb(shipmentId: string): Promise<{ awb: string; courier: string }> {
  if (env.MOCK_PROVIDERS) return { awb: `MOCK${Date.now()}`, courier: 'Mock Courier' };
  const res: any = await call('post', '/courier/assign/awb', { shipment_id: shipmentId });
  const d = res?.response?.data;
  if (res?.awb_assign_status === 0 || !d?.awb_code) {
    throw new Error(String(res?.message || res?.response?.data?.message || 'Courier could not be assigned (check Shiprocket wallet balance and pincode serviceability).'));
  }
  return { awb: String(d.awb_code), courier: String(d.courier_name || '') };
}

export async function trackShipment(awb: string) {
  if (env.MOCK_PROVIDERS) return { tracking_data: { shipment_track: [{ current_status: 'SHIPPED', awb_code: awb }] } };
  return call('get', `/courier/track/awb/${awb}`);
}
