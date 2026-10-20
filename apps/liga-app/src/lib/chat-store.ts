// League chat storage, seeding, bots and the match hook (pure, no AsyncStorage). src/lib/chat.ts has the async calls.
// Kept apart from chat.ts so hooks.ts can import it without a require cycle through api.ts.
import { notify, uid, type DB } from '@/lib/engine';
import { isOn } from '@/lib/modules';
import type { Member } from '@/lib/types';

export const CHAT_REACTIONS = ['🔥', '😂', '👏', '😮', '😢', '🤡'] as const;

export type Reacts = { member_id: string; emoji: string }[];
export type ChatEvent = { icon: string; title: string; sub?: string; href?: string };
export type ChatMessage = {
  id: string; league_id: string; author: string | null; // member id, null for system lines and event cards
  kind: 'text' | 'match' | 'event' | 'system';
  body: string; reply_to: string | null; mentions: string[]; everyone?: boolean;
  match_id?: string; event?: ChatEvent; reactions: Reacts; created_at: string;
  edited_at?: string | null; deleted_at?: string | null; removed_by?: string | null; removed_reason?: string | null; hidden?: boolean;
};
export type Comment = {
  id: string; match_id: string; league_id: string; author: string; body: string; reply_to: string | null; mentions: string[];
  reactions: Reacts; created_at: string; deleted_at?: string | null; removed_by?: string | null; removed_reason?: string | null; hidden?: boolean;
};
export type ChatSettings = { post: 'everyone' | 'admins'; slow: number; filter: 'standard' | 'strict'; matches: boolean; crown: boolean; autoHide: number };
export type Pin = { league_id: string; message_id: string; by: string; at: string };
export type Block = { user_id: string; member_id: string; user: string | null; league_id: string; at: string }; // blocker user, blocked member
export type ReportTarget = 'message' | 'comment' | 'profile' | 'match' | 'result';
export type Report = {
  id: string; league_id: string; reporter: string; target: ReportTarget; target_id: string; author: string | null;
  reason: string; note: string; snapshot: string; status: 'open' | 'kept' | 'removed'; created_at: string;
};
type BotTask = { id: string; league_id: string; at: string; member: string; kind: 'chat' | 'comment' | 'react' | 'mreact'; target?: string; body?: string; emoji?: string };
export type ChatStore = {
  msgs: ChatMessage[]; comments: Comment[]; pins: Pin[]; settings: Record<string, ChatSettings>; blocks: Block[]; reports: Report[];
  hidden: { user_id: string; target_id: string }[]; guidelines: Record<string, number>; read: Record<string, string>; bots: BotTask[]; seeded: string[];
};

export const DEFAULT_SETTINGS: ChatSettings = { post: 'everyone', slow: 0, filter: 'standard', matches: true, crown: true, autoHide: 3 };

export function store(d: DB): ChatStore {
  d.chat = d.chat ?? { msgs: [], comments: [], pins: [], settings: {}, blocks: [], reports: [], hidden: [], guidelines: {}, read: {}, bots: [], seeded: [] };
  return d.chat;
}
export const settingsOf = (d: DB, leagueId: string): ChatSettings => ({ ...DEFAULT_SETTINGS, ...store(d).settings[leagueId] });
export const isBot = (m: Member | undefined) => !!m && m.user_id === null && !m.guest; // guests have no account, they never post
const pick = <X,>(xs: readonly X[]) => xs[Math.floor(Math.random() * xs.length)];
const iso = (ms: number) => new Date(ms).toISOString();
const between = (a: number, b: number) => (a + Math.random() * (b - a)) * 1000;

// Member ids this user does not want to see: blocked directly, or the same blocked person in another league.
export function blockedSet(d: DB, userId: string) {
  const out = new Set<string>();
  for (const b of store(d).blocks.filter((x) => x.user_id === userId)) {
    out.add(b.member_id);
    if (b.user) d.members.filter((m) => m.user_id === b.user).forEach((m) => out.add(m.id));
  }
  return out;
}

/* ---------- bot lines ---------- */
export const BOT = {
  chat: ['Table is free if anyone wants a game', 'Who is up for lunch break doubles?', 'Coffee first, then foosball ☕', 'Someone please fix the left goal', 'The ladder is getting spicy 🌶️'],
  reply: ['Haha fair', 'Bring it on 😤', 'You wish 😂', 'Deal. After lunch?', '👀', 'Not today, I need to recover', 'Agreed 👏'],
  mention: ['On my way 🏃', 'Name the time', 'You called? 😏', 'Sure, best of three?'],
  wonVsYou: ['GG, you made me work for it', 'Close one. Rematch tomorrow?', 'Thanks for the points 😇'],
  lostVsYou: ['Okay that was clean 👏', 'I want a rematch 😤', 'Lucky shots. All of them.', 'Well played, honestly'],
  watching: ['Saw that from my desk 🔥', 'That score is brutal 😂', 'Nice one!', 'Who is next?'],
  commentReply: ['😂 fair', 'Agreed', 'Rematch is booked'],
};

export function queueBot(d: DB, task: Omit<BotTask, 'id'>) { store(d).bots.push({ ...task, id: uid() }); }

// Turns every due bot task into a message, comment or reaction. Returns true when something changed.
export function runBots(d: DB, now = Date.now()) {
  const s = store(d);
  const due = s.bots.filter((b) => new Date(b.at).getTime() <= now).sort((a, b) => a.at.localeCompare(b.at));
  if (!due.length) return false;
  s.bots = s.bots.filter((b) => !due.includes(b));
  for (const b of due) {
    const bot = d.members.find((m) => m.id === b.member);
    if (!bot || bot.status) continue;
    if (b.kind === 'chat') {
      s.msgs.push({ id: uid(), league_id: b.league_id, author: b.member, kind: 'text', body: b.body ?? pick(BOT.chat), reply_to: b.target ?? null, mentions: [], reactions: [], created_at: b.at });
      const parent = b.target ? s.msgs.find((m) => m.id === b.target) : null;
      const to = parent?.author ? d.members.find((m) => m.id === parent.author) : null;
      if (to?.user_id && !blockedSet(d, to.user_id).has(bot.id)) notify(d, { league_id: b.league_id, member_id: to.id, kind: 'chat.reply', title: `${bot.display_name} replied to you`, body: b.body ?? '', href: `/chat?msg=${parent!.id}` });
    } else if (b.kind === 'comment' && b.target) {
      const m = d.matches.find((x) => x.id === b.target);
      if (!m) continue;
      s.comments.push({ id: uid(), match_id: m.id, league_id: m.league_id, author: b.member, body: b.body ?? pick(BOT.watching), reply_to: null, mentions: [], reactions: [], created_at: b.at });
      commentNotices(d, m.id, b.member, b.body ?? '');
    } else if (b.kind === 'react' && b.target) {
      const it = s.msgs.find((x) => x.id === b.target) ?? s.comments.find((x) => x.id === b.target);
      if (it && !it.reactions.some((r) => r.member_id === b.member && r.emoji === b.emoji)) it.reactions.push({ member_id: b.member, emoji: b.emoji ?? '🔥' });
    } else if (b.kind === 'mreact' && b.target && d.matches.some((x) => x.id === b.target)) {
      d.reactions = d.reactions ?? [];
      if (!d.reactions.some((r) => r.match_id === b.target && r.member_id === b.member)) d.reactions.push({ match_id: b.target, member_id: b.member, emoji: b.emoji ?? '👏' });
    }
  }
  return true;
}

// Who hears about a new comment: the players of the match (real people only), minus the author and anyone who blocked them.
export function commentNotices(d: DB, matchId: string, authorId: string, body: string, mentions: string[] = []) {
  const m = d.matches.find((x) => x.id === matchId);
  const author = d.members.find((x) => x.id === authorId);
  if (!m || !author) return;
  const sent = new Set<string>();
  const send = (rec: Member | undefined, kind: string, title: string) => {
    if (!rec?.user_id || rec.id === authorId || sent.has(rec.id) || blockedSet(d, rec.user_id).has(authorId)) return;
    sent.add(rec.id);
    notify(d, { league_id: m.league_id, member_id: rec.id, kind, title, body, href: `/match/${matchId}` });
  };
  mentions.forEach((id) => send(d.members.find((x) => x.id === id), 'comment.mention', `${author.display_name} mentioned you in a comment`));
  d.mps.filter((p) => p.match_id === matchId).forEach((p) => send(d.members.find((x) => x.id === p.member_id), 'match.comment', `${author.display_name} commented on your match`));
}

/* ---------- seeding ---------- */
// First open of a league chat: a creation line, and in leagues with bots a few recent cards and messages so the demo feels alive.
export function seedChat(d: DB, leagueId: string, now = Date.now()) {
  const s = store(d);
  if (s.seeded.includes(leagueId)) return false;
  s.seeded.push(leagueId);
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) return true;
  const ms = d.members.filter((m) => m.league_id === leagueId);
  const owner = ms.find((m) => m.role === 'owner');
  s.msgs.push({ id: uid(), league_id: leagueId, author: null, kind: 'system', body: `${owner?.display_name ?? 'Someone'} created the league`, reply_to: null, mentions: [], reactions: [], created_at: l.created_at });
  const bots = ms.filter((m) => isBot(m) && !m.status);
  if (bots.length < 2) return true;
  const recent = d.matches.filter((m) => m.league_id === leagueId).sort((a, b) => b.played_at.localeCompare(a.played_at)).slice(0, 4).reverse();
  recent.forEach((m, i) => {
    if (!s.msgs.some((x) => x.match_id === m.id)) s.msgs.push({ id: uid(), league_id: leagueId, author: null, kind: 'match', body: '', match_id: m.id, reply_to: null, mentions: [], reactions: [], created_at: m.played_at });
    const at = new Date(m.played_at).getTime() + 90000;
    const who = bots[(i * 2 + 1) % bots.length];
    s.msgs.push({ id: uid(), league_id: leagueId, author: who.id, kind: 'text', body: BOT.watching[i % BOT.watching.length], reply_to: null, mentions: [], reactions: [{ member_id: bots[(i + 2) % bots.length].id, emoji: '😂' }], created_at: iso(Math.min(at, now - 60000)) });
  });
  const rules: ChatMessage = { id: uid(), league_id: leagueId, author: owner?.id ?? bots[0].id, kind: 'text', body: 'House rules: first to 10, swap sides at 5, no spinning. Loser wipes the table 🧽', reply_to: null, mentions: [], reactions: [{ member_id: bots[1].id, emoji: '👏' }, { member_id: bots[2 % bots.length].id, emoji: '👏' }], created_at: iso(new Date(l.created_at).getTime() + 3600000) };
  s.msgs.push(rules);
  if (owner) s.pins.push({ league_id: leagueId, message_id: rules.id, by: owner.id, at: rules.created_at });
  s.msgs.push({ id: uid(), league_id: leagueId, author: bots[0].id, kind: 'text', body: BOT.chat[1], reply_to: null, mentions: [], reactions: [], created_at: iso(now - 25 * 60000) });
  s.msgs.push({ id: uid(), league_id: leagueId, author: bots[1].id, kind: 'text', body: 'In. Losers buy coffee ☕', reply_to: null, mentions: [], reactions: [], created_at: iso(now - 22 * 60000) });
  return true;
}

/* ---------- match hook ---------- */
const ladder = (ms: { id: string; rating: number; played: boolean }[]) => ms.filter((m) => m.played).sort((a, b) => b.rating - a.rating).map((m) => m.id);

// afterMatchRecorded: the match card (K1.2), a crown event card (K1.3) and a bot that reacts and comments within a minute.
export function chatAfterMatch(d: DB, matchId: string) {
  const m = d.matches.find((x) => x.id === matchId);
  const l = m && d.leagues.find((x) => x.id === m.league_id);
  if (!m || !l || !isOn(l, 'chat')) return;
  seedChat(d, l.id);
  const s = store(d), cfg = settingsOf(d, l.id);
  const now = Date.now();
  if (cfg.matches && !s.msgs.some((x) => x.match_id === m.id)) {
    s.msgs.push({ id: uid(), league_id: l.id, author: null, kind: 'match', body: '', match_id: m.id, reply_to: null, mentions: [], reactions: [], created_at: m.played_at });
  }
  const ms = d.members.filter((x) => x.league_id === l.id);
  const ps = d.mps.filter((p) => p.match_id === m.id);
  const inMatch = new Map(ps.map((p) => [p.member_id, p]));
  const before = ladder(ms.map((x) => { const p = inMatch.get(x.id); return { id: x.id, rating: p ? p.rating_before : x.rating, played: x.wins + x.losses - (p ? 1 : 0) > 0 }; }));
  const after = ladder(ms.map((x) => ({ id: x.id, rating: x.rating, played: x.wins + x.losses > 0 })));
  const king = ms.find((x) => x.id === after[0]);
  if (cfg.crown && king && before[0] && before[0] !== king.id) {
    s.msgs.push({ id: uid(), league_id: l.id, author: null, kind: 'event', body: '', event: { icon: '👑', title: `${king.display_name} took the crown`, sub: `${king.rating} rating`, href: '/crown' }, reply_to: null, mentions: [], reactions: [], created_at: iso(new Date(m.played_at).getTime() + 1) });
  }
  // Bots only liven up matches a real person logged.
  if (m.created_by === 'seed' || !ms.some((x) => x.user_id === m.created_by)) return;
  const bots = ms.filter((x) => isBot(x) && !x.status);
  if (!bots.length) return;
  const playing = bots.filter((b) => inMatch.has(b.id));
  const bot = playing.length ? pick(playing) : pick(bots);
  const side = inMatch.get(bot.id)?.side;
  const body = !side ? pick(BOT.watching) : side === m.winner ? pick(BOT.wonVsYou) : pick(BOT.lostVsYou);
  queueBot(d, { league_id: l.id, at: iso(now + between(20, 50)), member: bot.id, kind: 'comment', target: m.id, body });
  const fan = bots.find((b) => b.id !== bot.id);
  if (fan) queueBot(d, { league_id: l.id, at: iso(now + between(6, 18)), member: fan.id, kind: 'mreact', target: m.id, emoji: pick(['👏', '🔥', '😂']) });
}

/* ---------- text rules (K12 filter, mentions) ---------- */
const BANNED = ['kys', 'kill yourself', 'kill urself', 'neck yourself', 'retard', 'faggot', 'buzi', 'nyomorek'];
const PROFANE = ['fuck', 'shit', 'bitch', 'kurva', 'bazdmeg', 'geci', 'picsa', 'fasz'];
const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/0/g, 'o').replace(/1/g, 'i').replace(/3/g, 'e').replace(/4/g, 'a').replace(/5/g, 's').replace(/\$/g, 's');

// Standard rejects abuse and hate, Strict also stars swear words. Returns null when it can't be posted.
export function filterText(body: string, level: ChatSettings['filter']): string | null {
  const n = norm(body);
  if (BANNED.some((w) => new RegExp(`(^|[^a-z])${w}`).test(n))) return null;
  if (level !== 'strict') return body;
  let out = body;
  PROFANE.forEach((w) => {
    const re = new RegExp(w.split('').join('[^a-z]?'), 'gi');
    if (re.test(norm(out))) out = out.replace(new RegExp(w, 'gi'), (x) => x[0] + '*'.repeat(x.length - 1));
  });
  return out;
}

// Members mentioned as @Name (longest names first so "Ann" does not steal "Anna").
export function parseMentions(body: string, members: Member[]) {
  const lower = body.toLowerCase();
  const ids: string[] = [];
  [...members].sort((a, b) => b.display_name.length - a.display_name.length).forEach((m) => {
    const tag = '@' + m.display_name.toLowerCase();
    const i = lower.indexOf(tag);
    if (i >= 0 && !/[a-z0-9]/i.test(lower[i + tag.length] ?? '') && !ids.includes(m.id)) ids.push(m.id);
  });
  return { ids, everyone: /(^|\s)@everyone\b/i.test(body) };
}

// Splits text into plain and @mention parts for highlighting.
export function mentionParts(body: string, names: string[]) {
  if (!names.length) return [{ text: body, mention: false }];
  const esc = [...names, 'everyone'].sort((a, b) => b.length - a.length).map((n) => n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return body.split(new RegExp(`(@(?:${esc.join('|')}))(?![a-z0-9])`, 'i')).filter(Boolean).map((text) => ({ text, mention: text.startsWith('@') }));
}
