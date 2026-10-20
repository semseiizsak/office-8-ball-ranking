// League chat (K1), match comments (K2, M5.3), report (K9), block (K10), admin remove and chat settings (K11.2, K11.5),
// guidelines (K12.1). Storage, bots and the match hook live in chat-store.ts. Bots answer lazily whenever chat data is read.
import { db, save, type User } from '@/lib/api';
import {
  BOT, blockedSet, commentNotices, filterText, isBot, parseMentions, queueBot, runBots, seedChat, settingsOf, store,
  type ChatMessage, type ChatSettings, type Comment, type ReportTarget,
} from '@/lib/chat-store';
import { ApiError, notify, uid, type DB } from '@/lib/engine';
import { inboxChanged } from '@/lib/inbox';
import { isOn } from '@/lib/modules';
import { assertCanPost, logAction, reportResolved } from '@/lib/moderation';
import type { Member } from '@/lib/types';

export * from '@/lib/chat-store';

export const MAX_LEN = 1000;
export const EDIT_MIN = 15;
export const MAX_PINS = 3;
export const GUIDELINES_VERSION = 1;
export const REPORT_REASONS = ['Harassment or bullying', 'Hate speech or symbols', 'Sexual content', 'Violence or threats', 'Self-harm', 'Spam', "Someone's private information", 'Something else'];
export const REMOVE_REASONS = [...REPORT_REASONS.slice(0, 6), 'Off topic', 'Something else'];

const iso = (ms: number) => new Date(ms).toISOString();
const between = (a: number, b: number) => (a + Math.random() * (b - a)) * 1000;
const pick = <X,>(xs: readonly X[]) => xs[Math.floor(Math.random() * xs.length)];
const readKey = (userId: string, leagueId: string) => `${userId}:${leagueId}`;
const isAdmin = (m: Member | undefined | null) => m?.role === 'owner' || m?.role === 'admin';

function meIn(d: DB, userId: string, leagueId: string) {
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === userId && !m.status);
  if (!me) throw new ApiError('not a member');
  return me;
}
// Seeds and runs bots, saves only when something changed.
async function fresh(leagueId?: string) {
  const d = await db();
  const seeded = leagueId ? seedChat(d, leagueId) : false;
  const ran = runBots(d);
  if (seeded || ran) { await save(); if (ran) inboxChanged(); }
  return d;
}

/* ---------- reads ---------- */
export type MatchCard = {
  id: string; format: '1v1' | '2v2'; winners: string[]; losers: string[]; score: [number, number] | null; delta: number; at: string;
  reactions: { emoji: string; count: number; mine: boolean }[]; comments: number;
};
export type ChatView = {
  enabled: boolean; settings: ChatSettings; me: Member; admin: boolean;
  messages: ChatMessage[]; pins: { message: ChatMessage; by: string; at: string }[]; matches: Record<string, MatchCard | null>;
  blocked: Set<string>; lastRead: string | null; accepted: boolean; typing: string[]; slowLeft: number; reported: Set<string>;
};

function matchCard(d: DB, matchId: string, me: Member): MatchCard | null {
  const m = d.matches.find((x) => x.id === matchId);
  if (!m) return null;
  const ps = d.mps.filter((p) => p.match_id === m.id);
  const rs = (d.reactions ?? []).filter((r) => r.match_id === m.id);
  const emojis = [...new Set(rs.map((r) => r.emoji))];
  const winA = m.winner === 'a';
  return {
    id: m.id, format: m.format, at: m.played_at,
    winners: ps.filter((p) => p.side === m.winner).map((p) => p.member_id), losers: ps.filter((p) => p.side !== m.winner).map((p) => p.member_id),
    score: m.score_a == null || m.score_b == null ? null : winA ? [m.score_a, m.score_b] : [m.score_b, m.score_a],
    delta: Math.abs(ps[0]?.delta ?? 0),
    reactions: emojis.map((emoji) => ({ emoji, count: rs.filter((r) => r.emoji === emoji).length, mine: rs.some((r) => r.emoji === emoji && r.member_id === me.id) })),
    comments: store(d).comments.filter((c) => c.match_id === m.id && !c.deleted_at && !c.removed_by).length,
  };
}

export async function loadChat(user: User, leagueId: string, now = Date.now()): Promise<ChatView> {
  const d = await fresh(leagueId);
  const s = store(d);
  const me = meIn(d, user.id, leagueId);
  const league = d.leagues.find((l) => l.id === leagueId)!;
  const settings = settingsOf(d, leagueId);
  const hidden = new Set(s.hidden.filter((h) => h.user_id === user.id).map((h) => h.target_id));
  const messages = s.msgs.filter((m) => m.league_id === leagueId && !hidden.has(m.id)).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const matches: Record<string, MatchCard | null> = {};
  messages.forEach((m) => { if (m.match_id) matches[m.match_id] = matchCard(d, m.match_id, me); });
  const byId = new Map(s.msgs.map((m) => [m.id, m]));
  const pins = s.pins.filter((p) => p.league_id === leagueId && byId.get(p.message_id) && !byId.get(p.message_id)!.deleted_at)
    .map((p) => ({ message: byId.get(p.message_id)!, by: p.by, at: p.at }));
  const typing = s.bots.filter((b) => b.league_id === leagueId && b.kind === 'chat' && new Date(b.at).getTime() - now < 7000)
    .map((b) => d.members.find((m) => m.id === b.member)?.display_name ?? '').filter(Boolean);
  const mineLast = messages.filter((m) => m.author === me.id && m.kind === 'text').pop();
  const slowLeft = settings.slow && mineLast && !isAdmin(me) ? Math.max(0, Math.ceil((new Date(mineLast.created_at).getTime() + settings.slow * 1000 - now) / 1000)) : 0;
  return {
    enabled: isOn(league, 'chat'), settings, me, admin: isAdmin(me), messages, pins, matches,
    blocked: blockedSet(d, user.id), lastRead: s.read[readKey(user.id, leagueId)] ?? null,
    accepted: (s.guidelines[user.id] ?? 0) >= GUIDELINES_VERSION, typing: [...new Set(typing)], slowLeft,
    reported: new Set(s.reports.filter((r) => r.reporter === user.id).map((r) => r.target_id)),
  };
}

export async function markChatRead(user: User, leagueId: string) {
  const d = await db();
  store(d).read[readKey(user.id, leagueId)] = new Date().toISOString();
  await save();
}

// Ranks row: the latest message and how many arrived since the last visit.
export async function chatPreview(user: User, leagueId: string) {
  const d = await fresh(leagueId);
  const s = store(d);
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);
  const blocked = blockedSet(d, user.id);
  const since = s.read[readKey(user.id, leagueId)] ?? '';
  const list = s.msgs.filter((m) => m.league_id === leagueId && !m.deleted_at && !m.removed_by && !(m.author && blocked.has(m.author))).sort((a, b) => a.created_at.localeCompare(b.created_at));
  const last = list[list.length - 1];
  const unread = list.filter((m) => m.created_at > since && m.author !== me?.id && m.kind !== 'system').length;
  const name = (id: string | null) => (id === me?.id ? 'You' : d.members.find((m) => m.id === id)?.display_name ?? '');
  const text = !last ? null : last.kind === 'match' ? 'New match result' : last.kind === 'event' ? last.event?.title ?? '' : last.kind === 'system' ? last.body : `${name(last.author)}: ${last.body}`;
  return { text, unread };
}

/* ---------- writes: messages ---------- */
function clean(d: DB, leagueId: string, body: string) {
  const text = body.trim();
  if (!text) throw new ApiError('empty');
  if (text.length > MAX_LEN) throw new ApiError('too long');
  const out = filterText(text, settingsOf(d, leagueId).filter);
  if (out === null) throw new ApiError("This message can't be sent. It may break the community guidelines.");
  return out;
}

export async function acceptGuidelines(user: User) {
  const d = await db();
  store(d).guidelines[user.id] = GUIDELINES_VERSION;
  await save();
}

export async function sendMessage(user: User, leagueId: string, body: string, replyTo: string | null = null) {
  const d = await db();
  const s = store(d), me = meIn(d, user.id, leagueId);
  const league = d.leagues.find((l) => l.id === leagueId);
  if (!isOn(league, 'chat')) throw new ApiError('Chat is turned off in this league.');
  const cfg = settingsOf(d, leagueId);
  if (cfg.post === 'admins' && !isAdmin(me)) throw new ApiError('Only admins can post right now.');
  assertCanPost(d, leagueId, me.id); // K11.3
  const text = clean(d, leagueId, body);
  const members = d.members.filter((m) => m.league_id === leagueId && !m.status && m.id !== me.id);
  const { ids, everyone } = parseMentions(text, members);
  const msg: ChatMessage = { id: uid(), league_id: leagueId, author: me.id, kind: 'text', body: text, reply_to: replyTo, mentions: ids, everyone: everyone && isAdmin(me), reactions: [], created_at: new Date().toISOString() };
  s.msgs.push(msg);
  s.read[readKey(user.id, leagueId)] = msg.created_at;

  // Notices: mentions, @everyone (admins), and the author of the message you replied to.
  const parent = replyTo ? s.msgs.find((m) => m.id === replyTo) : null;
  const sent = new Set<string>();
  const tell = (rec: Member | undefined, kind: string, title: string) => {
    if (!rec?.user_id || rec.id === me.id || sent.has(rec.id) || blockedSet(d, rec.user_id).has(me.id)) return;
    sent.add(rec.id);
    notify(d, { league_id: leagueId, member_id: rec.id, kind, title, body: text, href: `/chat?msg=${msg.id}` });
  };
  ids.forEach((id) => tell(members.find((m) => m.id === id), 'chat.mention', `${me.display_name} mentioned you`));
  if (msg.everyone) members.forEach((m) => tell(m, 'chat.everyone', `${me.display_name} to everyone`));
  if (parent?.author) tell(d.members.find((m) => m.id === parent.author), 'chat.reply', `${me.display_name} replied to you`);

  // Bots: a mentioned or replied-to bot always answers, otherwise sometimes someone chimes in or reacts.
  const now = Date.now();
  const bots = members.filter(isBot);
  const asked = bots.filter((b) => ids.includes(b.id) || parent?.author === b.id);
  asked.slice(0, 2).forEach((b, i) => queueBot(d, { league_id: leagueId, at: iso(now + between(8 + i * 10, 20 + i * 10)), member: b.id, kind: 'chat', target: msg.id, body: pick(BOT.mention) }));
  if (!asked.length && bots.length && Math.random() < 0.4) queueBot(d, { league_id: leagueId, at: iso(now + between(15, 45)), member: pick(bots).id, kind: 'chat', target: msg.id, body: pick(BOT.reply) });
  if (bots.length && Math.random() < 0.6) queueBot(d, { league_id: leagueId, at: iso(now + between(4, 20)), member: pick(bots).id, kind: 'react', target: msg.id, emoji: pick(['🔥', '😂', '👏']) });
  await save(); inboxChanged();
  return msg;
}

function ownMessage(d: DB, userId: string, id: string) {
  const m = store(d).msgs.find((x) => x.id === id);
  if (!m || !m.author) throw new ApiError('unknown message');
  const me = meIn(d, userId, m.league_id);
  return { m, me };
}

export const canEditMessage = (m: ChatMessage, meId: string) => m.author === meId && m.kind === 'text' && !m.deleted_at && !m.removed_by && Date.now() - new Date(m.created_at).getTime() < EDIT_MIN * 60000;

export async function editMessage(user: User, id: string, body: string) {
  const d = await db();
  const { m, me } = ownMessage(d, user.id, id);
  if (!canEditMessage(m, me.id)) throw new ApiError('The 15 minute edit window has closed.');
  m.body = clean(d, m.league_id, body);
  m.edited_at = new Date().toISOString();
  await save();
}

export async function deleteMessage(user: User, id: string) {
  const d = await db();
  const { m, me } = ownMessage(d, user.id, id);
  if (m.author !== me.id) throw new ApiError('not allowed');
  m.deleted_at = new Date().toISOString();
  m.body = '';
  const s = store(d);
  s.pins = s.pins.filter((p) => p.message_id !== id);
  await save();
}

function toggle(list: { member_id: string; emoji: string }[], memberId: string, emoji: string) {
  const i = list.findIndex((r) => r.member_id === memberId && r.emoji === emoji);
  if (i >= 0) { list.splice(i, 1); return; }
  // At most 3 different reactions per person on one item (spam guard).
  if (list.filter((r) => r.member_id === memberId).length >= 3) throw new ApiError('You can add up to 3 reactions.');
  list.push({ member_id: memberId, emoji });
}

export async function toggleMessageReaction(user: User, id: string, emoji: string) {
  const d = await db();
  const m = store(d).msgs.find((x) => x.id === id);
  if (!m || m.kind === 'system') throw new ApiError('unknown message');
  toggle(m.reactions, meIn(d, user.id, m.league_id).id, emoji);
  await save();
}

export async function setPinned(user: User, id: string, on: boolean) {
  const d = await db();
  const s = store(d);
  const m = s.msgs.find((x) => x.id === id);
  if (!m) throw new ApiError('unknown message');
  const me = meIn(d, user.id, m.league_id);
  if (!isAdmin(me)) throw new ApiError('Only admins can pin.');
  s.pins = s.pins.filter((p) => p.message_id !== id);
  if (on) {
    if (s.pins.filter((p) => p.league_id === m.league_id).length >= MAX_PINS) throw new ApiError(`Up to ${MAX_PINS} pinned messages. Unpin one first.`);
    s.pins.push({ league_id: m.league_id, message_id: id, by: me.id, at: new Date().toISOString() });
  }
  await save();
}

const SETTING_NAME: Record<keyof ChatSettings, string> = { post: 'who can post', slow: 'slow mode', filter: 'the language filter', matches: 'match posts', crown: 'crown posts', autoHide: 'auto hide' };
export async function saveChatSettings(user: User, leagueId: string, patch: Partial<ChatSettings>) {
  const d = await db();
  const me = meIn(d, user.id, leagueId);
  if (!isAdmin(me)) throw new ApiError('Only admins can change chat settings.');
  const s = store(d), before = settingsOf(d, leagueId);
  s.settings[leagueId] = { ...before, ...patch };
  logAction(d, { league_id: leagueId, actor: me.id, action: 'settings', target: null, reason: '', ref: null, text: `changed ${Object.keys(patch).map((k) => SETTING_NAME[k as keyof ChatSettings] ?? k).join(', ')}` }); // K11.4
  if (patch.post && patch.post !== before.post) {
    s.msgs.push({ id: uid(), league_id: leagueId, author: null, kind: 'system', reply_to: null, mentions: [], reactions: [], created_at: new Date().toISOString(),
      body: patch.post === 'admins' ? `${me.display_name} locked the chat. Only admins can post.` : `${me.display_name} opened the chat to everyone.` });
  }
  await save();
}

/* ---------- match comments (K2, M5.3) ---------- */
export type CommentView = { comments: Comment[]; me: Member | null; admin: boolean; enabled: boolean; accepted: boolean; blocked: Set<string>; players: Set<string>; reported: Set<string> };

export async function loadComments(user: User, matchId: string): Promise<CommentView> {
  const d = await fresh();
  const s = store(d);
  const m = d.matches.find((x) => x.id === matchId);
  const me = m ? d.members.find((x) => x.league_id === m.league_id && x.user_id === user.id) ?? null : null;
  const blocked = blockedSet(d, user.id);
  const hidden = new Set(s.hidden.filter((h) => h.user_id === user.id).map((h) => h.target_id));
  return {
    comments: s.comments.filter((c) => c.match_id === matchId && !blocked.has(c.author) && !hidden.has(c.id)).sort((a, b) => a.created_at.localeCompare(b.created_at)),
    me, admin: isAdmin(me), enabled: isOn(d.leagues.find((l) => l.id === m?.league_id), 'chat'),
    accepted: (s.guidelines[user.id] ?? 0) >= GUIDELINES_VERSION, blocked,
    players: new Set(d.mps.filter((p) => p.match_id === matchId).map((p) => p.member_id)),
    reported: new Set(s.reports.filter((r) => r.reporter === user.id).map((r) => r.target_id)),
  };
}

export async function addComment(user: User, matchId: string, body: string, replyTo: string | null = null) {
  const d = await db();
  const m = d.matches.find((x) => x.id === matchId);
  if (!m) throw new ApiError('This match was deleted.');
  const me = meIn(d, user.id, m.league_id);
  assertCanPost(d, m.league_id, me.id); // K11.3
  const text = clean(d, m.league_id, body);
  const others = d.members.filter((x) => x.league_id === m.league_id && !x.status && x.id !== me.id);
  const { ids } = parseMentions(text, others);
  const c: Comment = { id: uid(), match_id: matchId, league_id: m.league_id, author: me.id, body: text, reply_to: replyTo, mentions: ids, reactions: [], created_at: new Date().toISOString() };
  store(d).comments.push(c);
  commentNotices(d, matchId, me.id, text, ids);
  // A bot who played (or was mentioned) sometimes answers.
  const players = new Set(d.mps.filter((p) => p.match_id === matchId).map((p) => p.member_id));
  const bots = others.filter((x) => isBot(x) && (players.has(x.id) || ids.includes(x.id)));
  if (bots.length && Math.random() < 0.6) queueBot(d, { league_id: m.league_id, at: iso(Date.now() + between(10, 35)), member: pick(bots).id, kind: 'comment', target: matchId, body: pick(BOT.commentReply) });
  else if (bots.length && Math.random() < 0.5) queueBot(d, { league_id: m.league_id, at: iso(Date.now() + between(5, 15)), member: pick(bots).id, kind: 'react', target: c.id, emoji: '😂' });
  await save(); inboxChanged();
  return c;
}

export async function deleteComment(user: User, id: string) {
  const d = await db();
  const c = store(d).comments.find((x) => x.id === id);
  if (!c || c.author !== meIn(d, user.id, c.league_id).id) throw new ApiError('not allowed');
  c.deleted_at = new Date().toISOString();
  c.body = '';
  await save();
}

export async function toggleCommentReaction(user: User, id: string, emoji: string) {
  const d = await db();
  const c = store(d).comments.find((x) => x.id === id);
  if (!c) throw new ApiError('unknown comment');
  toggle(c.reactions, meIn(d, user.id, c.league_id).id, emoji);
  await save();
}

/* ---------- admin remove (K11.2) ---------- */
export async function removeContent(user: User, kind: 'message' | 'comment', id: string, reason: string) {
  const d = await db();
  const s = store(d);
  const it = kind === 'message' ? s.msgs.find((x) => x.id === id) : s.comments.find((x) => x.id === id);
  if (!it) throw new ApiError('unknown item');
  const me = meIn(d, user.id, it.league_id);
  if (!isAdmin(me)) throw new ApiError('Only admins can remove content.');
  it.removed_by = me.id; it.removed_reason = reason; it.body = '';
  s.pins = s.pins.filter((p) => p.message_id !== id);
  reportResolved(d, user.id, it.league_id, id, 'remove', reason); // K11.4 log, P49
  s.reports.filter((r) => r.target_id === id && r.status === 'open').forEach((r) => { r.status = 'removed'; });
  const author = d.members.find((m) => m.id === it.author);
  if (author?.user_id && author.id !== me.id) {
    notify(d, { league_id: it.league_id, member_id: author.id, kind: 'content.removed', title: kind === 'message' ? 'An admin removed your message' : 'An admin removed your comment', body: `Reason: ${reason}. Please keep the community guidelines in mind.`, href: kind === 'message' ? '/chat' : `/match/${(it as Comment).match_id}` });
  }
  await save(); inboxChanged();
}

/* ---------- report (K9) ---------- */
export async function report(user: User, p: { leagueId: string; target: ReportTarget; targetId: string; author: string | null; reason: string; note?: string; snapshot: string; alsoBlock?: boolean }) {
  const d = await db();
  const s = store(d);
  const me = meIn(d, user.id, p.leagueId);
  const author = d.members.find((m) => m.id === p.author);
  if (!s.reports.some((r) => r.reporter === user.id && r.target_id === p.targetId)) {
    s.reports.push({ id: uid(), league_id: p.leagueId, reporter: user.id, target: p.target, target_id: p.targetId, author: p.author, reason: p.reason, note: (p.note ?? '').slice(0, 500), snapshot: p.snapshot.slice(0, 500), status: 'open', created_at: new Date().toISOString() });
    // Auto hide after enough people reported it (K11.5).
    const count = s.reports.filter((r) => r.target_id === p.targetId && r.status === 'open').length;
    const it = s.msgs.find((x) => x.id === p.targetId) ?? s.comments.find((x) => x.id === p.targetId);
    if (it && count >= settingsOf(d, p.leagueId).autoHide) it.hidden = true;
    // P47: every admin except the reporter and the reported person hears about it.
    d.members.filter((m) => m.league_id === p.leagueId && isAdmin(m) && m.user_id && m.id !== me.id && m.id !== p.author)
      .forEach((m) => notify(d, { league_id: p.leagueId, member_id: m.id, kind: 'report.new', title: 'New report in your league', body: p.reason, href: '/chat-info' }));
  }
  if (p.alsoBlock && author && author.id !== me.id) addBlock(d, user.id, author);
  const admins = d.members.filter((m) => m.league_id === p.leagueId && isAdmin(m) && !m.status);
  await save(); inboxChanged();
  return { onlyAdminIsAuthor: admins.length === 1 && admins[0].id === p.author };
}

export async function hideForMe(user: User, targetId: string) {
  const d = await db();
  const s = store(d);
  if (!s.hidden.some((h) => h.user_id === user.id && h.target_id === targetId)) s.hidden.push({ user_id: user.id, target_id: targetId });
  await save();
}

/* ---------- moderation queue (B4.8) ---------- */
export async function listReports(user: User, leagueId: string) {
  const d = await db();
  if (!isAdmin(meIn(d, user.id, leagueId))) return [];
  const open = store(d).reports.filter((r) => r.league_id === leagueId && r.status === 'open');
  const groups = new Map<string, { id: string; target: ReportTarget; target_id: string; author: string | null; snapshot: string; reasons: string[]; count: number; at: string }>();
  open.forEach((r) => {
    const g = groups.get(r.target_id) ?? { id: r.id, target: r.target, target_id: r.target_id, author: r.author, snapshot: r.snapshot, reasons: [], count: 0, at: r.created_at };
    g.count++; if (!g.reasons.includes(r.reason)) g.reasons.push(r.reason);
    if (r.created_at > g.at) g.at = r.created_at;
    groups.set(r.target_id, g);
  });
  return [...groups.values()].sort((a, b) => b.at.localeCompare(a.at));
}

export async function keepReported(user: User, leagueId: string, targetId: string) {
  const d = await db();
  if (!isAdmin(meIn(d, user.id, leagueId))) throw new ApiError('not allowed');
  const s = store(d);
  reportResolved(d, user.id, leagueId, targetId, 'keep'); // K11.4 log, P49
  s.reports.filter((r) => r.target_id === targetId && r.status === 'open').forEach((r) => { r.status = 'kept'; });
  const it = s.msgs.find((x) => x.id === targetId) ?? s.comments.find((x) => x.id === targetId);
  if (it) it.hidden = false;
  await save();
}

/* ---------- block (K10) ---------- */
function addBlock(d: DB, userId: string, m: Member) {
  const s = store(d);
  if (!s.blocks.some((b) => b.user_id === userId && b.member_id === m.id)) s.blocks.push({ user_id: userId, member_id: m.id, user: m.user_id, league_id: m.league_id, at: new Date().toISOString() });
}

export async function block(user: User, memberId: string) {
  const d = await db();
  const m = d.members.find((x) => x.id === memberId);
  if (!m || m.user_id === user.id) throw new ApiError('not allowed');
  addBlock(d, user.id, m);
  await save();
}

export async function unblock(user: User, memberId: string) {
  const d = await db();
  const s = store(d);
  s.blocks = s.blocks.filter((b) => !(b.user_id === user.id && b.member_id === memberId));
  await save();
}

export async function listBlocks(user: User) {
  const d = await db();
  return store(d).blocks.filter((b) => b.user_id === user.id).sort((a, b) => b.at.localeCompare(a.at)).map((b) => {
    const m = d.members.find((x) => x.id === b.member_id);
    return { member_id: b.member_id, name: m?.display_name ?? 'Former player', league: d.leagues.find((l) => l.id === b.league_id)?.name ?? '', at: b.at };
  });
}

