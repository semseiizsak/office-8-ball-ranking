// Pure account rules: age bands (A4), data export (B1.6) and account deletion (B1.7). account.ts wraps them with storage.
import type { DB } from '@/lib/engine';
import type { Member } from '@/lib/types';

export type AgeBand = 'under13' | '13_15' | '16_17' | 'adult';
export type AccountStore = {
  profiles: Record<string, { age_band: AgeBand; set_at: string }>; // user id -> band only, never the birth date
  blocked: Record<string, string>; // under 13 sign ups, user id -> when
  exports: Record<string, string>; // user id -> last export
};
export const astore = (d: DB): AccountStore => {
  const a = (d.account ?? {}) as Partial<AccountStore>;
  d.account = { profiles: {}, blocked: {}, exports: {}, ...a };
  return d.account as AccountStore;
};

// month 1 to 12. The birthday counts as passed only after its month.
export function ageFrom(year: number, month: number, now = new Date()) {
  return now.getFullYear() - year - (now.getMonth() + 1 <= month ? 1 : 0);
}
export function bandOf(age: number): AgeBand {
  return age < 13 ? 'under13' : age < 16 ? '13_15' : age < 18 ? '16_17' : 'adult';
}
export const under16 = (b: AgeBand | null | undefined) => b === 'under13' || b === '13_15';

/* ---------- generic walk over every feature collection ---------- */
// Fields that tie a record to a person. Kept core tables (members, matches, mps, teams, leagues) are handled on their own.
const PERSON = ['member_id', 'author', 'user_id', 'reporter', 'created_by', 'by', 'from', 'to', 'member', 'paid_by'];
const KEEP = new Set(['teams', 'leagues', 'members', 'matches', 'mps']);
type Pred = (o: Record<string, unknown>) => boolean;

function walk(node: unknown, hit: Pred, keys: Set<string>, out: unknown[] | null): unknown {
  if (Array.isArray(node)) {
    const kept: unknown[] = [];
    for (const item of node) {
      if (item && typeof item === 'object' && !Array.isArray(item) && hit(item as Record<string, unknown>)) { out?.push(item); if (out) kept.push(item); continue; }
      kept.push(out ? item : walk(item, hit, keys, out));
      if (out) walk(item, hit, keys, out);
    }
    return kept;
  }
  if (node && typeof node === 'object') {
    const o = node as Record<string, unknown>;
    for (const k of Object.keys(o)) {
      if (keys.has(k)) { if (out) out.push({ [k]: o[k] }); else delete o[k]; continue; }
      const next = walk(o[k], hit, keys, out);
      if (!out) o[k] = next;
    }
  }
  return node;
}
// Remove (out = null) or collect (out = array) every record about these ids, outside the kept core tables.
function sweep(d: DB, ids: Set<string>, fields: string[], out: unknown[] | null) {
  const hit: Pred = (o) => fields.some((f) => typeof o[f] === 'string' && ids.has(o[f] as string));
  for (const k of Object.keys(d)) {
    if (KEEP.has(k)) continue;
    const next = walk(d[k], hit, ids, out);
    if (!out) d[k] = next;
  }
}

/* ---------- B1.6 export ---------- */
export function exportFor(d: DB, user: { id: string; email: string }) {
  const mine = d.members.filter((m) => m.user_id === user.id);
  const ids = new Set(mine.map((m) => m.id));
  const matchIds = new Set(d.mps.filter((p) => ids.has(p.member_id)).map((p) => p.match_id));
  const name = (id: string) => d.members.find((m) => m.id === id)?.display_name ?? 'Former player';
  const matches = d.matches.filter((m) => matchIds.has(m.id)).map((m) => ({
    id: m.id, league: d.leagues.find((l) => l.id === m.league_id)?.name, played_at: m.played_at, format: m.format, winner: m.winner, score: [m.score_a, m.score_b], status: m.status ?? 'counted',
    players: d.mps.filter((p) => p.match_id === m.id).map((p) => ({ name: name(p.member_id), side: p.side, delta: p.delta, you: ids.has(p.member_id) })),
  }));
  const other: unknown[] = [];
  sweep(d, new Set([user.id, ...ids]), PERSON, other);
  return {
    exported_at: new Date().toISOString(), format: 'Liga data export v1',
    account: { id: user.id, email: user.email, age_band: astore(d).profiles[user.id]?.age_band ?? null },
    players: mine.map((m) => ({ league: d.leagues.find((l) => l.id === m.league_id)?.name, name: m.display_name, jersey: m.jersey, colour: m.colour, role: m.role, rating: m.rating, wins: m.wins, losses: m.losses })),
    matches, other,
  };
}

/* ---------- B1.7 deletion ---------- */
export type Handover = Record<string, string | 'delete'>; // league id -> new owner member id, or delete the league
export function ownedLeagues(d: DB, userId: string) {
  return d.members.filter((m) => m.user_id === userId && m.role === 'owner' && !m.status).map((me) => {
    const l = d.leagues.find((x) => x.id === me.league_id)!;
    const others = d.members.filter((m) => m.league_id === me.league_id && m.id !== me.id && !m.status && !m.guest);
    const rank = (m: Member) => (m.role === 'admin' ? 1e6 : 0) + (m.user_id ? 1e5 : 0) + m.wins + m.losses;
    const pick = [...others].sort((a, b) => rank(b) - rank(a))[0] ?? null;
    return { league: l, team: d.teams.find((t) => t.id === l?.team_id)?.name ?? '', members: others, suggested: pick?.id ?? null };
  }).filter((x) => !!x.league);
}

export function removeLeague(d: DB, leagueId: string) {
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) return;
  const matchIds = new Set(d.matches.filter((m) => m.league_id === leagueId).map((m) => m.id));
  d.leagues = d.leagues.filter((x) => x.id !== leagueId);
  d.members = d.members.filter((m) => m.league_id !== leagueId);
  d.matches = d.matches.filter((m) => m.league_id !== leagueId);
  d.mps = d.mps.filter((p) => !matchIds.has(p.match_id));
  sweep(d, new Set([leagueId, ...matchIds]), ['league_id', 'match_id'], null);
  if (!d.leagues.some((x) => x.team_id === l.team_id)) d.teams = d.teams.filter((t) => t.id !== l.team_id);
}

// Deletes everything personal. Matches stay with a "Former player" so ladders keep their history.
export function deleteUserData(d: DB, userId: string, handover: Handover, notify?: (m: Member, leagueName: string) => void) {
  for (const o of ownedLeagues(d, userId)) {
    const choice = handover[o.league.id] ?? o.suggested ?? 'delete';
    if (choice === 'delete' || !o.members.length) { removeLeague(d, o.league.id); continue; }
    const next = d.members.find((m) => m.id === choice && m.league_id === o.league.id);
    if (!next) { removeLeague(d, o.league.id); continue; }
    next.role = 'owner';
    notify?.(next, o.league.name);
  }
  const mine = d.members.filter((m) => m.user_id === userId);
  const ids = new Set([userId, ...mine.map((m) => m.id)]);
  sweep(d, ids, PERSON, null);
  const now = new Date().toISOString();
  mine.forEach((m) => Object.assign(m, { user_id: null, former_user_id: null, display_name: 'Former player', role: 'member', status: 'left', left_at: now }));
  d.matches.forEach((m) => { if (m.created_by === userId) m.created_by = 'former'; });
}
