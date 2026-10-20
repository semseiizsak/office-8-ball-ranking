// Invites (A9, K8, K8.2), league templates (A8.3) and the pending invite link (A6.2, N4.3).
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { router } from 'expo-router';
import { useEffect } from 'react';

import { ApiError, db, save, wait, type User } from '@/lib/api';
import type { DB } from '@/lib/engine';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';

export type TemplateId = 'ladder' | 'office' | 'club';
export const TEMPLATES: { id: TemplateId; label: string; body: string; features: string[] }[] = [
  { id: 'ladder', label: 'Just the ladder', body: 'Log, rate, done.', features: ['Ladder and rating', 'Match log', 'History'] },
  { id: 'office', label: 'Office', body: 'Challenges, cup and lunch rivalries.', features: ['Ladder and rating', 'Challenges', 'Weekly cup', 'Cards', 'Rivalries'] },
  { id: 'club', label: 'Club', body: 'Seasons, titles and rivalries.', features: ['Ladder and rating', 'Seasons', 'Weekly cup', 'Titles', 'Rivalries'] },
];
export const templateOf = (id?: string) => TEMPLATES.find((x) => x.id === id) ?? TEMPLATES[0];

export const DAY = 86_400_000;
export const EXPIRY_CHOICES = [{ value: '1', label: '1 day' }, { value: '7', label: '7 days' }, { value: '30', label: '30 days' }, { value: 'never', label: 'Never' }] as const;
export type ExpiryChoice = (typeof EXPIRY_CHOICES)[number]['value'];

// Expo Go turns this into exp://host/--/join/CODE, a dev or store build into liga://join/CODE.
// https universal links (liga.app/j/CODE) need a dev build with associated domains.
export const inviteUrl = (code: string) => Linking.createURL(`join/${code}`, { scheme: 'liga' });
export const prettyCode = (code: string) => `${code.slice(0, 3)} ${code.slice(3)}`;
export const deviceTimezone = () => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch { return 'UTC'; } };

type Invite = NonNullable<DB['invites']>[number];

// Leagues made before invites were tracked get a record that never expires.
function inviteFor(d: DB, leagueId: string): Invite {
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) throw new ApiError('unknown league');
  d.invites = d.invites ?? [];
  let inv = d.invites.find((x) => x.league_id === leagueId && x.code === l.invite_code);
  if (!inv) { inv = { league_id: leagueId, code: l.invite_code, created_by: '', created_at: new Date().toISOString(), expires_at: null }; d.invites.push(inv); }
  return inv;
}
const expired = (inv: Invite, now = Date.now()) => !!inv.expires_at && new Date(inv.expires_at).getTime() <= now;

export async function inviteInfo(leagueId: string) {
  const d = await db();
  const known = d.invites?.length;
  const inv = inviteFor(d, leagueId);
  if (d.invites?.length !== known) await save();
  const days_left = inv.expires_at ? Math.max(0, Math.ceil((new Date(inv.expires_at).getTime() - Date.now()) / DAY)) : null;
  return { code: inv.code, expires_at: inv.expires_at, expired: expired(inv), days_left };
}

const code6 = () => Array.from({ length: 6 }, () => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[Math.floor(Math.random() * 32)]).join('');

// K8.2 new code: the old one stops working right away. Owner or admin only.
export async function regenerateCode(user: User, leagueId: string, choice: ExpiryChoice = '7') {
  await wait(250);
  const d = await db();
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);
  if (me?.role !== 'owner' && me?.role !== 'admin') throw new ApiError('not allowed');
  const l = d.leagues.find((x) => x.id === leagueId)!;
  let code = code6();
  while (d.leagues.some((x) => x.invite_code === code)) code = code6();
  l.invite_code = code;
  const now = Date.now();
  d.invites = (d.invites ?? []).filter((x) => x.league_id !== leagueId);
  d.invites.push({ league_id: leagueId, code, created_by: user.id, created_at: new Date(now).toISOString(), expires_at: choice === 'never' ? null : new Date(now + Number(choice) * DAY).toISOString() });
  await save();
  return code;
}

// A8.3 + A7.2: called right after createLeague. New invites last 7 days.
export async function applySetup(user: User, leagueId: string, p: { template?: string; timezone?: string }) {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) return;
  l.template = templateOf(p.template).id;
  l.timezone = p.timezone || deviceTimezone();
  d.invites = (d.invites ?? []).filter((x) => x.league_id !== leagueId);
  d.invites.push({ league_id: leagueId, code: l.invite_code, created_by: user.id, created_at: l.created_at, expires_at: new Date(new Date(l.created_at).getTime() + 7 * DAY).toISOString() });
  await save();
}

export type InvitePreview = { league_id: string; league_name: string; team_name: string; sport: string; member_count: number; taken_jerseys: number[]; inviter: string | null };
export type InviteStatus = 'ok' | 'invalid' | 'expired' | 'archived' | 'member';

// A6 / N4: one lookup that says what a code leads to.
export async function resolveInvite(code: string, userId?: string): Promise<{ status: InviteStatus; preview: InvitePreview | null }> {
  await wait(250);
  const d = await db();
  const clean = code.trim().toUpperCase();
  const l = /^[A-Z0-9]{6}$/.test(clean) ? d.leagues.find((x) => x.invite_code === clean) : undefined;
  if (!l) return { status: 'invalid', preview: null };
  const ms = d.members.filter((m) => m.league_id === l.id);
  const inv = d.invites?.find((x) => x.league_id === l.id && x.code === clean);
  const owner = ms.find((m) => m.user_id && m.user_id === inv?.created_by) ?? ms.find((m) => m.role === 'owner');
  const preview: InvitePreview = {
    league_id: l.id, league_name: l.name, team_name: d.teams.find((t) => t.id === l.team_id)?.name ?? '', sport: l.sport,
    member_count: ms.length, taken_jerseys: ms.map((m) => m.jersey), inviter: owner?.display_name ?? null,
  };
  if (userId && ms.some((m) => m.user_id === userId)) return { status: 'member', preview };
  if (l.archived_at) return { status: 'archived', preview };
  if (inv && expired(inv)) return { status: 'expired', preview };
  return { status: 'ok', preview };
}

/* ---------- pending link: kept 30 minutes while the person signs in (N4.3) ---------- */
const PENDING_KEY = 'liga.pendingInvite';
const PENDING_TTL = 30 * 60_000;

export async function setPendingInvite(code: string) {
  await AsyncStorage.setItem(PENDING_KEY, JSON.stringify({ code: code.toUpperCase(), at: Date.now() }));
}
export async function takePendingInvite(): Promise<string | null> {
  const raw = await AsyncStorage.getItem(PENDING_KEY);
  if (!raw) return null;
  await AsyncStorage.removeItem(PENDING_KEY);
  try {
    const p = JSON.parse(raw) as { code: string; at: number };
    return Date.now() - p.at < PENDING_TTL ? p.code : null;
  } catch { return null; }
}

// Mounted once in the root layout: after sign in, a stored invite link continues to its join preview.
export function usePendingInvite() {
  const { session } = useAuth();
  const { ready } = useLeague();
  const signedIn = !!session;
  useEffect(() => {
    if (!signedIn || !ready) return;
    let live = true;
    takePendingInvite().then((code) => { if (live && code) setTimeout(() => router.push(`/join/${code}`), 0); });
    return () => { live = false; };
  }, [signedIn, ready]);
}
