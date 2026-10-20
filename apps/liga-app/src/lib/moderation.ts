// Moderation (K11 queue, K11.1 report detail, K11.3 mute, K11.4 log, K12.3 internal Liga team queue, B4.8).
// Reports themselves are written by chat (K9, chat-store reports); this module adds mutes, the log and escalation.
// Chat, comments and live chat call assertCanPost() before writing; chat's remove, keep and settings write log rows.
import { db, save, wait, type User } from '@/lib/api';
import { removeMember } from '@/lib/admin';
import { hasPro } from '@/lib/billing';
import { store as chatStore, type Report, type ReportTarget } from '@/lib/chat-store';
import { ApiError, notify, uid, type DB } from '@/lib/engine';
import { clock } from '@/lib/time';
import type { Member } from '@/lib/types';

export type MuteScope = 'chat' | 'chat_photos';
export type Mute = {
  id: string; league_id: string; member_id: string; until: string | null; scope: MuteScope; by: string; reason: string; at: string;
  ended_at: string | null; ended_by: string | null; told?: boolean;
};
export type LogAction = 'remove' | 'keep' | 'mute' | 'unmute' | 'remove_member' | 'escalate' | 'settings' | 'platform';
export type LogRow = { id: string; league_id: string; actor: string | null; action: LogAction; target: string | null; text: string; reason: string; ref: string | null; at: string };
export type Escalation = { id: string; league_id: string; target_id: string; by: string; note: string; at: string; status: 'open' | 'done'; outcome: string | null; done_at: string | null };
export type ModStore = { mutes: Mute[]; log: LogRow[]; escalations: Escalation[] };

export const MUTE_FOR = [{ hours: 1, label: '1 hour' }, { hours: 24, label: '24 hours' }, { hours: 168, label: '7 days' }, { hours: null, label: 'Until I unmute' }] as const;
export const LOG_ACTIONS: { id: LogAction; label: string }[] = [
  { id: 'remove', label: 'Removed' }, { id: 'keep', label: 'Kept' }, { id: 'mute', label: 'Muted' }, { id: 'unmute', label: 'Unmuted' },
  { id: 'remove_member', label: 'Removed members' }, { id: 'escalate', label: 'Escalated' }, { id: 'settings', label: 'Settings' },
];
export const SLA_H = 24;
const H = 3600000;

export function modStore(d: DB): ModStore {
  const s = (d.moderation as ModStore | undefined) ?? { mutes: [], log: [], escalations: [] };
  d.moderation = s;
  return s;
}
const isAdmin = (m?: Member | null) => m?.role === 'owner' || m?.role === 'admin';
const member = (d: DB, id: string | null) => (id ? d.members.find((m) => m.id === id) : undefined);
const nameOf = (d: DB, id: string | null) => member(d, id)?.display_name ?? 'Someone';
const leagueName = (d: DB, id: string) => d.leagues.find((l) => l.id === id)?.name ?? 'your league';
const ms = (iso: string | null) => (iso ? new Date(iso).getTime() : 0);
const meOf = (d: DB, userId: string, leagueId: string) => d.members.find((m) => m.league_id === leagueId && m.user_id === userId && !m.status);
function adminIn(d: DB, user: User, leagueId: string) {
  const me = meOf(d, user.id, leagueId);
  if (!me || !isAdmin(me)) throw new ApiError('Only owners and admins can moderate.');
  return me;
}

// "until 15:20" today, "until Fri 15:20" later on.
export function untilLabel(iso: string | null) {
  if (!iso) return 'until an admin unmutes';
  const at = new Date(iso);
  const same = at.toDateString() === new Date().toDateString();
  return `until ${same ? '' : at.toLocaleDateString('en-GB', { weekday: 'short' }) + ' '}${clock(iso)}`;
}

/* ---------- pure, used by chat and live ---------- */

export function logAction(d: DB, row: Omit<LogRow, 'id' | 'at'>) {
  modStore(d).log.push({ ...row, id: uid(), at: new Date().toISOString() });
}

// Ends expired mutes and tells the member once. Returns true when something changed.
export function stepMutes(d: DB, now = Date.now()) {
  let changed = false;
  for (const m of modStore(d).mutes) {
    if (m.ended_at || !m.until || ms(m.until) > now) continue;
    m.ended_at = m.until; changed = true;
    if (!m.told && member(d, m.member_id)?.user_id) {
      m.told = true;
      notify(d, { league_id: m.league_id, member_id: m.member_id, kind: 'mod.unmuted', title: `You can post again in ${leagueName(d, m.league_id)}`, body: 'Thanks for keeping it friendly.', href: '/chat' });
    }
  }
  return changed;
}

export function activeMute(d: DB, leagueId: string, memberId: string, now = Date.now()) {
  return modStore(d).mutes.find((m) => m.league_id === leagueId && m.member_id === memberId && !m.ended_at && (!m.until || ms(m.until) > now)) ?? null;
}

// Chat, comments and live chat: a muted member can still play, log matches and react.
export function assertCanPost(d: DB, leagueId: string, memberId: string) {
  const m = activeMute(d, leagueId, memberId);
  if (m) throw new ApiError(`You're muted ${untilLabel(m.until)}. You can still play, log matches and react.`);
}

// Chat's keep and remove call this: log row, handled mark and a thank you to the reporters (P49).
export function reportResolved(d: DB, userId: string, leagueId: string, targetId: string, outcome: 'keep' | 'remove', reason = '') {
  const me = meOf(d, userId, leagueId);
  const reps = chatStore(d).reports.filter((r) => r.league_id === leagueId && r.target_id === targetId);
  const it = chatStore(d).msgs.find((x) => x.id === targetId) ?? chatStore(d).comments.find((x) => x.id === targetId);
  const author = it?.author ?? reps[0]?.author ?? null;
  const what = !it ? `a reported ${reps[0]?.target ?? 'item'}` : 'kind' in it ? 'a message' : 'a comment';
  if (outcome === 'remove' || reps.length) {
    logAction(d, { league_id: leagueId, actor: me?.id ?? null, action: outcome, target: author, reason, ref: targetId,
      text: outcome === 'remove' ? `removed ${what} by ${nameOf(d, author)}` : `kept ${what} by ${nameOf(d, author)}` });
  }
  const told = new Set<string>();
  for (const r of reps) {
    const rec = d.members.find((m) => m.league_id === leagueId && m.user_id === r.reporter && !m.status);
    if (!rec || told.has(rec.id) || rec.id === me?.id) continue;
    told.add(rec.id);
    notify(d, { league_id: leagueId, member_id: rec.id, kind: 'mod.reviewed', title: 'Thanks, an admin reviewed your report', body: outcome === 'remove' ? 'It was removed.' : 'They decided to keep it.', href: '/inbox' });
  }
}

/* ---------- K11 queue ---------- */

export type Segment = 'open' | 'hidden' | 'resolved';
export type ReportGroup = {
  target_id: string; target: ReportTarget; author: string | null; snapshot: string; reasons: string[]; count: number; at: string;
  segment: Segment; outcome: Report['status']; escalated: boolean; hidden: boolean;
};

function groups(d: DB, leagueId: string): ReportGroup[] {
  const s = chatStore(d), esc = modStore(d).escalations;
  const out = new Map<string, ReportGroup>();
  for (const r of s.reports.filter((x) => x.league_id === leagueId)) {
    const it = s.msgs.find((x) => x.id === r.target_id) ?? s.comments.find((x) => x.id === r.target_id);
    const g = out.get(r.target_id) ?? {
      target_id: r.target_id, target: r.target, author: r.author, snapshot: r.snapshot, reasons: [], count: 0, at: r.created_at,
      segment: 'resolved' as Segment, outcome: r.status, escalated: esc.some((e) => e.target_id === r.target_id && e.status === 'open'), hidden: !!it?.hidden,
    };
    g.count++;
    if (!g.reasons.includes(r.reason)) g.reasons.push(r.reason);
    if (r.created_at > g.at) g.at = r.created_at;
    if (r.status === 'open') { g.outcome = 'open'; g.segment = g.hidden ? 'hidden' : 'open'; } else if (g.outcome !== 'open') g.outcome = r.status;
    out.set(r.target_id, g);
  }
  return [...out.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export async function moderationHome(user: User, leagueId: string) {
  await wait(80);
  const d = await db();
  if (stepMutes(d)) await save();
  const me = meOf(d, user.id, leagueId);
  if (!isAdmin(me)) return null;
  const all = groups(d, leagueId);
  const count = (s: Segment) => all.filter((g) => g.segment === s).length;
  return {
    groups: all, counts: { open: count('open'), hidden: count('hidden'), resolved: count('resolved') },
    muted: modStore(d).mutes.filter((m) => m.league_id === leagueId && !m.ended_at).length,
    logCount: modStore(d).log.filter((x) => x.league_id === leagueId).length,
  };
}

/* ---------- K11.1 report detail ---------- */

export async function reportDetail(user: User, leagueId: string, targetId: string) {
  await wait(80);
  const d = await db();
  const me = adminIn(d, user, leagueId);
  const s = chatStore(d);
  const g = groups(d, leagueId).find((x) => x.target_id === targetId);
  if (!g) return null;
  const reps = s.reports.filter((r) => r.league_id === leagueId && r.target_id === targetId);
  const msg = s.msgs.find((x) => x.id === targetId);
  const com = s.comments.find((x) => x.id === targetId);
  const it = msg ?? com;
  // Three lines before and after, from the same chat or the same match thread.
  let context: { id: string; author: string | null; body: string; at: string; self: boolean }[] = [];
  if (msg) {
    const list = s.msgs.filter((x) => x.league_id === leagueId && x.kind === 'text').sort((a, b) => a.created_at.localeCompare(b.created_at));
    const i = list.findIndex((x) => x.id === targetId);
    context = list.slice(Math.max(0, i - 3), i + 4).map((x) => ({ id: x.id, author: x.author, body: x.body || (x.removed_by ? 'Removed by an admin' : 'Deleted'), at: x.created_at, self: x.id === targetId }));
  } else if (com) {
    const list = s.comments.filter((x) => x.match_id === com.match_id).sort((a, b) => a.created_at.localeCompare(b.created_at));
    const i = list.findIndex((x) => x.id === targetId);
    context = list.slice(Math.max(0, i - 3), i + 4).map((x) => ({ id: x.id, author: x.author, body: x.body || (x.removed_by ? 'Removed by an admin' : 'Deleted'), at: x.created_at, self: x.id === targetId }));
  }
  const author = member(d, g.author);
  const since = Date.now() - 30 * 24 * H;
  const authorReports = new Set(s.reports.filter((r) => r.league_id === leagueId && r.author === g.author && ms(r.created_at) >= since).map((r) => r.target_id)).size;
  const mutes = modStore(d).mutes.filter((m) => m.league_id === leagueId && m.member_id === g.author);
  const tally = new Map<string, number>();
  reps.forEach((r) => tally.set(r.reason, (tally.get(r.reason) ?? 0) + 1));
  const handled = [...modStore(d).log].reverse().find((x) => x.ref === targetId && (x.action === 'remove' || x.action === 'keep'));
  const esc = modStore(d).escalations.find((e) => e.target_id === targetId);
  // Conflict of interest: an admin author is decided by the owner or the Liga team.
  const canDecide = !!author && (me.role === 'owner' || (author.role === 'member' && author.id !== me.id));
  return {
    group: g, me, author: author ?? null, context,
    authorDeleted: !!it?.deleted_at && !it.removed_by, removed: !!it?.removed_by,
    kind: msg ? 'message' as const : com ? 'comment' as const : null,
    authorReports, mutedBefore: mutes.length, mutedNow: activeMute(d, leagueId, g.author ?? ''),
    reasons: [...tally].map(([reason, n]) => ({ reason, n })).sort((a, b) => b.n - a.n),
    notes: reps.map((r) => r.note).filter(Boolean),
    handled: handled && g.outcome !== 'open' ? { by: handled.actor ? nameOf(d, handled.actor) : 'the Liga team', at: handled.at, action: handled.action } : null,
    escalation: esc ?? null, canDecide,
  };
}

export async function escalate(user: User, leagueId: string, targetId: string, note: string) {
  await wait(150);
  const d = await db();
  const me = meOf(d, user.id, leagueId);
  if (!me || !isAdmin(me)) throw new ApiError('not allowed');
  const s = modStore(d);
  if (s.escalations.some((e) => e.target_id === targetId && e.status === 'open')) return;
  const author = chatStore(d).reports.find((r) => r.target_id === targetId)?.author ?? null;
  s.escalations.push({ id: uid(), league_id: leagueId, target_id: targetId, by: me.id, note: note.trim().slice(0, 500), at: new Date().toISOString(), status: 'open', outcome: null, done_at: null });
  logAction(d, { league_id: leagueId, actor: me.id, action: 'escalate', target: author, reason: note.trim(), ref: targetId, text: `sent a report about ${nameOf(d, author)} to the Liga team` });
  await save();
}

// Remove from league (K11.1), through the normal member flow, plus a log row.
export async function removeFromLeague(user: User, leagueId: string, memberId: string, ref: string | null) {
  await removeMember(user, memberId);
  const d = await db();
  const me = meOf(d, user.id, leagueId);
  logAction(d, { league_id: leagueId, actor: me?.id ?? null, action: 'remove_member', target: memberId, reason: '', ref, text: `removed ${nameOf(d, memberId)} from the league` });
  await save();
}

/* ---------- K11.3 mute ---------- */

export function canMute(me: Member | null | undefined, target: Member | null | undefined) {
  if (!me || !target || !isAdmin(me) || me.id === target.id || target.status) return false;
  if (target.role === 'owner') return false;
  return target.role === 'member' || me.role === 'owner';
}

export async function muteMember(user: User, leagueId: string, memberId: string, p: { hours: number | null; scope: MuteScope; reason: string }) {
  await wait(150);
  const d = await db();
  const me = adminIn(d, user, leagueId);
  const target = member(d, memberId);
  if (!canMute(me, target)) throw new ApiError(target?.role === 'owner' ? "The owner can't be muted." : 'Only the owner can mute an admin.');
  const now = Date.now();
  const s = modStore(d);
  s.mutes.filter((m) => m.league_id === leagueId && m.member_id === memberId && !m.ended_at).forEach((m) => { m.ended_at = new Date(now).toISOString(); m.ended_by = me.id; m.told = true; });
  const until = p.hours ? new Date(now + p.hours * H).toISOString() : null;
  s.mutes.push({ id: uid(), league_id: leagueId, member_id: memberId, until, scope: p.scope, by: me.id, reason: p.reason.trim().slice(0, 300), at: new Date(now).toISOString(), ended_at: null, ended_by: null });
  const span = MUTE_FOR.find((x) => x.hours === p.hours)?.label ?? `${p.hours} hours`;
  logAction(d, { league_id: leagueId, actor: me.id, action: 'mute', target: memberId, reason: p.reason.trim(), ref: null, text: `muted ${nameOf(d, memberId)} ${p.hours ? `for ${span}` : 'until unmuted'}` });
  if (target!.user_id) {
    notify(d, { league_id: leagueId, member_id: memberId, kind: 'mod.muted', title: `You're muted in ${leagueName(d, leagueId)}`,
      body: `You can't post in chat or comment ${untilLabel(until)}. You can still play, log matches and react.`, href: '/inbox' });
  }
  await save();
}

export async function unmute(user: User, muteId: string) {
  await wait(120);
  const d = await db();
  const m = modStore(d).mutes.find((x) => x.id === muteId);
  if (!m) throw new ApiError('not found');
  const me = adminIn(d, user, m.league_id);
  if (m.ended_at) return;
  m.ended_at = new Date().toISOString(); m.ended_by = me.id; m.told = true;
  logAction(d, { league_id: m.league_id, actor: me.id, action: 'unmute', target: m.member_id, reason: '', ref: null, text: `unmuted ${nameOf(d, m.member_id)}` });
  if (member(d, m.member_id)?.user_id) {
    notify(d, { league_id: m.league_id, member_id: m.member_id, kind: 'mod.unmuted', title: `You can post again in ${leagueName(d, m.league_id)}`, body: 'Thanks for keeping it friendly.', href: '/chat' });
  }
  await save();
}

export async function mutedMembers(user: User, leagueId: string) {
  const d = await db();
  if (stepMutes(d)) await save();
  const me = adminIn(d, user, leagueId);
  return modStore(d).mutes.filter((m) => m.league_id === leagueId && !m.ended_at).sort((a, b) => b.at.localeCompare(a.at))
    .map((m) => ({ ...m, member: member(d, m.member_id) ?? null, byName: nameOf(d, m.by), canUnmute: canMute(me, member(d, m.member_id)) || me.role === 'owner' }));
}

/* ---------- K11.4 log ---------- */

export const FREE_LOG_ROWS = 3;
export async function moderationLog(user: User, leagueId: string, f: { actor?: string | null; action?: LogAction | null } = {}) {
  await wait(80);
  const d = await db();
  adminIn(d, user, leagueId);
  const l = d.leagues.find((x) => x.id === leagueId);
  const all = modStore(d).log.filter((x) => x.league_id === leagueId).sort((a, b) => b.at.localeCompare(a.at));
  const rows = all.filter((x) => (!f.actor || x.actor === f.actor) && (!f.action || x.action === f.action));
  const pro = hasPro(l as Parameters<typeof hasPro>[0]);
  const actors = [...new Set(all.map((x) => x.actor).filter((x): x is string => !!x))].map((id) => ({ id, name: nameOf(d, id) }));
  return {
    pro, total: rows.length, actors,
    rows: (pro ? rows.slice(0, 200) : rows.slice(0, FREE_LOG_ROWS)).map((x) => ({ ...x, actorName: x.actor ? nameOf(d, x.actor) : 'Liga team' })),
  };
}

/* ---------- K12.3 internal queue (Liga team only; a stub until the web admin exists) ---------- */

export async function platformQueue() {
  await wait(80);
  const d = await db();
  const s = chatStore(d), now = Date.now();
  const late = groupsAll(d).filter((g) => g.segment !== 'resolved' && now - ms(g.first) > SLA_H * H && !modStore(d).escalations.some((e) => e.target_id === g.target_id));
  const esc = modStore(d).escalations.slice().sort((a, b) => (a.status === b.status ? a.at.localeCompare(b.at) : a.status === 'open' ? -1 : 1)).map((e) => {
    const rep = s.reports.find((r) => r.target_id === e.target_id);
    return { ...e, league: leagueName(d, e.league_id), snapshot: rep?.snapshot ?? '', author: nameOf(d, rep?.author ?? null), reason: rep?.reason ?? '', dueIn: ms(e.at) + SLA_H * H - now };
  });
  return { escalations: esc, late: late.map((g) => ({ ...g, league: leagueName(d, g.league_id), dueIn: ms(g.first) + SLA_H * H - now })) };
}
function groupsAll(d: DB) {
  return [...new Set(chatStore(d).reports.map((r) => r.league_id))].flatMap((id) => groups(d, id).map((g) => ({
    ...g, league_id: id, first: chatStore(d).reports.filter((r) => r.target_id === g.target_id).reduce((a, r) => (r.created_at < a ? r.created_at : a), g.at),
  })));
}

// Liga team actions: remove the content, suspend (recorded only for now) or dismiss. Reporters hear back either way.
export async function platformAct(escalationId: string, outcome: 'removed' | 'suspended' | 'dismissed') {
  await wait(150);
  const d = await db();
  const e = modStore(d).escalations.find((x) => x.id === escalationId);
  if (!e || e.status === 'done') return;
  const s = chatStore(d);
  if (outcome === 'removed') {
    const it = s.msgs.find((x) => x.id === e.target_id) ?? s.comments.find((x) => x.id === e.target_id);
    if (it) { it.removed_by = 'liga'; it.removed_reason = 'Community guidelines'; it.body = ''; }
    s.reports.filter((r) => r.target_id === e.target_id && r.status === 'open').forEach((r) => { r.status = 'removed'; });
  } else if (outcome === 'dismissed') {
    s.reports.filter((r) => r.target_id === e.target_id && r.status === 'open').forEach((r) => { r.status = 'kept'; });
  }
  e.status = 'done'; e.outcome = outcome; e.done_at = new Date().toISOString();
  const author = s.reports.find((r) => r.target_id === e.target_id)?.author ?? null;
  logAction(d, { league_id: e.league_id, actor: null, action: 'platform', target: author, reason: '', ref: e.target_id,
    text: outcome === 'removed' ? `removed content by ${nameOf(d, author)}` : outcome === 'suspended' ? `suspended ${nameOf(d, author)}'s account` : `reviewed a report about ${nameOf(d, author)} and kept it` });
  const told = new Set<string>();
  for (const r of s.reports.filter((x) => x.target_id === e.target_id)) {
    const rec = d.members.find((m) => m.league_id === e.league_id && m.user_id === r.reporter && !m.status);
    if (!rec || told.has(rec.id)) continue;
    told.add(rec.id);
    notify(d, { league_id: e.league_id, member_id: rec.id, kind: 'mod.reviewed', title: 'The Liga team reviewed your report', body: outcome === 'dismissed' ? 'It stays up. Thanks for looking out.' : 'We took action. Thanks for looking out.', href: '/inbox' });
  }
  await save();
}
