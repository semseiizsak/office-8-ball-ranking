// Match confirmation module, screen side (M3.1 to M3.5, M4.4, M15, M16.1 to M16.4). Rules live in confirm-engine.ts.
import { afterCounted, ApiError, db, save, settled, wait, type User } from '@/lib/api';
import {
  acceptProposal, answerNoShow, confirmers, confirmMatch, confirmOn, disputeOf, dueAt, escalate, isAdminM, loggerMember, markSeen, memberOf,
  nudge, openDispute, postMessage, previewRows, removeDisputed, reportNoShow, resolveDispute, restoreDuplicate, rulesFor, setRules, settle,
  updateProposal, withdraw, NUDGE_MIN, type Decision, type Dispute, type MatchRules, type Proposal, type Reason,
} from '@/lib/confirm-engine';
import { sidesOf, type DB, type StoredMatch } from '@/lib/engine';
import type { MatchRow, Member } from '@/lib/types';

export type PendingItem = { match: MatchRow; due: string; logger: string; dispute?: Dispute; canConfirm: boolean };
export type Role = 'confirmer' | 'logger' | 'opener' | 'answer' | 'admin' | 'viewer';

const row = (d: DB, m: StoredMatch): MatchRow => ({ ...m, match_players: m.status ? previewRows(d, m) : d.mps.filter((p) => p.match_id === m.id) });
const meIn = (d: DB, leagueId: string, user: User) => {
  const me = memberOf(d, leagueId, user.id);
  if (!me) throw new ApiError('not a member');
  return me;
};
const matchOf = (d: DB, id: string) => {
  const m = d.matches.find((x) => x.id === id);
  if (!m) throw new ApiError('match removed');
  return m;
};
const run = async <T,>(f: (d: DB) => T) => {
  await wait(150);
  const d = await db();
  try { const out = f(d); await save(); return out; } catch (e) { if (e instanceof ApiError) throw e; throw new ApiError((e as Error).message); }
};

/* ---------- reads ---------- */
export async function confirmState(leagueId: string) {
  const d = await db();
  return { on: confirmOn(d, leagueId), rules: rulesFor(d, leagueId) };
}

// M3.4: waiting for you, waiting for others, and for admins everything open in the league.
export async function pendingLists(user: User, leagueId: string) {
  const d = await settled(leagueId);
  const me = memberOf(d, leagueId, user.id);
  const waiting = d.matches.filter((m) => m.league_id === leagueId && (m.status === 'pending' || m.status === 'disputed' || m.status === 'no_show'))
    .sort((a, b) => b.played_at.localeCompare(a.played_at)).slice(0, 50);
  const item = (m: StoredMatch): PendingItem => {
    const x = disputeOf(d, m.id);
    return { match: row(d, m), due: x && x.status !== 'resolved' ? x.deadline : dueAt(d, m), logger: loggerMember(d, m) === me?.id ? 'You' : d.members.find((y) => y.id === loggerMember(d, m))?.display_name ?? 'Someone', dispute: x && x.status !== 'resolved' ? x : undefined, canConfirm: m.status === 'pending' && !!me && confirmers(d, m).includes(me.id) };
  };
  const mine = (m: StoredMatch) => {
    if (!me) return null;
    const s = sidesOf(d, m);
    if (m.status === 'pending') return confirmers(d, m).includes(me.id) ? 'you' : [...s.a, ...s.b].includes(me.id) || m.created_by === user.id ? 'others' : null;
    if (m.status === 'no_show') return s.b.includes(me.id) ? 'you' : s.a.includes(me.id) ? 'others' : null;
    const x = disputeOf(d, m.id);
    if (!x || ![...s.a, ...s.b].includes(me.id)) return null;
    const openerSide = s.a.includes(x.opened_by) ? s.a : s.b;
    return x.status === 'open' && !openerSide.includes(me.id) ? 'you' : 'others';
  };
  return {
    you: waiting.filter((m) => mine(m) === 'you').map(item),
    others: waiting.filter((m) => mine(m) === 'others').map(item),
    all: isAdminM(me) ? waiting.map(item) : null,
    rules: rulesFor(d, leagueId),
    on: confirmOn(d, leagueId),
  };
}

export async function pendingCount(user: User, leagueId: string) {
  const d = await db();
  if (!confirmOn(d, leagueId)) return 0;
  const l = await pendingLists(user, leagueId);
  return l.you.length;
}

// M3.1, M3.3, M3.5, M15.2: one read for the confirm screen. Marks the match as seen for the confirming side.
export async function confirmView(user: User, matchId: string) {
  const d = await db();
  const m0 = d.matches.find((x) => x.id === matchId);
  if (!m0) return null;
  let changed = settle(d, m0.league_id, afterCounted);
  const m = d.matches.find((x) => x.id === matchId);
  if (!m) { if (changed) await save(); return null; }
  const me = memberOf(d, m.league_id, user.id);
  if (me && markSeen(d, m.id, me)) changed = true;
  if (changed) await save();
  const s = sidesOf(d, m), x = disputeOf(d, m.id);
  const inA = me && s.a.includes(me.id), inB = me && s.b.includes(me.id);
  const opener = x && (s.a.includes(x.opened_by) ? s.a : s.b.includes(x.opened_by) ? s.b : [x.opened_by]);
  let role: Role = 'viewer';
  if (me && x && x.status !== 'resolved' && (m.status === 'disputed' || x.kind === 'correction' || m.status === 'no_show')) role = opener!.includes(me.id) ? 'opener' : inA || inB ? 'answer' : isAdminM(me) ? 'admin' : 'viewer';
  else if (me && m.status === 'pending') role = confirmers(d, m).includes(me.id) ? 'confirmer' : inA || inB || m.created_by === user.id ? 'logger' : isAdminM(me) ? 'admin' : 'viewer';
  else if (me && (inA || inB || m.created_by === user.id)) role = m.created_by === user.id ? 'logger' : 'confirmer';
  const confirmIds = confirmers(d, m);
  return {
    match: row(d, m), status: m.status, role, me, dispute: x,
    due: x && x.status !== 'resolved' ? x.deadline : dueAt(d, m), rules: rulesFor(d, m.league_id),
    logger: d.members.find((y) => y.id === loggerMember(d, m)) ?? null,
    confirmNames: confirmIds.map((id) => d.members.find((y) => y.id === id)?.display_name ?? 'Someone'),
    teammates: me ? confirmIds.filter((id) => id !== me.id).map((id) => d.members.find((y) => y.id === id)?.display_name ?? '') : [],
    seenAt: m.seen_at ?? null, confirmedAt: m.confirmed_at ?? null, confirmedBy: d.members.find((y) => y.id === m.confirmed_by)?.display_name ?? null,
    canNudge: !m.nudged_at || Date.now() - new Date(m.nudged_at).getTime() >= NUDGE_MIN * 60000,
    resolvedBy: d.members.find((y) => y.id === x?.resolved_by)?.display_name ?? null,
    isAdmin: isAdminM(me), inMatch: !!(inA || inB),
    ageDays: (Date.now() - new Date(m.played_at).getTime()) / 86400000,
  };
}
export type ConfirmView = NonNullable<Awaited<ReturnType<typeof confirmView>>>;

// M16.2 admin queue: disputes needing an admin, and the resolved ones.
export async function disputeQueue(user: User, leagueId: string) {
  const d = await settled(leagueId);
  const me = memberOf(d, leagueId, user.id);
  const list = (d.disputes ?? []).filter((x) => x.league_id === leagueId && d.matches.some((m) => m.id === x.match_id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const card = (x: Dispute) => {
    const m = d.matches.find((y) => y.id === x.match_id)!;
    const s = sidesOf(d, m);
    return { dispute: x, match: row(d, m), opener: d.members.find((y) => y.id === x.opened_by)?.display_name ?? 'Someone', logger: d.members.find((y) => y.id === loggerMember(d, m))?.display_name ?? 'Someone', involved: !!me && [...s.a, ...s.b].includes(me.id) };
  };
  return { escalated: list.filter((x) => x.status === 'escalated').map(card), open: list.filter((x) => x.status === 'open').map(card), resolved: list.filter((x) => x.status === 'resolved').slice(0, 30).map(card), admin: isAdminM(me) };
}
export type QueueCard = Awaited<ReturnType<typeof disputeQueue>>['open'][number];

export async function disputeView(user: User, id: string) {
  const d = await db();
  const x = (d.disputes ?? []).find((y) => y.id === id);
  const m = x && d.matches.find((y) => y.id === x.match_id);
  if (!x || !m) return null;
  const me = memberOf(d, m.league_id, user.id), s = sidesOf(d, m);
  return {
    dispute: x, match: row(d, m), me, involved: !!me && [...s.a, ...s.b].includes(me.id), admin: isAdminM(me),
    opener: d.members.find((y) => y.id === x.opened_by)?.display_name ?? 'Someone', logger: d.members.find((y) => y.id === loggerMember(d, m))?.display_name ?? 'Someone',
    audit: (d.matchAudit ?? []).filter((a) => a.match_id === m.id),
    resolvedBy: d.members.find((y) => y.id === x.resolved_by)?.display_name ?? null,
    name: (id2: string) => d.members.find((y) => y.id === id2)?.display_name ?? 'Former player',
  };
}

export async function matchLog(matchId: string) {
  const d = await db();
  return (d.matchAudit ?? []).filter((a) => a.match_id === matchId).sort((a, b) => a.at.localeCompare(b.at));
}

export async function openDisputeCount(leagueId: string) {
  const d = await db();
  return (d.disputes ?? []).filter((x) => x.league_id === leagueId && x.status === 'escalated').length;
}

/* ---------- writes ---------- */
export const confirm = (user: User, matchId: string) => run((d) => { const m = matchOf(d, matchId); if (m.status !== 'pending') throw new ApiError('already settled'); confirmMatch(d, m.id, meIn(d, m.league_id, user), afterCounted); });
export const confirmAll = (user: User, leagueId: string, ids: string[]) => run((d) => { const me = meIn(d, leagueId, user); ids.forEach((id) => { const m = d.matches.find((x) => x.id === id); if (m?.status === 'pending' && confirmers(d, m).includes(me.id)) confirmMatch(d, id, me, afterCounted); }); });
export const dispute = (user: User, matchId: string, p: { reason: Exclude<Reason, 'no_show'>; proposal: Proposal; message: string }) =>
  run((d) => { const m = matchOf(d, matchId); return openDispute(d, m.id, meIn(d, m.league_id, user), p).id; });
export const editProposal = (user: User, disputeId: string, leagueId: string, p: { reason: Exclude<Reason, 'no_show'>; proposal: Proposal; message: string }) => run((d) => updateProposal(d, disputeId, meIn(d, leagueId, user), p));
export const reply = (user: User, disputeId: string, leagueId: string, text: string) => run((d) => postMessage(d, disputeId, meIn(d, leagueId, user), text));
export const accept = (user: User, disputeId: string, leagueId: string) => run((d) => acceptProposal(d, disputeId, meIn(d, leagueId, user), afterCounted));
export const keepMine = (user: User, disputeId: string, leagueId: string) => run((d) => escalate(d, disputeId, meIn(d, leagueId, user)));
export const withdrawDispute = (user: User, disputeId: string, leagueId: string) => run((d) => withdraw(d, disputeId, meIn(d, leagueId, user), afterCounted));
export const removeByAgreement = (user: User, disputeId: string, leagueId: string) => run((d) => removeDisputed(d, disputeId, meIn(d, leagueId, user)));
export const restore = (user: User, matchId: string) => run((d) => restoreDuplicate(d, matchId, user.id));
export const resolve = (user: User, disputeId: string, leagueId: string, decision: Decision, note: string) => run((d) => resolveDispute(d, disputeId, meIn(d, leagueId, user), decision, note, afterCounted));
export const assignToMe = (user: User, disputeId: string, leagueId: string) => run((d) => { const x = (d.disputes ?? []).find((y) => y.id === disputeId); if (x) x.assigned_to = meIn(d, leagueId, user).id; });
export const sendNudge = (user: User, matchId: string) => run((d) => { const m = matchOf(d, matchId); nudge(d, m.id, meIn(d, m.league_id, user)); });
export const noShow = (user: User, leagueId: string, opponent: string) => run((d) => reportNoShow(d, leagueId, meIn(d, leagueId, user), opponent));
export const answerNoShowReport = (user: User, matchId: string, answer: 'there' | 'sorry' | 'moved') => run((d) => { const m = matchOf(d, matchId); answerNoShow(d, m.id, meIn(d, m.league_id, user), answer); });
export const saveRules = (user: User, leagueId: string, p: Partial<MatchRules>) => run((d) => setRules(d, leagueId, meIn(d, leagueId, user), p));

export type { Decision, Dispute, MatchRules, Member, Proposal, Reason };
