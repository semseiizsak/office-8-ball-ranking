// Match confirmation module (M3, M4.4, M15, M16): pure, synchronous rules on the store. No storage here,
// src/lib/confirm.ts wraps these for screens and api.ts calls settle() lazily on read.
import { avg, eloPreview } from '@/lib/elo';
import { counts, notify, replayLeague, sidesOf, uid, type DB, type StoredMatch } from '@/lib/engine';
import { isOn } from '@/lib/modules';
import type { MatchRow, Member } from '@/lib/types';

export type MatchRules = { mode: 'auto' | 'required'; autoHours: number; disputeHours: number };
export const DEFAULT_RULES: MatchRules = { mode: 'auto', autoHours: 24, disputeHours: 48 };
export const REQUIRED_HOURS = 72, NO_SHOW_HOURS = 2, ADMIN_DAYS = 7, CORRECTION_DAYS = 7, NUDGE_MIN = 60, TWIN_MIN = 30, MAX_MESSAGES = 10;

export type Reason = 'winner' | 'score' | 'players' | 'not_played' | 'twice' | 'no_show';
export const REASONS: { id: Exclude<Reason, 'no_show'>; label: string }[] = [
  { id: 'winner', label: 'Wrong winner' }, { id: 'score', label: 'Wrong score' }, { id: 'players', label: 'Wrong players' },
  { id: 'not_played', label: "We didn't play" }, { id: 'twice', label: 'Logged twice' },
];
export type Proposal = { winner: 'a' | 'b'; score_a: number | null; score_b: number | null } | null;
export type Resolution = 'original' | 'proposal' | 'custom' | 'void' | 'removed' | 'withdrawn' | 'duplicate' | 'walkover';
export type Dispute = {
  id: string; match_id: string; league_id: string; kind: 'dispute' | 'correction' | 'no_show';
  opened_by: string; reason: Reason; proposal: Proposal; message: string; messages: { member_id: string; text: string; at: string }[];
  created_at: string; deadline: string; status: 'open' | 'escalated' | 'resolved';
  resolution?: Resolution; resolved_by?: string | null; note?: string; resolved_at?: string; assigned_to?: string;
};
export type Audit = { id: string; match_id: string; league_id: string; at: string; by: string; text: string };
export type After = (d: DB, matchId: string) => void; // runs once when a match starts to count (notices, feature hooks)

const H = 3600000;
const iso = (t: number) => new Date(t).toISOString();
const hash = (s: string) => { let h = 7; for (const c of s) h = (h * 31 + c.charCodeAt(0)) >>> 0; return h; };
export const botDelayMs = (id: string) => (30 + (hash(id) % 91)) * 1000; // bots answer within 30 to 120 seconds
const botDisputes = (id: string) => hash(id + 'd') % 14 === 0; // rarely

export const rulesFor = (d: DB, leagueId: string): MatchRules => ({ ...DEFAULT_RULES, ...d.matchRules?.[leagueId] });
export const confirmOn = (d: DB, leagueId: string) => isOn(d.leagues.find((l) => l.id === leagueId), 'confirm');
export const memberOf = (d: DB, leagueId: string, userId: string) => d.members.find((m) => m.league_id === leagueId && m.user_id === userId && !m.status);
export const nameOf = (d: DB, id: string | null | undefined) => d.members.find((m) => m.id === id)?.display_name ?? 'Someone';
const names = (list: string[]) => (list.length < 3 ? list.join(' and ') : `${list.slice(0, -1).join(', ')} and ${list[list.length - 1]}`);
export const isAdminM = (m?: Member | null) => m?.role === 'owner' || m?.role === 'admin';
export const disputeOf = (d: DB, matchId: string) => (d.disputes ?? []).filter((x) => x.match_id === matchId).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
export const openDisputeOf = (d: DB, matchId: string) => (d.disputes ?? []).find((x) => x.match_id === matchId && x.status !== 'resolved');

export function audit(d: DB, m: StoredMatch, by: string, text: string, at = Date.now()) {
  d.matchAudit = d.matchAudit ?? [];
  d.matchAudit.push({ id: uid(), match_id: m.id, league_id: m.league_id, at: iso(at), by, text });
}

/* ---------- who is who ---------- */
export function loggerSide(d: DB, m: StoredMatch): 'a' | 'b' | null {
  const s = sidesOf(d, m), me = d.members.find((x) => x.league_id === m.league_id && x.user_id === m.created_by);
  return me ? (s.a.includes(me.id) ? 'a' : s.b.includes(me.id) ? 'b' : null) : null;
}
// The side across from whoever logged it confirms. A third party logged it: anyone in the match may confirm.
export function confirmers(d: DB, m: StoredMatch) {
  const s = sidesOf(d, m), ls = loggerSide(d, m);
  return ls === 'a' ? s.b : ls === 'b' ? s.a : [...s.a, ...s.b];
}
const real = (d: DB, ids: string[]) => ids.filter((id) => d.members.find((x) => x.id === id)?.user_id);
const bot = (d: DB, ids: string[]) => ids.find((id) => { const x = d.members.find((y) => y.id === id); return x && !x.user_id; });
const admins = (d: DB, leagueId: string, except: string[] = []) =>
  d.members.filter((x) => x.league_id === leagueId && !x.status && x.user_id && isAdminM(x) && !except.includes(x.id)).map((x) => x.id);
function tell(d: DB, m: StoredMatch, ids: string[], kind: string, title: string, body: string, href = `/confirm/${m.id}`) {
  for (const id of real(d, ids)) notify(d, { league_id: m.league_id, member_id: id, kind, title, body, href });
}

export function dueAt(d: DB, m: StoredMatch) {
  const r = rulesFor(d, m.league_id), t = new Date(m.played_at).getTime();
  if (m.status === 'no_show') return iso(t + NO_SHOW_HOURS * H);
  return iso(t + (r.mode === 'required' ? REQUIRED_HOURS : r.autoHours) * H);
}

// Rows for a match that does not count (yet): sides with the rating change it would make now.
export function previewRows(d: DB, m: StoredMatch): MatchRow['match_players'] {
  const s = sidesOf(d, m);
  const rating = (id: string) => d.members.find((x) => x.id === id)?.rating ?? 1000;
  const live = m.status === 'pending' || m.status === 'disputed';
  const p = eloPreview(avg(s.a.map(rating)), avg(s.b.map(rating)), m.k ?? 32);
  const da = live ? (m.winner === 'a' ? p.aWins : p.bWins) : 0;
  return (['a', 'b'] as const).flatMap((side) => s[side].map((id) => {
    const delta = side === 'a' ? da : -da;
    return { member_id: id, side, delta, rating_after: rating(id) + delta };
  }));
}

/* ---------- the lifecycle ---------- */
const scoreText = (m: { winner: 'a' | 'b'; score_a: number | null; score_b: number | null }) =>
  m.score_a == null || m.score_b == null ? '' : m.winner === 'a' ? ` ${m.score_a} : ${m.score_b}` : ` ${m.score_b} : ${m.score_a}`;

// Ends a match's wait: 'original' or a proposal makes it count, void and walkover never move ratings.
function finish(d: DB, m: StoredMatch, result: 'original' | 'void' | 'walkover' | Exclude<Proposal, null>, after: After, at = Date.now()) {
  const was = counts(m);
  if (was) m.sides = sidesOf(d, m);
  if (result === 'void' || result === 'walkover') m.status = result;
  else {
    if (result !== 'original') { m.winner = result.winner; m.score_a = result.score_a; m.score_b = result.score_b; }
    delete m.status; m.confirmed_at = iso(at);
  }
  replayLeague(d, m.league_id);
  if (!was && counts(m)) after(d, m.id);
}

function close(d: DB, x: Dispute, resolution: Resolution, by: string | null, note?: string, at = Date.now()) {
  Object.assign(x, { status: 'resolved', resolution, resolved_by: by, note, resolved_at: iso(at) });
}

export function confirmMatch(d: DB, matchId: string, me: Member | null, after: After, at = Date.now()) {
  const m = d.matches.find((x) => x.id === matchId);
  if (!m || m.status !== 'pending') return false;
  if (me && !confirmers(d, m).includes(me.id)) throw new Error('not yours to confirm');
  m.confirmed_by = me?.id ?? undefined;
  finish(d, m, 'original', after, at);
  audit(d, m, me?.display_name ?? 'Auto', me ? `Confirmed by ${me.display_name}` : 'Counted automatically', at);
  if (me) {
    const ls = loggerSide(d, m), logger = d.members.find((x) => x.league_id === m.league_id && x.user_id === m.created_by);
    if (logger) tell(d, m, [logger.id], 'match.confirmed', `${me.display_name} confirmed your ${ls === m.winner ? 'win' : 'match'}.`, 'Ratings are updated.', `/match/${m.id}`);
  }
  return true;
}

export function openDispute(d: DB, matchId: string, me: Member, p: { reason: Exclude<Reason, 'no_show'>; proposal: Proposal; message: string }, at = Date.now()) {
  const m = d.matches.find((x) => x.id === matchId);
  if (!m || openDisputeOf(d, matchId)) throw new Error('cannot dispute');
  const s = sidesOf(d, m), inMatch = [...s.a, ...s.b].includes(me.id);
  if (!inMatch && !isAdminM(me)) throw new Error('not in match');
  const correction = counts(m);
  if (!correction && m.status !== 'pending') throw new Error('cannot dispute');
  const r = rulesFor(d, m.league_id);
  const old = correction && at - new Date(m.played_at).getTime() > CORRECTION_DAYS * 24 * H;
  const x: Dispute = {
    id: uid(), match_id: m.id, league_id: m.league_id, kind: correction ? 'correction' : 'dispute', opened_by: me.id, reason: p.reason,
    proposal: p.proposal, message: p.message.slice(0, 200), messages: [], created_at: iso(at), deadline: iso(at + r.disputeHours * H),
    status: old || (!inMatch) ? 'escalated' : 'open',
  };
  d.disputes = d.disputes ?? [];
  d.disputes.push(x);
  const label = REASONS.find((y) => y.id === p.reason)?.label.toLowerCase() ?? 'a problem';
  const others = [...s.a, ...s.b].filter((id) => id !== me.id && !(s.a.includes(me.id) ? s.a : s.b).includes(id));
  if (p.reason === 'twice' && !correction) {
    finish(d, m, 'void', () => {}, at);
    close(d, x, 'duplicate', me.id, undefined, at);
    audit(d, m, me.display_name, `Hidden as a duplicate by ${me.display_name}`, at);
    const logger = d.members.find((y) => y.league_id === m.league_id && y.user_id === m.created_by);
    if (logger) tell(d, m, [logger.id], 'match.disputed', `${me.display_name} says this was logged twice`, 'We hid it. You can bring it back within 24 h.');
    return x;
  }
  if (!correction) m.status = 'disputed';
  audit(d, m, me.display_name, `${correction ? 'Correction asked' : 'Disputed'} by ${me.display_name}: ${label}`, at);
  tell(d, m, others, 'match.disputed', correction ? `${me.display_name} asked to fix a match` : `${me.display_name} disputed your match: ${label}`, 'See their version.');
  if (x.status === 'escalated') tell(d, m, admins(d, m.league_id, [...s.a, ...s.b]), 'match.dispute.admin', '1 dispute needs you', `${nameOf(d, s.a[0])} vs ${nameOf(d, s.b[0])}, ${label}.`, `/league/dispute/${x.id}`);
  return x;
}

const disputeAndMatch = (d: DB, id: string) => {
  const x = (d.disputes ?? []).find((y) => y.id === id), m = x && d.matches.find((y) => y.id === x.match_id);
  if (!x || !m || x.status === 'resolved') throw new Error('dispute closed');
  return { x, m, s: sidesOf(d, m) };
};
// The side that answers a dispute: everyone in the match except the opener's side.
const answerSide = (d: DB, x: Dispute, s: { a: string[]; b: string[] }) => (s.a.includes(x.opened_by) ? s.b : s.b.includes(x.opened_by) ? s.a : [...s.a, ...s.b]);
const openerSide = (x: Dispute, s: { a: string[]; b: string[] }) => (s.a.includes(x.opened_by) ? s.a : s.b.includes(x.opened_by) ? s.b : [x.opened_by]);

export function updateProposal(d: DB, id: string, me: Member, p: { reason: Exclude<Reason, 'no_show'>; proposal: Proposal; message: string }) {
  const { x, m, s } = disputeAndMatch(d, id);
  if (!openerSide(x, s).includes(me.id)) throw new Error('not yours');
  Object.assign(x, { reason: p.reason, proposal: p.proposal, message: p.message.slice(0, 200) });
  tell(d, m, answerSide(d, x, s), 'match.dispute', `${me.display_name} changed their version`, 'Take a look.');
}

export function postMessage(d: DB, id: string, me: Member, text: string, at = Date.now()) {
  const { x, m, s } = disputeAndMatch(d, id);
  if (![...s.a, ...s.b].includes(me.id) && !isAdminM(me)) throw new Error('not in match');
  if (x.messages.length >= MAX_MESSAGES || !text.trim()) return;
  x.messages.push({ member_id: me.id, text: text.trim().slice(0, 200), at: iso(at) });
  tell(d, m, [...s.a, ...s.b].filter((y) => y !== me.id), 'match.dispute', `${me.display_name} replied`, text.trim().slice(0, 80));
}

// The answering side accepts the other version: the match counts with it.
export function acceptProposal(d: DB, id: string, me: Member, after: After, at = Date.now()) {
  const { x, m, s } = disputeAndMatch(d, id);
  if (!answerSide(d, x, s).includes(me.id)) throw new Error('not yours');
  if (!x.proposal) return removeDisputed(d, id, me, at);
  finish(d, m, x.proposal, after, at);
  close(d, x, 'proposal', me.id, undefined, at);
  audit(d, m, me.display_name, `${me.display_name} accepted ${nameOf(d, x.opened_by)}'s version:${scoreText(x.proposal)} ${nameOf(d, s[x.proposal.winner][0])} won`, at);
  tell(d, m, openerSide(x, s), 'match.resolved', `${me.display_name} accepted your version`, 'Ratings are updated.', `/match/${m.id}`);
}

// Answering side sticks to theirs: admins decide now.
export function escalate(d: DB, id: string, me: Member | null, at = Date.now()) {
  const { x, m, s } = disputeAndMatch(d, id);
  if (me && ![...s.a, ...s.b].includes(me.id)) throw new Error('not in match');
  x.status = 'escalated';
  audit(d, m, me?.display_name ?? 'Auto', me ? `${me.display_name} kept their version, sent to admins` : 'Sent to admins after the deadline', at);
  tell(d, m, admins(d, m.league_id, [...s.a, ...s.b]), 'match.dispute.admin', '1 dispute needs you', `${nameOf(d, s.a[0])} vs ${nameOf(d, s.b[0])}.`, `/league/dispute/${x.id}`);
  if (me) tell(d, m, [...s.a, ...s.b].filter((y) => y !== me.id), 'match.dispute', `${me.display_name} kept their version`, 'An admin will decide.');
}

export function withdraw(d: DB, id: string, me: Member, after: After, at = Date.now()) {
  const { x, m, s } = disputeAndMatch(d, id);
  if (!openerSide(x, s).includes(me.id)) throw new Error('not yours');
  if (x.kind === 'dispute') finish(d, m, 'original', after, at);
  close(d, x, 'withdrawn', me.id, undefined, at);
  audit(d, m, me.display_name, `${me.display_name} withdrew the ${x.kind === 'correction' ? 'correction' : 'dispute'}`, at);
  tell(d, m, answerSide(d, x, s), 'match.resolved', `${me.display_name} withdrew the dispute`, x.kind === 'dispute' ? 'The match counts as logged.' : 'Nothing changes.', `/match/${m.id}`);
}

// Both sides agree it should go: the opener asked for it, the answering side removes it.
export function removeDisputed(d: DB, id: string, me: Member, at = Date.now()) {
  const { x, m, s } = disputeAndMatch(d, id);
  if (!answerSide(d, x, s).includes(me.id)) throw new Error('not yours');
  close(d, x, 'removed', me.id, undefined, at);
  removeMatch(d, m);
  tell(d, m, openerSide(x, s), 'match.resolved', `${me.display_name} removed the match`, 'Ratings are recalculated without it.', `/confirm/${m.id}`);
}

export function removeMatch(d: DB, m: StoredMatch) {
  d.matches = d.matches.filter((y) => y.id !== m.id);
  d.mps = d.mps.filter((p) => p.match_id !== m.id);
  d.reactions = (d.reactions ?? []).filter((r) => r.match_id !== m.id);
  d.disputes = (d.disputes ?? []).filter((y) => y.match_id !== m.id || y.status === 'resolved');
  replayLeague(d, m.league_id);
}

// The logger brings back a match hidden as a duplicate, within 24 hours.
export function restoreDuplicate(d: DB, matchId: string, userId: string, at = Date.now()) {
  const m = d.matches.find((y) => y.id === matchId), x = disputeOf(d, matchId);
  if (!m || m.status !== 'void' || x?.resolution !== 'duplicate' || m.created_by !== userId) throw new Error('cannot restore');
  if (at - new Date(x.resolved_at!).getTime() > 24 * H) throw new Error('too late');
  m.status = 'pending';
  x.resolution = 'withdrawn';
  audit(d, m, nameOf(d, memberOf(d, m.league_id, userId)?.id), 'Brought back by the logger', at);
  tell(d, m, [x.opened_by], 'match.confirm', 'A match is back', `${nameOf(d, memberOf(d, m.league_id, userId)?.id)} says it was not a duplicate. Please confirm.`);
}

export type Decision = { kind: 'original' | 'proposal' | 'void' | 'walkover' } | { kind: 'custom'; winner: 'a' | 'b'; score_a: number | null; score_b: number | null };
export function resolveDispute(d: DB, id: string, me: Member, decision: Decision, note: string, after: After, at = Date.now()) {
  const { x, m, s } = disputeAndMatch(d, id);
  if (!isAdminM(me) || [...s.a, ...s.b].includes(me.id)) throw new Error('not allowed');
  if (!note.trim()) throw new Error('reason needed');
  const k = decision.kind;
  if (k === 'proposal' && !x.proposal) throw new Error('no proposal');
  const result = k === 'custom' ? { winner: decision.winner, score_a: decision.score_a, score_b: decision.score_b } : k === 'proposal' ? x.proposal! : k;
  finish(d, m, result, after, at);
  close(d, x, k === 'proposal' ? 'proposal' : k, me.id, note.trim(), at);
  const label = k === 'original' ? `${nameOf(d, loggerMember(d, m))}'s version` : k === 'proposal' ? `${nameOf(d, x.opened_by)}'s version` : k === 'void' ? 'match voided' : k === 'walkover' ? 'walkover' : 'new result';
  audit(d, m, me.display_name, `Resolved by ${me.display_name}: ${label}. ${note.trim()}`, at);
  tell(d, m, [...s.a, ...s.b], 'match.resolved', `${me.display_name} decided: ${label}`, `“${note.trim().slice(0, 80)}”`, `/match/${m.id}`);
}
export const loggerMember = (d: DB, m: StoredMatch) => d.members.find((y) => y.league_id === m.league_id && y.user_id === m.created_by)?.id;

export function nudge(d: DB, matchId: string, me: Member, at = Date.now()) {
  const m = d.matches.find((y) => y.id === matchId);
  if (!m || m.status !== 'pending') throw new Error('not pending');
  if (m.nudged_at && at - new Date(m.nudged_at).getTime() < NUDGE_MIN * 60000) throw new Error('too soon');
  m.nudged_at = iso(at);
  tell(d, m, confirmers(d, m), 'match.confirm', `${me.display_name} is waiting for you`, `Confirm${scoreText(m)}, it takes one tap.`);
}

export function markSeen(d: DB, matchId: string, me: Member, at = Date.now()) {
  const m = d.matches.find((y) => y.id === matchId);
  if (m && m.status === 'pending' && confirmers(d, m).includes(me.id) && !m.seen_at) { m.seen_at = iso(at); return true; }
  return false;
}

/* ---------- M15 no show and walkover ---------- */
export function reportNoShow(d: DB, leagueId: string, me: Member, opponent: string, at = Date.now()) {
  if (opponent === me.id) throw new Error('bad opponent');
  const m: StoredMatch = { id: uid(), league_id: leagueId, format: '1v1', winner: 'a', score_a: null, score_b: null, created_by: me.user_id ?? '', played_at: iso(at), status: 'no_show', sides: { a: [me.id], b: [opponent] } };
  d.matches.push(m);
  d.disputes = d.disputes ?? [];
  d.disputes.push({ id: uid(), match_id: m.id, league_id: leagueId, kind: 'no_show', opened_by: me.id, reason: 'no_show', proposal: null, message: '', messages: [], created_at: iso(at), deadline: iso(at + NO_SHOW_HOURS * H), status: 'open' });
  audit(d, m, me.display_name, `No show reported by ${me.display_name}`, at);
  tell(d, m, [opponent], 'match.noshow', `${me.display_name} says you missed your match`, `Reply within ${NO_SHOW_HOURS} h.`);
  return m.id;
}

export function answerNoShow(d: DB, matchId: string, me: Member, answer: 'there' | 'sorry' | 'moved', at = Date.now()) {
  const m = d.matches.find((y) => y.id === matchId), x = m && openDisputeOf(d, matchId);
  if (!m || !x || m.status !== 'no_show' || !sidesOf(d, m).b.includes(me.id)) throw new Error('not yours');
  if (answer === 'sorry') { finish(d, m, 'walkover', () => {}, at); close(d, x, 'walkover', me.id, undefined, at); audit(d, m, me.display_name, `${me.display_name} accepted the walkover`, at); }
  else if (answer === 'moved') { close(d, x, 'removed', me.id, undefined, at); removeMatch(d, m); }
  else { x.status = 'escalated'; audit(d, m, me.display_name, `${me.display_name} says they were there, sent to admins`, at); tell(d, m, admins(d, m.league_id, [x.opened_by, me.id]), 'match.dispute.admin', '1 dispute needs you', 'A no show report is disputed.', `/league/dispute/${x.id}`); }
  const text = { sorry: 'accepted the walkover', moved: 'says you moved the match', there: 'says they were there. An admin decides.' }[answer];
  tell(d, m, [x.opened_by], 'match.noshow', `${me.display_name} ${text}`, answer === 'moved' ? 'Log it when you play.' : 'No rating change for a walkover.', answer === 'moved' ? '/pending' : `/confirm/${m.id}`);
}

/* ---------- settle: everything that should have happened by now ---------- */
export function settle(d: DB, leagueId: string, after: After, now = Date.now()) {
  const waiting = d.matches.filter((m) => m.league_id === leagueId && (m.status === 'pending' || m.status === 'no_show' || m.status === 'disputed'));
  const open = (d.disputes ?? []).filter((x) => x.league_id === leagueId && x.status !== 'resolved');
  if (!waiting.length && !open.length) return false;
  const on = confirmOn(d, leagueId), r = rulesFor(d, leagueId);
  let changed = false;
  for (const m of [...waiting].sort((a, b) => a.played_at.localeCompare(b.played_at))) {
    const t = new Date(m.played_at).getTime();
    if (m.status === 'pending') {
      const b = bot(d, confirmers(d, m));
      if (!on) { confirmMatch(d, m.id, null, after, now); changed = true; continue; }
      if (b && now >= t + botDelayMs(m.id)) {
        const me = d.members.find((x) => x.id === b)!;
        if (botDisputes(m.id)) {
          const loser = m.winner === 'a' ? 'b' : 'a', ws = m.winner === 'a' ? m.score_a : m.score_b, ls = m.winner === 'a' ? m.score_b : m.score_a;
          const scoreFix = ws != null && ls != null && ls + 1 < ws;
          const proposal: Proposal = scoreFix ? { winner: m.winner, score_a: m.winner === 'a' ? ws : ls! + 1, score_b: m.winner === 'a' ? ls! + 1 : ws } : { winner: loser, score_a: m.score_b, score_b: m.score_a };
          openDispute(d, m.id, me, { reason: scoreFix ? 'score' : 'winner', proposal, message: scoreFix ? `I think it was ${ws} : ${ls! + 1}.` : 'Pretty sure I won that one.' }, t + botDelayMs(m.id));
        } else confirmMatch(d, m.id, me, after, t + botDelayMs(m.id));
        changed = true; continue;
      }
      if (now >= new Date(dueAt(d, m)).getTime()) {
        if (r.mode === 'auto') confirmMatch(d, m.id, null, after, now);
        else { finish(d, m, 'void', after, now); audit(d, m, 'Auto', 'Not confirmed in time, not counted', now); }
        changed = true;
      }
    } else if (m.status === 'no_show') {
      const x = openDisputeOf(d, m.id);
      if (!x || x.status !== 'open') continue;
      const opp = sidesOf(d, m).b[0], oppBot = !d.members.find((y) => y.id === opp)?.user_id;
      if (now >= new Date(x.deadline).getTime() || (oppBot && now >= t + botDelayMs(m.id))) {
        if (oppBot) answerNoShow(d, m.id, d.members.find((y) => y.id === opp)!, 'sorry', Math.min(now, t + botDelayMs(m.id)));
        else { finish(d, m, 'walkover', () => {}, now); close(d, x, 'walkover', null, undefined, now); audit(d, m, 'Auto', 'No reply in time, walkover', now); }
        changed = true;
      }
    }
  }
  for (const x of (d.disputes ?? []).filter((y) => y.league_id === leagueId && y.status !== 'resolved' && y.kind !== 'no_show')) {
    if (x.status === 'open' && now >= new Date(x.deadline).getTime()) { escalate(d, x.id, null, now); changed = true; }
    else if (x.status === 'escalated' && now >= new Date(x.deadline).getTime() + ADMIN_DAYS * 24 * H) {
      const m = d.matches.find((y) => y.id === x.match_id);
      if (m && x.kind === 'dispute') { finish(d, m, 'void', after, now); audit(d, m, 'Auto', 'No admin decision in 7 days, not counted', now); }
      close(d, x, x.kind === 'dispute' ? 'void' : 'original', null, 'No decision in time', now);
      changed = true;
    }
  }
  return changed;
}

// Two people log the same match within 30 minutes with the same winner: the second log is the confirmation.
export function findTwin(d: DB, leagueId: string, a: string[], b: string[], winner: 'a' | 'b', me: Member | undefined, now = Date.now()) {
  if (!me) return undefined;
  const same = (x: string[], y: string[]) => x.length === y.length && x.every((id) => y.includes(id));
  return d.matches.find((m) => {
    if (m.league_id !== leagueId || m.status !== 'pending' || now - new Date(m.played_at).getTime() > TWIN_MIN * 60000) return false;
    if (!confirmers(d, m).includes(me.id)) return false;
    const s = sidesOf(d, m);
    return (same(s.a, a) && same(s.b, b) && m.winner === winner) || (same(s.a, b) && same(s.b, a) && m.winner !== winner);
  });
}

// Admin changes the rules. Notifies the league when the mode changes.
export function setRules(d: DB, leagueId: string, me: Member, p: Partial<MatchRules>) {
  if (!isAdminM(me)) throw new Error('not allowed');
  const prev = rulesFor(d, leagueId);
  d.matchRules = { ...d.matchRules, [leagueId]: { ...prev, ...p } };
  if (p.mode && p.mode !== prev.mode) {
    const body = p.mode === 'required' ? 'Results now need the opponent’s confirmation to count.' : `Results count when confirmed, or automatically after ${rulesFor(d, leagueId).autoHours} h.`;
    d.members.filter((x) => x.league_id === leagueId && !x.status && x.user_id && x.id !== me.id)
      .forEach((x) => notify(d, { league_id: leagueId, member_id: x.id, kind: 'league.rules', title: 'Match rules changed', body, href: '/league/match-rules' }));
  }
}

export { names as joinNames, scoreText };
