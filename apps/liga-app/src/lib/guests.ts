// Players without an account (A9.4, M1.7, R10.5) and taking one over (A15.1, A15.4). Local store only.
import { ApiError, db, save, wait, type User } from '@/lib/api';
import { notify, uid, type DB } from '@/lib/engine';
import type { Member } from '@/lib/types';
import { playerColours, type PlayerColour } from '@/theme';

export type GuestRecord = { member_id: string; league_id: string; created_by: string; created_at: string; claimed_by?: string | null; claimed_at?: string | null };
export type Candidate = { member: Member; matches: number; score: number; addedBy: string | null };

const norm = (s: string) => s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
function distance(a: string, b: string) {
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0]; row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return row[b.length];
}
// 0 means no match; higher is closer. "Kim" vs "Kim B" or "kim" match, "Dave" vs "Davy" is close.
export function nameScore(a: string, b: string) {
  const x = norm(a), y = norm(b);
  if (!x || !y) return 0;
  if (x === y) return 4;
  const fx = x.split(/\s+/)[0], fy = y.split(/\s+/)[0];
  if (fx === fy) return 3;
  if (x.startsWith(y) || y.startsWith(x)) return 2;
  return Math.min(fx.length, fy.length) >= 4 && distance(fx, fy) <= 1 ? 1 : 0;
}

const active = (d: DB, leagueId: string) => d.members.filter((m) => m.league_id === leagueId && !m.status);
const meIn = (d: DB, user: User, leagueId: string) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);

export function freeJersey(taken: Set<number>) {
  return [7, 10, 9, 11, 8, 23, 5, 3, ...Array.from({ length: 100 }, (_, i) => i)].find((n) => !taken.has(n)) ?? 0;
}
function freeColour(list: Member[]): PlayerColour {
  const used = (c: PlayerColour) => list.filter((m) => m.colour === c).length;
  return (Object.keys(playerColours) as PlayerColour[]).reduce((best, c) => (used(c) < used(best) ? c : best), 'blue');
}

/* ---------- add ---------- */
// Any member may add one while logging; the record keeps who did it for the claim notice.
export async function addGuest(user: User, leagueId: string, name: string) {
  await wait(200);
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  const me = meIn(d, user, leagueId);
  if (!l || !me) throw new ApiError('not a member');
  if (l.archived_at) throw new ApiError('league archived');
  const clean = name.trim().replace(/\s+/g, ' ');
  if (clean.length < 1) throw new ApiError('name too short');
  const list = active(d, leagueId);
  if (list.some((m) => norm(m.display_name) === norm(clean))) throw new ApiError('name taken');
  const m: Member = {
    id: uid(), league_id: leagueId, user_id: null, display_name: clean, jersey: freeJersey(new Set(list.map((x) => x.jersey))), colour: freeColour(list),
    role: 'member', rating: l.start_rating, wins: 0, losses: 0, streak: 0, last_played_at: null, guest: true,
  };
  d.members.push(m);
  d.guests = d.guests ?? [];
  d.guests.push({ member_id: m.id, league_id: leagueId, created_by: user.id, created_at: new Date().toISOString() });
  await save();
  return m;
}

/* ---------- claim ---------- */
export async function claimCandidates(user: User, leagueId: string): Promise<Candidate[]> {
  const d = await db();
  const me = meIn(d, user, leagueId);
  if (!me) return [];
  const byUser = (u: string) => d.members.find((m) => m.league_id === leagueId && m.user_id === u)?.display_name ?? null;
  return active(d, leagueId).filter((m) => m.guest && !m.user_id)
    .map((m) => ({ member: m, matches: m.wins + m.losses, score: nameScore(me.display_name, m.display_name), addedBy: byUser(d.guests?.find((g) => g.member_id === m.id)?.created_by ?? '') }))
    .sort((a, b) => b.score - a.score || b.matches - a.matches)
    .slice(0, 30);
}
export const hasNameMatch = async (user: User, leagueId: string) => (await claimCandidates(user, leagueId)).some((c) => c.score > 0);

// The new member takes over the guest: rating, matches and number stay, the fresh empty player goes away.
// A15.4: if the person already played here, an admin has to merge (not in the test build).
export async function claimGuest(user: User, leagueId: string, guestId: string) {
  await wait(250);
  const d = await db();
  const me = meIn(d, user, leagueId);
  const g = d.members.find((m) => m.id === guestId && m.league_id === leagueId);
  if (!me) throw new ApiError('not a member');
  if (!g || !g.guest || g.user_id || g.status) throw new ApiError('already claimed');
  if (me.wins + me.losses > 0) throw new ApiError('already playing');
  g.user_id = user.id; g.role = me.role; delete g.guest;
  (d.notices ?? []).forEach((n) => { if (n.member_id === me.id) n.member_id = g.id; });
  d.members = d.members.filter((m) => m.id !== me.id);
  const rec = d.guests?.find((x) => x.member_id === g.id);
  if (rec) { rec.claimed_by = user.id; rec.claimed_at = new Date().toISOString(); }
  const n = g.wins + g.losses;
  const told = new Set<string>();
  active(d, leagueId).filter((m) => m.id !== g.id && (m.role !== 'member' || (rec && m.user_id === rec.created_by))).forEach((m) => {
    if (told.has(m.id)) return; told.add(m.id);
    notify(d, { league_id: leagueId, member_id: m.id, kind: 'claim', title: `${g.display_name} joined`, body: `${g.display_name} took over their player with ${n} ${n === 1 ? 'match' : 'matches'}.`, href: `/player/${g.id}` });
  });
  await save();
  return { name: g.display_name, matches: n, rating: g.rating };
}
