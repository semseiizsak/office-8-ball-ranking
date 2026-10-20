// Data layer used by every screen. Today it runs fully on the device (AsyncStorage).
// The Supabase version (supabase/migrations/0001_init.sql) implements the same calls later.
import AsyncStorage from '@react-native-async-storage/async-storage';

import { ApiError, applyMatch, notify, replayLeague, uid, type DB, type StoredLeague, type StoredMatch, type Team } from '@/lib/engine';
import { confirmers, confirmOn, dueAt, findTwin, memberOf, rulesFor, confirmMatch as confirmCore, previewRows, settle, audit } from '@/lib/confirm-engine';
import { runMatchHooks } from '@/lib/hooks';
import { noticesForMatch, noticesForReaction } from '@/lib/inbox-rules';
import { seedDemo } from '@/lib/seed';
import type { League, MatchRow, Member } from '@/lib/types';
import type { PlayerColour } from '@/theme';

export { ApiError };

export type User = { id: string; email: string };
export type Session = { user: User };


const DB_KEY = 'liga.db.v1';
const SESSION_KEY = 'liga.session';
export const wait = (ms = 120) => new Promise((r) => setTimeout(r, ms));

let cache: DB | null = null;
// Shared store access for feature modules (src/lib/*.ts). Mutate the returned object, then call save().
export async function db(): Promise<DB> {
  if (cache) return cache;
  const raw = await AsyncStorage.getItem(DB_KEY);
  cache = raw ? (JSON.parse(raw) as DB) : seedDemo();
  if (!raw) await save();
  return cache;
}
export async function save() { await AsyncStorage.setItem(DB_KEY, JSON.stringify(cache)); }

// Runs once when a match starts to count: right away, or on confirmation when the confirm module is on.
export function afterCounted(d: DB, matchId: string) { noticesForMatch(d, matchId); runMatchHooks(d, matchId); }
// Lazy confirmation step (bots, auto confirm, deadlines) before reading a league.
export async function settled(leagueId: string) {
  const d = await db();
  if (settle(d, leagueId, afterCounted)) await save();
  return d;
}


/* ---------- auth (test build: any 6 digit code signs you in) ---------- */
type Listener = (s: Session | null) => void;
const listeners = new Set<Listener>();
const emit = (s: Session | null) => listeners.forEach((l) => l(s));

export const auth = {
  async getSession(): Promise<Session | null> {
    const raw = await AsyncStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  },
  onChange(l: Listener) { listeners.add(l); return () => { listeners.delete(l); }; },
  async sendCode(email: string) { await wait(400); if (!/^\S+@\S+\.\S+$/.test(email)) throw new ApiError('bad email'); },
  async verify(email: string, code: string) {
    await wait(300);
    if (!/^\d{6}$/.test(code)) throw new ApiError('bad code');
    const s: Session = { user: { id: 'u_' + email.toLowerCase().replace(/[^a-z0-9]/g, ''), email: email.toLowerCase() } };
    await AsyncStorage.setItem(SESSION_KEY, JSON.stringify(s));
    emit(s);
  },
  async signOut() { await AsyncStorage.removeItem(SESSION_KEY); emit(null); },
};

/* ---------- reads ---------- */
const withTeam = (d: DB, l: StoredLeague): League => ({ ...l, teams: { name: d.teams.find((t) => t.id === l.team_id)?.name ?? '' } });
const joinMatch = (d: DB, m: StoredMatch): MatchRow => ({ ...m, match_players: m.status ? previewRows(d, m) : d.mps.filter((p) => p.match_id === m.id) });

export async function myLeagues(userId: string): Promise<League[]> {
  const d = await db();
  const ids = new Set(d.members.filter((m) => m.user_id === userId).map((m) => m.league_id));
  return d.leagues.filter((l) => ids.has(l.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)).map((l) => withTeam(d, l));
}
export async function leagueMembers(leagueId: string): Promise<Member[]> {
  const d = await settled(leagueId);
  return d.members.filter((m) => m.league_id === leagueId && !m.status).sort((a, b) => b.rating - a.rating);
}
export async function leagueMatches(leagueId: string, limit = 60): Promise<MatchRow[]> {
  const d = await settled(leagueId);
  return d.matches.filter((m) => m.league_id === leagueId).sort((a, b) => b.played_at.localeCompare(a.played_at)).slice(0, limit).map((m) => joinMatch(d, m));
}
export async function memberMatches(memberId: string, limit = 30): Promise<MatchRow[]> {
  const d = await db();
  const ids = new Set(d.mps.filter((p) => p.member_id === memberId).map((p) => p.match_id));
  return d.matches.filter((m) => ids.has(m.id)).sort((a, b) => b.played_at.localeCompare(a.played_at)).slice(0, limit).map((m) => joinMatch(d, m));
}
export async function leagueByCode(code: string) {
  await wait(250);
  const d = await db();
  const l = d.leagues.find((x) => x.invite_code === code.trim().toUpperCase());
  if (!l) return null;
  const ms = d.members.filter((m) => m.league_id === l.id && !m.status);
  return { league_id: l.id, league_name: l.name, team_name: d.teams.find((t) => t.id === l.team_id)?.name ?? '', sport: l.sport, member_count: ms.length, taken_jerseys: ms.map((m) => m.jersey) };
}

/* ---------- writes ---------- */
const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

export async function createLeague(user: User, p: { team: string; league: string; sport: string; name: string; jersey: number; colour: PlayerColour }) {
  await wait(300);
  const d = await db();
  const team: Team = { id: uid(), name: p.team };
  const league: StoredLeague = { id: uid(), team_id: team.id, name: p.league, sport: p.sport, invite_code: code6(), k_factor: 32, start_rating: 1000, created_at: new Date().toISOString() };
  d.teams.push(team); d.leagues.push(league);
  d.members.push(newMember(league, user.id, p.name, p.jersey, p.colour, 'owner'));
  await save();
  return league.id;
}

export async function joinLeague(user: User, p: { code: string; name: string; jersey: number; colour: PlayerColour }) {
  await wait(300);
  const d = await db();
  const l = d.leagues.find((x) => x.invite_code === p.code.trim().toUpperCase());
  if (!l) throw new ApiError('invalid code');
  if (d.members.some((m) => m.league_id === l.id && m.user_id === user.id)) return l.id;
  if (d.members.some((m) => m.league_id === l.id && !m.status && m.jersey === p.jersey)) throw new ApiError('number taken');
  d.members.push(newMember(l, user.id, p.name, p.jersey, p.colour, 'member'));
  await save();
  return l.id;
}

function newMember(l: StoredLeague, userId: string | null, name: string, jersey: number, colour: PlayerColour, role: Member['role']): Member {
  return { id: uid(), league_id: l.id, user_id: userId, display_name: name, jersey, colour, role, rating: l.start_rating, wins: 0, losses: 0, streak: 0, last_played_at: null };
}

export async function updateMember(memberId: string, p: { display_name?: string; jersey?: number; colour?: PlayerColour }) {
  await wait(150);
  const d = await db();
  const m = d.members.find((x) => x.id === memberId);
  if (!m) throw new ApiError('unknown player');
  if (p.jersey !== undefined && p.jersey !== m.jersey && d.members.some((x) => x.league_id === m.league_id && !x.status && x.jersey === p.jersey)) throw new ApiError('number taken');
  Object.assign(m, p);
  await save();
}

/* ---------- match detail, reactions, undo and edit ---------- */
export const REACTIONS = ['🔥', '👏', '😂', '😮', '💀'] as const;
export const EDIT_WINDOW_MIN = 15;
export type MatchDetail = MatchRow & { league_id: string; reactions: { emoji: string; count: number; mine: boolean; who: string[] }[] };

export async function getMatch(matchId: string, userId: string): Promise<MatchDetail | null> {
  const d = await db();
  const m = d.matches.find((x) => x.id === matchId);
  if (!m) return null;
  if (m.status && settle(d, m.league_id, afterCounted)) await save();
  const me = d.members.find((x) => x.league_id === m.league_id && x.user_id === userId);
  const rs = (d.reactions ?? []).filter((r) => r.match_id === matchId);
  const name = (id: string) => d.members.find((x) => x.id === id)?.display_name ?? '';
  return {
    ...joinMatch(d, m),
    league_id: m.league_id,
    reactions: REACTIONS.map((emoji) => {
      const list = rs.filter((r) => r.emoji === emoji);
      return { emoji, count: list.length, mine: list.some((r) => r.member_id === me?.id), who: list.map((r) => name(r.member_id)) };
    }),
  };
}

export async function toggleReaction(user: User, matchId: string, emoji: string) {
  const d = await db();
  const m = d.matches.find((x) => x.id === matchId);
  const me = m && d.members.find((x) => x.league_id === m.league_id && x.user_id === user.id);
  if (!m || !me) throw new ApiError('not a member');
  d.reactions = d.reactions ?? [];
  const i = d.reactions.findIndex((r) => r.match_id === matchId && r.member_id === me.id && r.emoji === emoji);
  if (i >= 0) d.reactions.splice(i, 1); else d.reactions.push({ match_id: matchId, member_id: me.id, emoji });
  noticesForReaction(d, matchId, me.id);
  await save();
}

// Who may change a match: the person who logged it within 15 minutes, or a league owner or admin any time.
export async function canEditMatch(user: User, matchId: string) {
  const d = await db();
  const m = d.matches.find((x) => x.id === matchId);
  if (!m) return { allowed: false, minutesLeft: 0, admin: false };
  const me = d.members.find((x) => x.league_id === m.league_id && x.user_id === user.id);
  const admin = me?.role === 'owner' || me?.role === 'admin';
  const minutesLeft = Math.max(0, EDIT_WINDOW_MIN - Math.floor((Date.now() - new Date(m.played_at).getTime()) / 60000));
  return { allowed: admin || (m.created_by === user.id && minutesLeft > 0), minutesLeft, admin };
}

export async function deleteMatch(user: User, matchId: string) {
  const d = await db();
  const m = d.matches.find((x) => x.id === matchId);
  if (!m || !(await canEditMatch(user, matchId)).allowed) throw new ApiError('not allowed');
  d.matches = d.matches.filter((x) => x.id !== matchId);
  d.mps = d.mps.filter((p) => p.match_id !== matchId);
  d.reactions = (d.reactions ?? []).filter((r) => r.match_id !== matchId);
  if (d.disputes) d.disputes = d.disputes.filter((x) => x.match_id !== matchId);
  replayLeague(d, m.league_id);
  await save();
}

export async function editMatch(user: User, matchId: string, p: { winner: 'a' | 'b'; score: [number, number] | null }) {
  const d = await db();
  const m = d.matches.find((x) => x.id === matchId);
  if (!m || !(await canEditMatch(user, matchId)).allowed) throw new ApiError('not allowed');
  m.winner = p.winner; m.score_a = p.score?.[0] ?? null; m.score_b = p.score?.[1] ?? null;
  replayLeague(d, m.league_id);
  await save();
}

export async function recordMatch(user: User, p: { league: string; a: string[]; b: string[]; winner: 'a' | 'b'; score?: [number, number] | null }) {
  await wait(250);
  const d = await db();
  if (!d.members.some((m) => m.league_id === p.league && m.user_id === user.id)) throw new ApiError('not a member');
  if (d.leagues.find((l) => l.id === p.league)?.archived_at) throw new ApiError('league archived');
  if (!confirmOn(d, p.league)) {
    const res = applyMatch(d, p.league, p.a, p.b, p.winner, user.id, p.score);
    noticesForMatch(d, res.matchId);
    runMatchHooks(d, res.matchId);
    await save();
    return { ...res, pending: null };
  }
  // Confirmation module: the match waits for the other side. A matching log from them confirms the first one.
  const me = memberOf(d, p.league, user.id);
  const twin = findTwin(d, p.league, p.a, p.b, p.winner, me);
  if (twin) {
    confirmCore(d, twin.id, me!, afterCounted);
    await save();
    const ps = d.mps.filter((x) => x.match_id === twin.id), mine = ps.find((x) => x.member_id === me!.id);
    return { matchId: twin.id, deltaA: (ps.find((x) => x.side === 'a')?.delta ?? 0), pending: null, merged: true, mySide: mine?.side };
  }
  const res = applyMatch(d, p.league, p.a, p.b, p.winner, user.id, p.score, new Date(), true);
  const m = d.matches.find((x) => x.id === res.matchId)!;
  const who = confirmers(d, m);
  audit(d, m, me?.display_name ?? 'Someone', `Logged by ${me?.display_name ?? 'someone'}`);
  const score = m.score_a == null || m.score_b == null ? '' : `, ${m.winner === 'a' ? m.score_a : m.score_b} : ${m.winner === 'a' ? m.score_b : m.score_a}`;
  for (const id of who) {
    if (!d.members.find((x) => x.id === id)?.user_id) continue;
    const won = (m.winner === 'a' ? p.a : p.b).includes(id);
    notify(d, { league_id: p.league, member_id: id, kind: 'match.confirm', title: 'Confirm result', body: `${me?.display_name ?? 'Someone'} logged a ${won ? 'win for you' : 'loss for you'}${score}.`, href: `/confirm/${m.id}` });
  }
  await save();
  const hours = Math.round((new Date(dueAt(d, m)).getTime() - Date.now()) / 3600000);
  return { ...res, pending: { names: who.map((id) => d.members.find((x) => x.id === id)?.display_name ?? 'Someone'), hours, required: rulesFor(d, p.league).mode === 'required' } };
}

export async function resetLocalData() { cache = null; await AsyncStorage.removeItem(DB_KEY); }
