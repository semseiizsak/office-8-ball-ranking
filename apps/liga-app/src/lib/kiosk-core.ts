// X1 kiosk: pure helpers (no storage), shared by src/lib/kiosk.ts and its test.
export type KioskSettings = { allowGuests: boolean; saverAfter: number; keepAwake: boolean };
export type Kiosk = {
  id: string; league_id: string; name: string; pin_hash: string; paired_by: string; paired_by_name: string;
  created_at: string; last_seen_at: string; settings: KioskSettings;
};
export const KIOSK_DEFAULTS: KioskSettings = { allowGuests: true, saverAfter: 60, keepAwake: true };
export const SAVER_CHOICES = [30, 60, 120, 300] as const;
export const saverLabel = (s: number) => (s < 60 ? `${s} s` : `${s / 60} min`);
export const PIN_TRIES = 3, PIN_LOCK_MS = 5 * 60_000;

// Local test build only: the server keeps a bcrypt hash (verify_kiosk_pin). This just avoids storing the plain PIN.
export function hashPin(pin: string, salt: string) {
  let h = 0x811c9dc5;
  for (const ch of `${salt}:${pin}`) { h ^= ch.charCodeAt(0); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(36);
}
export const validPin = (pin: string) => /^\d{6}$/.test(pin);

// Wrong admin PIN: three tries, then a five minute wait. Never a permanent lock.
export type PinGate = { fails: number; until: number };
export function pinAttempt(g: PinGate, ok: boolean, now = Date.now()): PinGate & { ok: boolean; locked: boolean } {
  if (g.until > now) return { ...g, ok: false, locked: true };
  if (ok) return { fails: 0, until: 0, ok: true, locked: false };
  const fails = g.fails + 1;
  return fails >= PIN_TRIES ? { fails: 0, until: now + PIN_LOCK_MS, ok: false, locked: true } : { fails, until: 0, ok: false, locked: false };
}

export const namesOf = (ms: { display_name: string }[]) => ms.map((m) => m.display_name).join(' and ');
export const avgOf = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
// Chance that side A wins, from the side averages.
export const chanceA = (a: number[], b: number[]) => 1 / (1 + Math.pow(10, (avgOf(b) - avgOf(a)) / 400));
export const pct = (x: number) => Math.round(x * 100);

// Cup sign up wall: a tap toggles. Full cup puts the name on the reserve list; leaving lets the first reserve in.
export type Entry = { member_id: string; at: string };
export function toggleEntrant(c: { entrants: Entry[]; waitlist: Entry[]; max: number }, id: string, at = new Date().toISOString()) {
  const inMain = c.entrants.some((e) => e.member_id === id), inWait = c.waitlist.some((e) => e.member_id === id);
  if (inMain || inWait) {
    c.entrants = c.entrants.filter((e) => e.member_id !== id);
    c.waitlist = c.waitlist.filter((e) => e.member_id !== id);
    const promoted = inMain ? c.waitlist.shift() ?? null : null;
    if (promoted) c.entrants.push({ member_id: promoted.member_id, at });
    return { state: 'out' as const, promoted: promoted?.member_id ?? null };
  }
  if (c.entrants.length < c.max) { c.entrants.push({ member_id: id, at }); return { state: 'in' as const, promoted: null }; }
  c.waitlist.push({ member_id: id, at });
  return { state: 'reserve' as const, promoted: null };
}

// Short form text for the ladder: "7 wins in the last 8".
export function lastWins(results: boolean[]) {
  const last = results.slice(0, 8);
  return last.length ? `${last.filter(Boolean).length} ${last.filter(Boolean).length === 1 ? 'win' : 'wins'} in the last ${last.length}` : 'No matches yet';
}

export const hms = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return s >= 3600 ? `${Math.floor(s / 3600)}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}` : `${pad(Math.floor(s / 60))}:${pad(s % 60)}`;
};
