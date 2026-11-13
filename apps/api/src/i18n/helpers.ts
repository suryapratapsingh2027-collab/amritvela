export type L = { en: string; hi: string; hing: string; pa: string };
/** A message in all five languages (Marathi is kept in messages-mr.ts and merged in messages.ts). */
export type LM = L & { mr: string };
export const m = (en: string, hi: string, hing: string, pa: string): L => ({ en, hi, hing, pa });
