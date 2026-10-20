// League and team admin (B3, B4): roles, rules, members, leave, archive. Local store only.
import { db, save, wait, type User } from '@/lib/api';
import { ApiError, notify, replayLeague, uid, type DB } from '@/lib/engine';
import type { Member } from '@/lib/types';

export type Role = Member['role'];
export const K_SPEEDS = [{ k: 16, label: 'Steady' }, { k: 32, label: 'Normal' }, { k: 48, label: 'Fast' }] as const;
export const ROLE_LABEL: Record<Role, string> = { owner: 'Owner', admin: 'Admin', member: 'Member' };

/* ---------- role checks (pure, usable in screens) ---------- */
export const isAdmin = (m?: Member | null) => m?.role === 'owner' || m?.role === 'admin';
export const isOwner = (m?: Member | null) => m?.role === 'owner';
// Owner can act on anyone but themself; an admin only on plain members.
export const canActOn = (me: Member | null | undefined, target: Member) =>
  !!me && me.id !== target.id && !target.status && (me.role === 'owner' || (me.role === 'admin' && target.role === 'member'));

/* ---------- helpers ---------- */
const league = (d: DB, id: string) => { const l = d.leagues.find((x) => x.id === id); if (!l) throw new ApiError('unknown league'); return l; };
const meIn = (d: DB, user: User, leagueId: string) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);
function requireRole(d: DB, user: User, leagueId: string, owner = false) {
  const me = meIn(d, user, leagueId);
  if (!me || (owner ? !isOwner(me) : !isAdmin(me))) throw new ApiError('not allowed');
  return me;
}
function requireOpen(d: DB, leagueId: string) { if (league(d, leagueId).archived_at) throw new ApiError('league archived'); }
const target = (d: DB, memberId: string) => { const m = d.members.find((x) => x.id === memberId); if (!m) throw new ApiError('unknown player'); return m; };
const admins = (d: DB, leagueId: string, except?: string) => d.members.filter((m) => m.league_id === leagueId && !m.status && isAdmin(m) && m.id !== except);

/* ---------- reads ---------- */
export async function leagueAdminInfo(leagueId: string) {
  const d = await db();
  const l = league(d, leagueId);
  return {
    league: l,
    team: d.teams.find((t) => t.id === l.team_id) ?? null,
    memberCount: d.members.filter((m) => m.league_id === leagueId && !m.status).length,
    matchCount: d.matches.filter((m) => m.league_id === leagueId).length,
    former: d.members.filter((m) => m.league_id === leagueId && m.status).sort((a, b) => (b.left_at ?? '').localeCompare(a.left_at ?? '')),
  };
}

/* ---------- general (B4.1, B3.1) ---------- */
export async function updateLeague(user: User, leagueId: string, p: { name?: string; sport?: string; team?: string }) {
  await wait(150);
  const d = await db();
  const me = requireRole(d, user, leagueId);
  requireOpen(d, leagueId);
  const l = league(d, leagueId);
  if (p.name !== undefined) { if (p.name.trim().length < 2) throw new ApiError('name too short'); l.name = p.name.trim(); }
  if (p.sport !== undefined && p.sport !== l.sport) {
    l.sport = p.sport;
    feed(d, leagueId, me.id, 'League updated', `${me.display_name} changed the sport. Ratings and matches stay.`);
  }
  if (p.team !== undefined && p.team.trim().length >= 2) { const t = d.teams.find((x) => x.id === l.team_id); if (t) t.name = p.team.trim(); }
  await save();
}

/* ---------- rating (B4.2) ---------- */
// A new K applies to future matches only: every match already played keeps the K it was scored with,
// so a later undo or edit replays history the same way. recalculate() rescores everything with the current K.
export async function setKFactor(user: User, leagueId: string, k: number) {
  await wait(150);
  const d = await db();
  const me = requireRole(d, user, leagueId);
  requireOpen(d, leagueId);
  const l = league(d, leagueId);
  if (!K_SPEEDS.some((s) => s.k === k) || k === l.k_factor) return;
  d.matches.forEach((m) => { if (m.league_id === leagueId && m.k == null) m.k = l.k_factor; });
  l.k_factor = k;
  feed(d, leagueId, me.id, 'Rating speed changed', `${me.display_name} changed the rating speed to ${K_SPEEDS.find((s) => s.k === k)!.label}.`);
  await save();
}

export async function recalculate(user: User, leagueId: string) {
  await wait(400);
  const d = await db();
  const me = requireRole(d, user, leagueId);
  requireOpen(d, leagueId);
  const l = league(d, leagueId);
  d.matches.forEach((m) => { if (m.league_id === leagueId) m.k = l.k_factor; });
  replayLeague(d, leagueId);
  feed(d, leagueId, me.id, 'Ratings recalculated', `${me.display_name} replayed every match with the current rating speed.`);
  await save();
}

/* ---------- members and roles (B3.2.1, B4.7.1) ---------- */
export async function setRole(user: User, memberId: string, role: 'admin' | 'member') {
  await wait(120);
  const d = await db();
  const t = target(d, memberId);
  const me = requireRole(d, user, t.league_id);
  if (!canActOn(me, t) || t.role === 'owner') throw new ApiError('not allowed');
  t.role = role;
  const name = league(d, t.league_id).name;
  notify(d, { league_id: t.league_id, member_id: t.id, kind: 'role', title: role === 'admin' ? "You're now an admin" : 'Admin role removed', body: role === 'admin' ? `You can now manage ${name}.` : `You're a member of ${name}.`, href: '/league' });
  await save();
}

// Owner hands the league to an admin and becomes an admin. Test build: no accept step (B3.5 asks the new owner first).
export async function transferOwnership(user: User, memberId: string) {
  await wait(200);
  const d = await db();
  const t = target(d, memberId);
  const me = requireRole(d, user, t.league_id, true);
  if (t.status || t.role !== 'admin') throw new ApiError('make them an admin first');
  t.role = 'owner'; me.role = 'admin';
  notify(d, { league_id: t.league_id, member_id: t.id, kind: 'owner', title: "You're the owner now", body: `${me.display_name} handed ${league(d, t.league_id).name} over to you.`, href: '/league' });
  await save();
}

// Removed players vanish from the ladder and pickers; their matches stay and show as a former player.
export async function removeMember(user: User, memberId: string) {
  await wait(200);
  const d = await db();
  const t = target(d, memberId);
  const me = requireRole(d, user, t.league_id);
  if (!canActOn(me, t) || t.role === 'owner') throw new ApiError('not allowed');
  retire(t, 'removed');
  await save();
}

// Undo a remove or bring a former player back with their old rating (R10.2 Undo, R10.1 Invite back).
export async function restoreMember(user: User, memberId: string) {
  await wait(200);
  const d = await db();
  const t = target(d, memberId);
  requireRole(d, user, t.league_id);
  if (!t.status) return;
  if (d.members.some((m) => m.league_id === t.league_id && !m.status && m.jersey === t.jersey)) throw new ApiError('number taken');
  if (t.former_user_id && d.members.some((m) => m.league_id === t.league_id && m.user_id === t.former_user_id)) throw new ApiError('already back');
  t.user_id = t.former_user_id ?? null;
  t.role = 'member';
  delete t.status; delete t.left_at; delete t.former_user_id;
  await save();
}

/* ---------- leave and archive (B3.6, B4.9) ---------- */
export async function leaveLeague(user: User, leagueId: string) {
  await wait(200);
  const d = await db();
  const me = meIn(d, user, leagueId);
  if (!me) return;
  if (isOwner(me)) throw new ApiError('transfer ownership first');
  admins(d, leagueId, me.id).forEach((a) => notify(d, { league_id: leagueId, member_id: a.id, kind: 'left', title: `${me.display_name} left`, body: `${me.display_name} left ${league(d, leagueId).name}. Their matches stay.`, href: '/league/members' }));
  retire(me, 'left');
  await save();
}

export async function setArchived(user: User, leagueId: string, archived: boolean) {
  await wait(200);
  const d = await db();
  const me = requireRole(d, user, leagueId, true);
  const l = league(d, leagueId);
  l.archived_at = archived ? new Date().toISOString() : null;
  d.members.filter((m) => m.league_id === leagueId && !m.status && m.id !== me.id).forEach((m) => notify(d, {
    league_id: leagueId, member_id: m.id, kind: 'archive', href: '/league',
    title: archived ? `${l.name} is archived` : `${l.name} is back`,
    body: archived ? 'No new matches. Everything stays readable.' : 'You can log matches again.',
  }));
  await save();
}

/* ---------- feedback (B6.2) ---------- */
export async function sendFeedback(user: User, p: { leagueId: string | null; kind: string; text: string; device: string | null }) {
  await wait(300);
  const d = await db();
  d.feedback = d.feedback ?? [];
  d.feedback.push({ id: uid(), user_id: user.id, league_id: p.leagueId, kind: p.kind, text: p.text.trim(), device: p.device, created_at: new Date().toISOString() });
  await save();
}

function retire(m: Member, status: 'left' | 'removed') {
  m.status = status;
  m.former_user_id = m.user_id;
  m.user_id = null; // the person no longer sees or acts in this league
  m.left_at = new Date().toISOString();
  if (m.role !== 'owner') m.role = 'member';
}

// League feed system line (B4 notifications): an inbox notice to every other member.
function feed(d: DB, leagueId: string, byId: string, title: string, body: string) {
  d.members.filter((m) => m.league_id === leagueId && !m.status && m.id !== byId).forEach((m) => notify(d, { league_id: leagueId, member_id: m.id, kind: 'rules', title, body, href: '/league/rules' }));
}
