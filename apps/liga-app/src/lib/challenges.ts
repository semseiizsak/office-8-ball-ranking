// Challenges (M7 to M9): create, respond, cancel, expire, complete. Stakes freeze when sent.
// Bot members (user_id null) answer by themselves 20 to 90 seconds after a challenge, resolved lazily on read.
import { ApiError, notify, uid, type DB } from '@/lib/engine';
import { db, save, wait, type User } from '@/lib/api';
import { eloPreview } from '@/lib/elo';
import type { Member } from '@/lib/types';

export type ChallengeStatus = 'pending' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'played';
export type Challenge = {
  id: string; league_id: string; from: string; to: string; format: '1v1';
  message: string | null; scheduled_at: string | null;
  stakes: { aWins: number; bWins: number; chanceA: number }; // side A is the challenger
  status: ChallengeStatus; created_at: string; expires_at: string;
  responded_at: string | null; ended_at: string | null;
  reason: string | null; back_on: string | null; cancelled_by: string | null; late_cancel?: boolean;
  after_accept?: boolean; match_id: string | null;
  bot?: { at: string; accept: boolean; reason: string | null };
};

export const REPLY_HOURS = 24;
export const DAILY_LIMIT = 5;
export const MESSAGES = ['Rematch? I want my spot back 😤', 'Lunch break? Best of three', 'Loser buys coffee ☕'];
export const DECLINE_REASONS = ['Not today', 'Busy this week', 'Out of office'];
export const CANCEL_REASONS = ["Can't make it", 'Injured', 'Other'];
export const OPEN: ChallengeStatus[] = ['pending', 'accepted'];

const H = 3600000;
const iso = (ms: number) => new Date(ms).toISOString();
const t = (s: string | null) => (s ? new Date(s).getTime() : 0);

/* ---------- helpers for screens ---------- */

// Challenger side stakes from two ratings.
export const previewStakes = (from: Member, to: Member, k = 32) => eloPreview(from.rating, to.rating, k);

// What the challenge is worth for one player (frozen at send).
export function stakesFor(c: Challenge, memberId: string | undefined) {
  const { aWins, bWins, chanceA } = c.stakes;
  return memberId === c.to ? { win: -bWins, lose: -aWins, chance: 1 - chanceA } : { win: aWins, lose: bWins, chance: chanceA };
}
export const otherSide = (c: Challenge, memberId: string | undefined) => (c.from === memberId ? c.to : c.from);

export function timeLeft(until: string) {
  const ms = t(until) - Date.now();
  if (ms <= 0) return 'Ended';
  return ms >= H ? `${Math.floor(ms / H)} h left` : `${Math.max(1, Math.ceil(ms / 60000))} min left`;
}
export function ago(at: string) {
  const s = Math.max(0, Math.floor((Date.now() - t(at)) / 1000));
  if (s < 60) return 'Just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}
export function whenLabel(at: string) {
  const d = new Date(at);
  const day = new Date(d); day.setHours(0, 0, 0, 0);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((day.getTime() - today.getTime()) / 86400000);
  const hm = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  const label = diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : diff === -1 ? 'Yesterday' : d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
  return `${label}, ${hm}`;
}
export const dateLabel = (at: string) => new Date(at).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });

// Suggested time chips for the composer (optional).
export type When = 'any' | 'now' | '30' | 'lunch';
export function whenAt(w: When, now = new Date()): string | null {
  if (w === 'any') return null;
  if (w === 'now') return now.toISOString();
  if (w === '30') return iso(now.getTime() + 30 * 60000);
  const l = new Date(now); l.setHours(13, 0, 0, 0);
  if (l.getTime() < now.getTime()) l.setDate(l.getDate() + 1);
  return l.toISOString();
}

const nextMonday = (from: number) => {
  const d = new Date(from); d.setHours(9, 0, 0, 0);
  d.setDate(d.getDate() + (((8 - d.getDay()) % 7) || 7));
  return d.toISOString();
};

/* ---------- lazy state resolution ---------- */

const list = (d: DB) => (d.challenges = d.challenges ?? []);
const member = (d: DB, id: string) => d.members.find((m) => m.id === id);
const nameOf = (d: DB, id: string) => member(d, id)?.display_name ?? 'Someone';
const stakeText = (c: Challenge, id: string) => { const s = stakesFor(c, id); return `Win +${s.win}, lose −${Math.abs(s.lose)}`; };

function respond(d: DB, c: Challenge, accept: boolean, at: number, reason: string | null, backOn: string | null) {
  c.responded_at = iso(at);
  const who = nameOf(d, c.to);
  if (accept) {
    c.status = 'accepted';
    notify(d, { league_id: c.league_id, member_id: c.from, kind: 'challenge_accepted', title: `${who} accepted`,
      body: c.scheduled_at ? `${whenLabel(c.scheduled_at)}. Stakes are locked.` : 'Stakes are locked. Log the result when you have played.', href: `/challenge/${c.id}` });
  } else {
    c.status = 'declined'; c.ended_at = c.responded_at; c.reason = reason; c.back_on = backOn;
    notify(d, { league_id: c.league_id, member_id: c.from, kind: 'challenge_declined', title: `${who} passed this time`,
      body: backOn ? `Back ${dateLabel(backOn)}.` : reason ?? 'Maybe next time.', href: `/challenge/${c.id}` });
  }
}

// Applies everything that should have happened by now: bot answers, expiry, undone matches.
export function resolve(d: DB, now = Date.now()) {
  let changed = false;
  for (const c of list(d)) {
    if (c.status === 'pending' && c.bot && t(c.bot.at) <= now && t(c.bot.at) < t(c.expires_at)) {
      respond(d, c, c.bot.accept, t(c.bot.at), c.bot.reason, c.bot.reason === 'Busy this week' ? nextMonday(t(c.bot.at)) : null);
      changed = true;
    }
    if (c.status === 'pending' && t(c.expires_at) <= now) {
      c.status = 'expired'; c.ended_at = c.expires_at; changed = true;
      notify(d, { league_id: c.league_id, member_id: c.from, kind: 'challenge_expired', title: `Your challenge to ${nameOf(d, c.to)} ended`,
        body: `No reply in ${REPLY_HOURS} h, nothing changed.`, href: `/challenge/${c.id}` });
    }
    // M9.3: accepted but no result a day after the time (or the accept), closes without rating.
    if (c.status === 'accepted' && Math.max(t(c.scheduled_at), t(c.responded_at)) + 24 * H <= now) {
      c.status = 'expired'; c.after_accept = true; c.ended_at = iso(Math.max(t(c.scheduled_at), t(c.responded_at)) + 24 * H); changed = true;
    }
    // Undo after logging the result: back to accepted.
    if (c.status === 'played' && c.match_id && !d.matches.some((m) => m.id === c.match_id)) {
      c.status = 'accepted'; c.match_id = null; c.ended_at = null; changed = true;
    }
  }
  return changed;
}

// Bot decision: closer ratings are more tempting. Answer 20 to 90 seconds later, a big gap takes longer.
export function botAnswer(from: Member, to: Member, created: number, rnd = Math.random) {
  const gap = Math.abs(from.rating - to.rating);
  const accept = rnd() < Math.min(0.9, Math.max(0.3, 0.9 - gap / 400));
  const delay = 20 + Math.min(1, gap / 300) * 40 + rnd() * 30;
  return { at: iso(created + delay * 1000), accept, reason: accept ? null : DECLINE_REASONS[Math.floor(rnd() * DECLINE_REASONS.length)] };
}

function build(d: DB, leagueId: string, from: Member, to: Member, p: { message?: string | null; scheduled_at?: string | null }, now = Date.now()): Challenge {
  const k = d.leagues.find((l) => l.id === leagueId)?.k_factor ?? 32;
  const c: Challenge = {
    id: uid(), league_id: leagueId, from: from.id, to: to.id, format: '1v1',
    message: p.message?.trim() ? p.message.trim().slice(0, 120) : null, scheduled_at: p.scheduled_at ?? null,
    stakes: previewStakes(from, to, k), status: 'pending', created_at: iso(now), expires_at: iso(now + REPLY_HOURS * H),
    responded_at: null, ended_at: null, reason: null, back_on: null, cancelled_by: null, match_id: null,
  };
  if (!to.user_id) c.bot = botAnswer(from, to, now);
  list(d).push(c);
  notify(d, { league_id: leagueId, member_id: to.id, kind: 'challenge_received', title: `${from.display_name} challenged you`,
    body: `${stakeText(c, to.id)}. Reply within ${REPLY_HOURS} h.`, href: `/challenge/${c.id}` });
  return c;
}

// Test build only: the first time a real player opens the Arena, a demo bot near their rating challenges them.
function seedIncoming(d: DB, leagueId: string, me: Member) {
  if (list(d).some((c) => c.league_id === leagueId && c.to === me.id)) return false;
  const bots = d.members.filter((m) => m.league_id === leagueId && !m.user_id && !m.guest && !m.status && m.id !== me.id);
  if (!bots.length) return false;
  const bot = bots.sort((x, y) => Math.abs(x.rating - me.rating) - Math.abs(y.rating - me.rating))[0];
  build(d, leagueId, bot, me, { message: MESSAGES[1] }, Date.now() - 5 * 60000);
  return true;
}

/* ---------- reads ---------- */

const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);
const byUrgency = (meId: string) => (x: Challenge, y: Challenge) => {
  const rank = (c: Challenge) => (c.status === 'pending' && c.to === meId ? 0 : c.status === 'accepted' ? 1 : c.status === 'pending' ? 2 : 3);
  return rank(x) - rank(y) || (rank(x) === 3 ? t(y.ended_at ?? y.created_at) - t(x.ended_at ?? x.created_at) : t(x.expires_at) - t(y.expires_at));
};

// All challenges I take part in, received first, then upcoming, waiting, finished (newest first).
export async function myChallenges(user: User, leagueId: string, limit = 30): Promise<Challenge[]> {
  const d = await db();
  const me = meIn(d, leagueId, user);
  if (!me) return [];
  const changed = [resolve(d), seedIncoming(d, leagueId, me)].some(Boolean);
  if (changed) await save();
  return list(d).filter((c) => c.league_id === leagueId && (c.from === me.id || c.to === me.id)).sort(byUrgency(me.id)).slice(0, limit);
}

export async function getChallenge(id: string): Promise<Challenge | null> {
  const d = await db();
  if (resolve(d)) await save();
  return list(d).find((c) => c.id === id) ?? null;
}

// Open challenge between two players (either direction), and outgoing count today.
export async function composerInfo(leagueId: string, meId: string) {
  const d = await db();
  if (resolve(d)) await save();
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const mine = list(d).filter((c) => c.league_id === leagueId);
  return {
    openWith: new Map(mine.filter((c) => OPEN.includes(c.status) && (c.from === meId || c.to === meId)).map((c) => [otherSide(c, meId), c.id])),
    sentToday: mine.filter((c) => c.from === meId && t(c.created_at) >= start.getTime()).length,
  };
}

/* ---------- writes ---------- */

function mustGet(d: DB, user: User, id: string) {
  const c = list(d).find((x) => x.id === id);
  if (!c) throw new ApiError('unknown challenge');
  const me = meIn(d, c.league_id, user);
  if (!me) throw new ApiError('not a member');
  return { c, me };
}

export async function createChallenge(user: User, p: { league: string; to: string; message?: string | null; scheduled_at?: string | null }) {
  await wait(250);
  const d = await db();
  resolve(d);
  const me = meIn(d, p.league, user);
  const to = member(d, p.to);
  if (!me || !to || to.league_id !== p.league) throw new ApiError('not a member');
  if (me.id === to.id) throw new ApiError('cannot challenge yourself');
  const open = list(d).find((c) => c.league_id === p.league && OPEN.includes(c.status) && [c.from, c.to].includes(me.id) && [c.from, c.to].includes(to.id));
  if (open) throw new ApiError('already open');
  const start = new Date(); start.setHours(0, 0, 0, 0);
  if (list(d).filter((c) => c.from === me.id && t(c.created_at) >= start.getTime()).length >= DAILY_LIMIT) throw new ApiError('daily limit');
  const c = build(d, p.league, me, to, p);
  await save();
  return c;
}

export async function respondChallenge(user: User, id: string, accept: boolean, reason: string | null = null) {
  await wait(200);
  const d = await db();
  resolve(d);
  const { c, me } = mustGet(d, user, id);
  if (c.to !== me.id) throw new ApiError('not yours');
  if (c.status !== 'pending') throw new ApiError(c.status);
  respond(d, c, accept, Date.now(), reason, reason === 'Busy this week' ? nextMonday(Date.now()) : null);
  await save();
  return c;
}

// M9.6: the sender while pending, either player once accepted.
export async function cancelChallenge(user: User, id: string, reason: string | null = null) {
  await wait(200);
  const d = await db();
  resolve(d);
  const { c, me } = mustGet(d, user, id);
  const ok = (c.status === 'pending' && c.from === me.id) || (c.status === 'accepted' && [c.from, c.to].includes(me.id));
  if (!ok) throw new ApiError('not allowed');
  c.late_cancel = c.status === 'accepted' && !!c.scheduled_at && t(c.scheduled_at) - Date.now() < 15 * 60000;
  c.status = 'cancelled'; c.cancelled_by = me.id; c.reason = reason; c.ended_at = iso(Date.now());
  notify(d, { league_id: c.league_id, member_id: otherSide(c, me.id), kind: 'challenge_cancelled', title: `${me.display_name} cancelled`,
    body: reason ? `${reason}. Nothing changed.` : 'Nothing changed.', href: `/challenge/${c.id}` });
  await save();
}

// Called by the Log match sheet after saving a result for an accepted challenge.
export async function completeChallenge(user: User, id: string, matchId: string) {
  const d = await db();
  const { c } = mustGet(d, user, id);
  if (c.status !== 'accepted' && c.status !== 'pending') return;
  c.status = 'played'; c.match_id = matchId; c.ended_at = iso(Date.now());
  await save();
}
