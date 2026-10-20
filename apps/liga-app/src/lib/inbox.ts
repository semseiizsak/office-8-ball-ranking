// K4 inbox data, K6 notification prefs, K4.5 push permission state, local delivery.
// Notices are written by noticesForMatch / noticesForReaction (inbox-rules.ts) and by notify() in other features.
// Test build: local notifications only. Remote push (Expo Push API) needs a dev build and the server.
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

import { db, save } from '@/lib/api';
import type { Notice } from '@/lib/engine';
import { DEFAULT_PREFS, isAction, shouldPush, visible, type Prefs } from '@/lib/inbox-rules';

export * from '@/lib/inbox-rules';

export type InboxItem = Notice & { league_name: string };
const RETAIN_DAYS = 90, MAX_PER_USER = 500;

/* ---------- change events (badge, banner) ---------- */
const listeners = new Set<() => void>();
export const onInboxChange = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
export const inboxChanged = () => listeners.forEach((l) => l());

/* ---------- reads and writes ---------- */
async function mine(userId: string) {
  const d = await db();
  const ids = new Set(d.members.filter((m) => m.user_id === userId).map((m) => m.id));
  return { d, ids, list: (d.notices ?? []).filter((n) => ids.has(n.member_id)) };
}

export async function listNotices(userId: string): Promise<InboxItem[]> {
  const { d, ids, list } = await mine(userId);
  const cutoff = new Date(Date.now() - RETAIN_DAYS * 86400000).toISOString();
  const keep = list.filter((n) => n.created_at >= cutoff).sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, MAX_PER_USER);
  if (keep.length < list.length) {
    const ok = new Set(keep.map((n) => n.id));
    d.notices = (d.notices ?? []).filter((n) => !ids.has(n.member_id) || ok.has(n.id));
    await save();
  }
  const prefs = await getPrefs();
  return keep.filter((n) => visible(n, prefs)).map((n) => ({ ...n, league_name: d.leagues.find((l) => l.id === n.league_id)?.name ?? '' }));
}

export async function unreadCount(userId: string) {
  const [{ list }, prefs] = await Promise.all([mine(userId), getPrefs()]);
  return list.filter((n) => !n.read && visible(n, prefs)).length;
}

export async function markRead(id: string, read = true) {
  const d = await db();
  const n = d.notices?.find((x) => x.id === id);
  if (!n || n.read === read) return;
  n.read = read;
  await save(); inboxChanged();
}

export async function markAllRead(userId: string) {
  const { list } = await mine(userId);
  list.forEach((n) => { n.read = true; });
  await save(); inboxChanged();
}

export async function deleteNotice(id: string) {
  const d = await db();
  const n = d.notices?.find((x) => x.id === id);
  d.notices = (d.notices ?? []).filter((x) => x.id !== id);
  await save(); inboxChanged();
  return n ?? null;
}

export async function restoreNotice(n: Notice) {
  const d = await db();
  d.notices = [...(d.notices ?? []).filter((x) => x.id !== n.id), n];
  await save(); inboxChanged();
}

export async function noticeTarget(n: Notice) {
  const d = await db();
  const id = /^\/match\/([^/?#]+)/.exec(n.href)?.[1];
  return { matchGone: !!id && !d.matches.some((m) => m.id === id), league: d.leagues.find((l) => l.id === n.league_id) };
}

/* ---------- K6 prefs, stored on this phone ---------- */
const PREFS_KEY = 'liga.notifPrefs';
let prefsCache: Prefs | null = null;
export async function getPrefs(): Promise<Prefs> {
  if (prefsCache) return prefsCache;
  const raw = await AsyncStorage.getItem(PREFS_KEY);
  prefsCache = raw ? { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Prefs) } : DEFAULT_PREFS;
  return prefsCache;
}
export async function setPrefs(p: Prefs) {
  prefsCache = p;
  await AsyncStorage.setItem(PREFS_KEY, JSON.stringify(p));
  inboxChanged();
}

/* ---------- K4.5 and A13 push permission ---------- */
const PROMPT_KEY = 'liga.pushPrompt';
type PromptState = { count: number; last: string | null; cardHiddenUntil: string | null };
const DAYS = 86400000;
async function promptState(): Promise<PromptState> {
  const raw = await AsyncStorage.getItem(PROMPT_KEY);
  return raw ? JSON.parse(raw) : { count: 0, last: null, cardHiddenUntil: null };
}
async function setPromptState(p: Partial<PromptState>) { await AsyncStorage.setItem(PROMPT_KEY, JSON.stringify({ ...(await promptState()), ...p })); }

export type PushStatus = 'granted' | 'denied' | 'undetermined';
export async function pushStatus(): Promise<PushStatus> {
  try {
    const p = await Notifications.getPermissionsAsync();
    return p.granted || p.ios?.status === Notifications.IosAuthorizationStatus.PROVISIONAL ? 'granted' : p.canAskAgain ? 'undetermined' : 'denied';
  } catch { return 'denied'; }
}
export async function requestPush() {
  try {
    if (Platform.OS === 'android') await Notifications.setNotificationChannelAsync('default', { name: 'Liga', importance: Notifications.AndroidImportance.DEFAULT });
    await Notifications.requestPermissionsAsync();
  } catch { /* Expo Go on Android has no push; local notifications still try */ }
  return pushStatus();
}
// Not now: wait 14 days, at most 3 times in total.
export async function notNow() { const s = await promptState(); await setPromptState({ count: s.count + 1, last: new Date().toISOString() }); }
export async function hideInboxCard() { await setPromptState({ cardHiddenUntil: new Date(Date.now() + 14 * DAYS).toISOString() }); }
export async function inboxCardVisible() { const s = await promptState(); return !s.cardHiddenUntil || new Date(s.cardHiddenUntil).getTime() < Date.now(); }

// A13 trigger: only after the first logged match or first challenge, never on launch.
export async function promptReason(userId: string): Promise<{ reason: 'match' | 'challenge'; who: string } | null> {
  const s = await promptState();
  if (s.count >= 3 || (s.last && Date.now() - new Date(s.last).getTime() < 14 * DAYS)) return null;
  if ((await pushStatus()) === 'granted') return null;
  const { d, ids, list } = await mine(userId);
  const name = (id?: string) => d.members.find((m) => m.id === id)?.display_name ?? 'Dave';
  const challenged = list.find((n) => n.kind.startsWith('challenge'));
  const challenges = Array.isArray(d.challenges) ? (d.challenges as Record<string, unknown>[]) : [];
  const sent = challenges.find((c) => Object.values(c).some((v) => typeof v === 'string' && ids.has(v)));
  if (challenged || sent) {
    const other = sent && Object.values(sent).find((v) => typeof v === 'string' && !ids.has(v) && d.members.some((m) => m.id === v));
    return { reason: 'challenge', who: other ? name(other as string) : challenged?.title.split(' ')[0] ?? 'Dave' };
  }
  const last = [...d.matches].reverse().find((m) => m.created_by === userId);
  if (!last) return null;
  const opp = d.mps.find((p) => p.match_id === last.id && !ids.has(p.member_id));
  return { reason: 'match', who: name(opp?.member_id) };
}

/* ---------- delivery: in-app banner in front, local notification in background ---------- */
const SEEN_KEY = 'liga.inbox.seen';
// New unread notices since the last call; the first call only sets the watermark.
export async function freshNotices(userId: string) {
  const mark = await AsyncStorage.getItem(SEEN_KEY);
  const { list } = await mine(userId);
  const top = list.reduce((a, n) => (n.created_at > a ? n.created_at : a), mark ?? '');
  if (top !== mark) await AsyncStorage.setItem(SEEN_KEY, top);
  if (mark === null) return [];
  return list.filter((n) => n.created_at > mark && !n.read).sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export async function pushLocal(n: Notice, force = false) {
  if (!force && !shouldPush(n, await getPrefs())) return;
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: n.title, body: n.body, data: { href: n.href, id: n.id, league_id: n.league_id }, interruptionLevel: isAction(n.kind) ? 'active' : 'passive' },
      trigger: null,
    });
  } catch { /* not available in this runtime */ }
}

// K6.1 test notification, a few seconds later so it can be seen from the lock screen.
export async function sendTest() {
  try {
    await Notifications.scheduleNotificationAsync({
      content: { title: 'Anna logged a match with you', body: 'Anna won 10 : 7. You −14 Elo, now 1 012.', data: { href: '/inbox' } },
      trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 3 },
    });
    return true;
  } catch { return false; }
}
