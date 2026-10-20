// X1 Kiosk mode (module 'kiosk'). A kiosk is this device bound to one league, not a user account.
// The admin who set it up is the one it acts for: matches go through the normal recordMatch with created_by = that admin,
// tagged source 'kiosk'. Leaving needs the 6 digit admin PIN. Local test build: the device record lives in the store,
// the binding in AsyncStorage. Pairing a second tablet by QR (X1.2) needs the backend.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';

import { ApiError, db, recordMatch, save, settled, wait, type User } from '@/lib/api';
import { dayKey, resolveCups, settingsOf, tzOf, weekOf, zoned } from '@/lib/cup';
import { notify, uid, type DB, type StoredMatch } from '@/lib/engine';
import { addGuest } from '@/lib/guests';
import { inviteInfo, inviteUrl } from '@/lib/invite';
import { KIOSK_DEFAULTS, chanceA, hashPin, lastWins, pinAttempt, toggleEntrant, validPin, type Kiosk, type KioskSettings, type PinGate } from '@/lib/kiosk-core';
import { elapsed, isActive, liveNow, viewers } from '@/lib/live';
import { isOn } from '@/lib/modules';
import { headToHead, splitLadder, UPSET } from '@/lib/stats';
import type { Member } from '@/lib/types';

export * from '@/lib/kiosk-core';

const DEVICE_KEY = 'liga.kiosk.device';
type Device = { id: string; active: boolean };

const kiosks = (d: DB) => (d.kiosks = d.kiosks ?? []);
const withDefaults = (k: Kiosk): Kiosk => ({ ...k, settings: { ...KIOSK_DEFAULTS, ...k.settings } });
const adminsOf = (d: DB, leagueId: string) => d.members.filter((m) => m.league_id === leagueId && !m.status && m.user_id && (m.role === 'owner' || m.role === 'admin'));
export const kioskUser = (k: Pick<Kiosk, 'paired_by'>): User => ({ id: k.paired_by, email: '' });

/* ---------- this device ---------- */
export async function thisDevice(): Promise<{ kiosk: Kiosk; active: boolean } | null> {
  const raw = await AsyncStorage.getItem(DEVICE_KEY);
  if (!raw) return null;
  let dev: Device;
  try { dev = JSON.parse(raw) as Device; } catch { return null; }
  const k = kiosks(await db()).find((x) => x.id === dev.id);
  if (!k) { await AsyncStorage.removeItem(DEVICE_KEY); return null; } // unpaired from somewhere else
  return { kiosk: withDefaults(k), active: dev.active };
}
export async function setActive(active: boolean) {
  const cur = await thisDevice();
  if (cur) await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify({ id: cur.kiosk.id, active }));
}

/* ---------- X1.1 set up, X1.15 settings, X1.16 exit and unpair ---------- */
export async function setupKiosk(user: User, leagueId: string, p: { name: string; pin: string; settings: KioskSettings }) {
  await wait(250);
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
  if (!l || !me || (me.role !== 'owner' && me.role !== 'admin')) throw new ApiError('not allowed');
  if (l.archived_at) throw new ApiError('league archived');
  if (!isOn(l, 'kiosk')) throw new ApiError('module off');
  if (!validPin(p.pin)) throw new ApiError('bad pin');
  const old = await thisDevice();
  if (old) d.kiosks = kiosks(d).filter((x) => x.id !== old.kiosk.id);
  const id = uid(), now = new Date().toISOString();
  const k: Kiosk = { id, league_id: leagueId, name: p.name.trim() || 'Table 1', pin_hash: hashPin(p.pin, id), paired_by: user.id, paired_by_name: me.display_name, created_at: now, last_seen_at: now, settings: p.settings };
  kiosks(d).push(k);
  for (const a of adminsOf(d, leagueId)) notify(d, { league_id: leagueId, member_id: a.id, kind: 'kiosk', title: 'Kiosk is live', body: `${k.name} kiosk is live in ${l.name}.`, href: '/league' });
  await save();
  await AsyncStorage.setItem(DEVICE_KEY, JSON.stringify({ id, active: true }));
  return k;
}

export async function updateKiosk(id: string, p: { name?: string; settings?: Partial<KioskSettings> }) {
  const d = await db();
  const k = kiosks(d).find((x) => x.id === id);
  if (!k) throw new ApiError('unknown kiosk');
  if (p.name?.trim()) k.name = p.name.trim();
  if (p.settings) k.settings = { ...KIOSK_DEFAULTS, ...k.settings, ...p.settings };
  await save();
  return withDefaults(k);
}

const gates = new Map<string, PinGate>();
export async function checkAdminPin(k: Kiosk, pin: string) {
  await wait(150);
  const r = pinAttempt(gates.get(k.id) ?? { fails: 0, until: 0 }, hashPin(pin, k.id) === k.pin_hash);
  gates.set(k.id, { fails: r.fails, until: r.until });
  return { ok: r.ok, locked: r.locked, waitMs: Math.max(0, r.until - Date.now()) };
}

export async function unpairKiosk(k: Kiosk) {
  const d = await db();
  const l = d.leagues.find((x) => x.id === k.league_id);
  d.kiosks = kiosks(d).filter((x) => x.id !== k.id);
  for (const a of adminsOf(d, k.league_id)) notify(d, { league_id: k.league_id, member_id: a.id, kind: 'kiosk', title: 'Kiosk unpaired', body: `${k.name} no longer shows ${l?.name ?? 'the league'}.`, href: '/league' });
  await save();
  await AsyncStorage.removeItem(DEVICE_KEY);
}

/* ---------- X1.4 home, X1.14 screensaver: one read ---------- */
export type KioskProblem = 'module' | 'archived' | 'admin' | null;
export type KioskRow = { m: Member; rank: number; form: string; week: number };
export type KioskMatch = { id: string; at: string; winners: Member[]; losers: Member[]; delta: number; upset: boolean; pending: boolean };
export type KioskCup = { id: string; status: string; entrants: string[]; waitlist: string[]; max: number; draw_at: string; final_at: string; champion: string | null; open: { a: string | null; b: string | null }[]; prize: number | null; minMatches: boolean };
export type KioskLive = { id: string; a: Member[]; b: Member[]; ms: number; at: number; watching: number };
export type KioskHome = {
  kiosk: Kiosk; league: { id: string; name: string; team: string; sport: string; tz: string; k: number };
  problem: KioskProblem; week: number; code: string | null;
  members: Member[]; todayIds: string[]; top: KioskRow[]; today: KioskMatch[]; recent: KioskMatch[];
  cup: KioskCup | null; live: KioskLive[]; busy: string[]; liveOn: boolean; coinsOn: boolean;
};

function sidesOfRow(d: DB, m: StoredMatch) {
  const rows = d.mps.filter((p) => p.match_id === m.id);
  const a = rows.length ? rows.filter((p) => p.side === 'a').map((p) => p.member_id) : m.sides?.a ?? [];
  const b = rows.length ? rows.filter((p) => p.side === 'b').map((p) => p.member_id) : m.sides?.b ?? [];
  return { rows, a, b };
}
function matchView(d: DB, m: StoredMatch): KioskMatch {
  const { rows, a, b } = sidesOfRow(d, m);
  const get = (ids: string[]) => ids.map((id) => d.members.find((x) => x.id === id)).filter((x): x is Member => !!x);
  const w = m.winner === 'a' ? a : b, lo = m.winner === 'a' ? b : a;
  const before = (ids: string[]) => ids.map((id) => rows.find((r) => r.member_id === id)?.rating_before ?? 0);
  const win = rows.find((r) => w.includes(r.member_id));
  const upset = rows.length > 0 && chanceA(before(w), before(lo)) < UPSET;
  return { id: m.id, at: m.played_at, winners: get(w), losers: get(lo), delta: win?.delta ?? 0, upset, pending: !!m.status };
}

export async function kioskHome(k: Kiosk): Promise<KioskHome> {
  const d = await settled(k.league_id);
  const l = d.leagues.find((x) => x.id === k.league_id);
  if (!l) throw new ApiError('unknown league');
  const tz = tzOf(l), now = Date.now();
  const before = JSON.stringify(d.cups ?? []);
  const cur = isOn(l, 'cup') ? resolveCups(d, l.id, now) : null;
  const self = kiosks(d).find((x) => x.id === k.id);
  if (self) self.last_seen_at = new Date(now).toISOString();
  if (JSON.stringify(d.cups ?? []) !== before || self) await save();

  const pairedBy = d.members.find((m) => m.league_id === l.id && m.user_id === k.paired_by && !m.status);
  const problem: KioskProblem = !isOn(l, 'kiosk') ? 'module' : l.archived_at ? 'archived' : !pairedBy ? 'admin' : null;
  const active = d.members.filter((m) => m.league_id === l.id && !m.status);
  const matches = d.matches.filter((m) => m.league_id === l.id && m.status !== 'void').sort((x, y) => y.played_at.localeCompare(x.played_at));
  const today = matches.filter((m) => dayKey(Date.parse(m.played_at), tz) === dayKey(now, tz));
  const w = weekOf(now, tz), weekStart = zoned(w.y, w.mo, w.d, 0, 0, tz);
  // Same sections as Ranks: only settled players get a place; a brand new league shows its newcomers instead.
  const split = splitLadder(active);
  const ladder = split.ranked.length ? split.ranked : split.fresh;
  const top = ladder.slice(0, 8).map((m, i) => {
    const mine = d.mps.filter((p) => p.member_id === m.id).map((p) => ({ p, at: d.matches.find((x) => x.id === p.match_id)?.played_at ?? '' }))
      .sort((x, y) => y.at.localeCompare(x.at));
    return {
      m, rank: i + 1,
      form: lastWins(mine.map((x) => d.matches.find((y) => y.id === x.p.match_id)?.winner === x.p.side)),
      week: mine.filter((x) => Date.parse(x.at) >= weekStart).reduce((s, x) => s + x.p.delta, 0),
    };
  });
  const todayIds = new Set(today.flatMap((m) => { const s = sidesOfRow(d, m); return [...s.a, ...s.b]; }));
  const members = [...active].sort((x, y) => Number(todayIds.has(y.id)) - Number(todayIds.has(x.id)) || y.rating - x.rating);

  let cup: KioskCup | null = null;
  if (cur && cur.status !== 'cancelled') {
    const cfg = settingsOf(d, l.id);
    cup = {
      id: cur.id, status: cur.status, entrants: cur.entrants.map((e) => e.member_id), waitlist: cur.waitlist.map((e) => e.member_id), max: cur.max,
      draw_at: cur.draw_at, final_at: cur.final_at, champion: cur.champion_id, open: cur.games.filter((g) => g.status === 'open').map((g) => ({ a: g.a, b: g.b })),
      prize: isOn(l, 'coins') ? cur.prizes.winner : null, minMatches: cfg.minMatches,
    };
  }
  let live: KioskLive[] = [];
  if (isOn(l, 'live')) {
    try {
      const get = (ids: string[]) => ids.map((id) => d.members.find((x) => x.id === id)).filter((x): x is Member => !!x);
      live = (await liveNow(kioskUser(k), l.id)).filter(isActive).map((x) => ({ id: x.id, a: get(x.a), b: get(x.b), ms: elapsed(x), at: now, watching: viewers(x) }));
    } catch { live = []; }
  }
  let code: string | null = null;
  try { const inv = await inviteInfo(l.id); code = inv.expired ? null : inv.code; } catch { code = null; }

  return {
    kiosk: withDefaults(self ?? k), league: { id: l.id, name: l.name, team: d.teams.find((x) => x.id === l.team_id)?.name ?? '', sport: l.sport, tz, k: l.k_factor },
    problem, week: w.no, code, members, todayIds: [...todayIds], top,
    today: today.map((m) => matchView(d, m)), recent: matches.slice(0, 10).map((m) => matchView(d, m)),
    cup, live, busy: live.flatMap((x) => [...x.a, ...x.b].map((m) => m.id)), liveOn: isOn(l, 'live'), coinsOn: isOn(l, 'coins'),
  };
}

/* ---------- X1.7, X1.9, X1.10 quick log ---------- */
export type KioskResult = {
  matchId: string; at: number; winner: 'a' | 'b'; pending: string[] | null; today: number;
  rows: { m: Member; side: 'a' | 'b'; before: number; after: number; delta: number; rank: number }[];
  streak: number; firstPlace: boolean; h2h: { lead: string; a: number; b: number } | null;
};

export async function quickLog(k: Kiosk, p: { a: string[]; b: string[]; winner: 'a' | 'b' }): Promise<KioskResult> {
  const d0 = await db();
  const before = new Map(d0.members.filter((m) => m.league_id === k.league_id).map((m) => [m.id, m.rating]));
  const res = await recordMatch(kioskUser(k), { league: k.league_id, a: p.a, b: p.b, winner: p.winner });
  const d = await db();
  const m = d.matches.find((x) => x.id === res.matchId);
  if (m) Object.assign(m, { source: 'kiosk', kiosk_id: k.id }); // M16.6 loggedVia kiosk
  const self = kiosks(d).find((x) => x.id === k.id);
  if (self) self.last_seen_at = new Date().toISOString();
  await save();
  const counted = !!m && !m.status;
  const ladder = splitLadder(d.members.filter((x) => x.league_id === k.league_id && !x.status)).ranked; // rank 0 = still new
  const rows = [...p.a.map((id) => ({ id, side: 'a' as const })), ...p.b.map((id) => ({ id, side: 'b' as const }))].map(({ id, side }) => {
    const mem = d.members.find((x) => x.id === id)!;
    const row = d.mps.find((x) => x.match_id === res.matchId && x.member_id === id);
    const delta = row?.delta ?? (side === 'a' ? res.deltaA : -res.deltaA);
    const b = row?.rating_before ?? before.get(id) ?? mem.rating;
    return { m: mem, side, before: b, after: counted ? mem.rating : b + delta, delta, rank: ladder.findIndex((x) => x.id === id) + 1 };
  });
  const lead = rows.find((r) => r.side === p.winner)!;
  let h2h: KioskResult['h2h'] = null;
  if (p.a.length === 1 && counted) {
    const h = await headToHead(k.league_id, p.a[0], p.b[0]);
    const na = rows[0].m.display_name, nb = rows[1].m.display_name;
    h2h = { a: h.aWins, b: h.bWins, lead: h.aWins === h.bWins ? `${na} and ${nb} are level, ${h.aWins} each` : h.aWins > h.bWins ? `${na} leads ${h.aWins} to ${h.bWins}` : `${nb} leads ${h.bWins} to ${h.aWins}` };
  }
  const tz = tzOf(d.leagues.find((x) => x.id === k.league_id));
  const today = d.matches.filter((x) => x.league_id === k.league_id && dayKey(Date.parse(x.played_at), tz) === dayKey(Date.now(), tz)).length;
  return {
    matchId: res.matchId, at: Date.now(), winner: p.winner, pending: res.pending ? res.pending.names : null, today, rows,
    streak: counted ? Math.max(0, lead.m.streak) : 0, firstPlace: counted && lead.rank === 1, h2h,
  };
}

/* ---------- X1.11 guests, A15.2 claim from the tablet ---------- */
export async function addKioskGuest(k: Kiosk, name: string) {
  const d = await db();
  const taken = new Set(d.members.filter((m) => m.league_id === k.league_id && !m.status).map((m) => m.display_name.trim().toLowerCase()));
  let clean = name.trim();
  if (!clean) { let n = 1; clean = 'Guest'; while (taken.has(clean.toLowerCase())) clean = `Guest ${++n}`; }
  return addGuest(kioskUser(k), k.league_id, clean);
}
// Opens the claim flow on a phone: Expo Go turns it into exp://host/--/kiosk/claim?code=..&m=..
export const claimLink = (code: string, memberId: string) => Linking.createURL('kiosk/claim', { scheme: 'liga', queryParams: { code, m: memberId } });
export const joinLink = (code: string) => inviteUrl(code);
export async function claimState(memberId: string) {
  const d = await db();
  const m = d.members.find((x) => x.id === memberId);
  return m ? { member: m, claimed: !!m.user_id || !m.guest } : null;
}

/* ---------- X1.13 cup sign up wall ---------- */
export async function cupToggle(k: Kiosk, memberId: string) {
  await wait(150);
  const d = await db();
  const l = d.leagues.find((x) => x.id === k.league_id);
  if (!l || !isOn(l, 'cup')) throw new ApiError('cup off');
  const cur = resolveCups(d, l.id);
  if (!cur || cur.status !== 'signup') throw new ApiError('sign up closed');
  const m = d.members.find((x) => x.id === memberId && x.league_id === l.id && !x.status);
  if (!m) throw new ApiError('unknown player');
  const inAlready = cur.entrants.some((e) => e.member_id === m.id) || cur.waitlist.some((e) => e.member_id === m.id);
  if (!inAlready && settingsOf(d, l.id).minMatches && m.wins + m.losses === 0) throw new ApiError('play a match first');
  const r = toggleEntrant(cur, m.id);
  const tell = (id: string, title: string, body: string) => { if (d.members.find((x) => x.id === id)?.user_id) notify(d, { league_id: l.id, member_id: id, kind: 'cup.signup', title, body, href: '/cup' }); };
  if (r.state === 'in') tell(m.id, "You're in the cup", `Signed up on the ${k.name} kiosk.`);
  if (r.state === 'reserve') tell(m.id, "You're on the reserve list", `The cup is full. Signed up on the ${k.name} kiosk.`);
  if (r.promoted) tell(r.promoted, "You're in the cup", 'A spot opened up from the reserve list.');
  await save();
  return r;
}
