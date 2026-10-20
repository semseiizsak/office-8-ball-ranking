import { avg, eloPreview } from '@/lib/elo';
import type { League, MatchRow, Member } from '@/lib/types';

export type Team = { id: string; name: string };
export type StoredLeague = Omit<League, 'teams'> & { created_at: string; start_rating: number };
export type StoredMatch = Omit<MatchRow, 'match_players'> & { league_id: string; k?: number; // k: K factor at the time it was played
  sides?: { a: string[]; b: string[] }; confirmed_at?: string; confirmed_by?: string; seen_at?: string; nudged_at?: string }; // confirmation module: sides kept while a match has no rows
export type StoredMP = { match_id: string; member_id: string; side: 'a' | 'b'; delta: number; rating_before: number; rating_after: number };
export type Reaction = { match_id: string; member_id: string; emoji: string };
export type Notice = {
  id: string; league_id: string; member_id: string; // recipient (league member)
  kind: string; title: string; body: string; href: string; created_at: string; read: boolean;
};
// Feature modules add their own optional collections here (challenges, notices, ...).
export type DB = {
  teams: Team[]; leagues: StoredLeague[]; members: Member[]; matches: StoredMatch[]; mps: StoredMP[];
  reactions?: Reaction[];
  notices?: Notice[];
  challenges?: import('@/lib/challenges').Challenge[];
  invites?: { league_id: string; code: string; created_by: string; created_at: string; expires_at: string | null }[];
  guests?: import('@/lib/guests').GuestRecord[];
  disputes?: import('@/lib/confirm-engine').Dispute[]; matchRules?: Record<string, import('@/lib/confirm-engine').MatchRules>; matchAudit?: import('@/lib/confirm-engine').Audit[];
  feedback?: { id: string; user_id: string; league_id: string | null; kind: string; text: string; device: string | null; created_at: string }[];
  chat?: import('@/lib/chat-store').ChatStore;
  live?: import('@/lib/live').LiveMatch[];
  kiosks?: import('@/lib/kiosk-core').Kiosk[];
  coins?: import('@/lib/coins').CoinStore; quests?: import('@/lib/quests').QuestStore; awards?: import('@/lib/awards').Award[];
  cups?: import('@/lib/cup').Cup[]; cupSettings?: Record<string, Partial<import('@/lib/cup').CupSettings>>; schedule?: import('@/lib/schedule').ScheduleStore;
  badges?: Record<string, import('@/lib/badges').BadgeStore>; // per league
  cards?: import('@/lib/cards').CardStore; shop?: import('@/lib/shop').ShopStore; pass?: import('@/lib/pass').PassStore;
  billing?: import('@/lib/billing').BillingStore; account?: import('@/lib/account').AccountStore;
  predictions?: import('@/lib/predictions').PredStore; moderation?: import('@/lib/moderation').ModStore;
  [extra: string]: unknown;
};

// Inbox contract: any feature calls notify() inside its write, before save().
export function notify(d: DB, n: Omit<Notice, 'id' | 'created_at' | 'read'>) {
  d.notices = d.notices ?? [];
  d.notices.push({ ...n, id: uid(), created_at: new Date().toISOString(), read: false });
}

export class ApiError extends Error {}
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// Same rules as the server function record_match: K from the league, 2v2 uses the side average,
// everyone on a side moves by the same amount.
// pending: the confirmation module is on, so the match waits without touching ratings (status 'pending', sides stored).
export function applyMatch(d: DB, leagueId: string, a: string[], b: string[], winner: 'a' | 'b', createdBy: string, score?: [number, number] | null, at = new Date(), pending = false) {
  if (a.length !== b.length || ![1, 2].includes(a.length)) throw new ApiError('bad sides');
  if (a.some((x) => b.includes(x))) throw new ApiError('player on both sides');
  const match: StoredMatch = { id: uid(), league_id: leagueId, format: a.length === 1 ? '1v1' : '2v2', winner, score_a: score?.[0] ?? null, score_b: score?.[1] ?? null, created_by: createdBy, played_at: at.toISOString(), k: d.leagues.find((x) => x.id === leagueId)?.k_factor };
  let deltaA: number;
  if (pending) {
    const rating = (ids: string[]) => avg(ids.map((id) => { const m = d.members.find((x) => x.id === id && x.league_id === leagueId); if (!m) throw new ApiError('unknown player'); return m.rating; }));
    const p = eloPreview(rating(a), rating(b), match.k ?? 32);
    deltaA = winner === 'a' ? p.aWins : p.bWins;
    Object.assign(match, { status: 'pending', sides: { a, b } });
  } else deltaA = scoreMatch(d, match, a, b);
  d.matches.push(match);
  return { matchId: match.id, deltaA };
}

// Applies one match to the players' ratings and writes its match_players rows.
function scoreMatch(d: DB, match: StoredMatch, a: string[], b: string[]) {
  const l = d.leagues.find((x) => x.id === match.league_id)!;
  const get = (id: string) => { const m = d.members.find((x) => x.id === id && x.league_id === match.league_id); if (!m) throw new ApiError('unknown player'); return m; };
  const A = a.map(get), B = b.map(get);
  const { aWins, bWins } = eloPreview(avg(A.map((m) => m.rating)), avg(B.map((m) => m.rating)), match.k ?? l.k_factor);
  const da = match.winner === 'a' ? aWins : bWins;
  for (const [side, list, delta] of [['a', A, da], ['b', B, -da]] as const) {
    for (const m of list) {
      d.mps.push({ match_id: match.id, member_id: m.id, side, delta, rating_before: m.rating, rating_after: m.rating + delta });
      m.rating += delta;
      if (side === match.winner) { m.wins++; m.streak = Math.max(m.streak, 0) + 1; } else { m.losses++; m.streak = Math.min(m.streak, 0) - 1; }
      m.last_played_at = match.played_at;
    }
  }
  return da;
}

// Only confirmed matches (no status) move ratings.
export const counts = (m: Pick<StoredMatch, 'status'>) => !m.status;
export function sidesOf(d: DB, m: StoredMatch) {
  const ps = d.mps.filter((p) => p.match_id === m.id);
  if (!ps.length) return m.sides ?? { a: [], b: [] };
  return { a: ps.filter((p) => p.side === 'a').map((p) => p.member_id), b: ps.filter((p) => p.side === 'b').map((p) => p.member_id) };
}

// Rebuilds every rating in a league from its confirmed matches, in played order.
// Used after an undo, delete, edit or confirmation so ratings always match the history.
export function replayLeague(d: DB, leagueId: string) {
  const l = d.leagues.find((x) => x.id === leagueId)!;
  const all = d.matches.filter((m) => m.league_id === leagueId);
  const matches = all.filter(counts).sort((x, y) => x.played_at.localeCompare(y.played_at));
  const ids = new Set(all.map((m) => m.id));
  const sides = new Map<string, { a: string[]; b: string[] }>();
  d.mps.filter((p) => ids.has(p.match_id)).forEach((p) => {
    const s = sides.get(p.match_id) ?? { a: [], b: [] };
    s[p.side].push(p.member_id);
    sides.set(p.match_id, s);
  });
  d.mps = d.mps.filter((p) => !ids.has(p.match_id));
  d.members.filter((m) => m.league_id === leagueId).forEach((m) => { m.rating = l.start_rating; m.wins = 0; m.losses = 0; m.streak = 0; m.last_played_at = null; });
  matches.forEach((m) => { const s = sides.get(m.id) ?? m.sides; if (s) scoreMatch(d, m, s.a, s.b); });
}
