// Account level data: age gate (A4, A4.1), data export (B1.6) and account deletion (B1.7).
import AsyncStorage from '@react-native-async-storage/async-storage';

import { auth, db, save, wait, type User } from '@/lib/api';
import { astore, bandOf, ageFrom, deleteUserData, exportFor, ownedLeagues, under16, type AgeBand, type Handover } from '@/lib/account-core';
import { bstore, subOf } from '@/lib/billing';
import { notify, type DB } from '@/lib/engine';
import { isOn } from '@/lib/modules';
import { PLANS, entitled, longDate } from '@/lib/plans';

export type { AccountStore, AgeBand, Handover } from '@/lib/account-core';

/* ---------- age (A4) ---------- */
const bands = new Map<string, AgeBand>();
const prime = (d: DB) => { Object.entries(astore(d).profiles).forEach(([id, p]) => bands.set(id, p.age_band)); };
setTimeout(() => { db().then(prime).catch(() => {}); }, 0);

// Sync: predictions, coin stakes and similar features hide for players under 16. Unknown age counts as 16+.
// Pass `d` inside a data function to read the store directly.
export function isUnder16(userId: string | null | undefined, d?: DB): boolean {
  if (!userId) return false;
  return under16(d ? astore(d).profiles[userId]?.age_band : bands.get(userId));
}
export async function ageBand(userId: string): Promise<AgeBand | null> {
  const d = await db();
  return astore(d).profiles[userId]?.age_band ?? null;
}
export async function blockedRecently(userId: string) {
  const d = await db();
  const at = astore(d).blocked[userId];
  return !!at && Date.now() - Date.parse(at) < 86400000;
}

// Onboarding asks once: 'ask' for a new account, 'blocked' after an under 13 answer in the last day.
export async function needsAge(userId: string): Promise<'ask' | 'blocked' | null> {
  if (await blockedRecently(userId)) return 'blocked';
  return (await ageBand(userId)) ? null : 'ask';
}

// The first answer sticks; only support can change it.
export async function setBirth(user: User, year: number, month: number): Promise<AgeBand> {
  await wait(250);
  const d = await db();
  const a = astore(d);
  const existing = a.profiles[user.id]?.age_band;
  if (existing) return existing;
  const band = bandOf(ageFrom(year, month));
  if (band === 'under13') {
    deleteUserData(d, user.id, {});
    astore(d).blocked[user.id] = new Date().toISOString();
  } else {
    a.profiles[user.id] = { age_band: band, set_at: new Date().toISOString() };
    bands.set(user.id, band);
  }
  await save();
  return band;
}

/* ---------- B1.6 export ---------- */
export async function exportMyData(user: User) {
  await wait(600);
  const d = await db();
  const data = exportFor(d, user);
  astore(d).exports[user.id] = data.exported_at;
  await save();
  return { json: JSON.stringify(data, null, 2), matches: data.matches.length, at: data.exported_at };
}
export async function lastExport(userId: string) { const d = await db(); return astore(d).exports[userId] ?? null; }

/* ---------- B1.7 delete ---------- */
export async function deletionSummary(userId: string) {
  const d = await db();
  const mine = d.members.filter((m) => m.user_id === userId && !m.status);
  const ids = new Set(mine.map((m) => m.id));
  const matches = new Set(d.mps.filter((p) => ids.has(p.member_id)).map((p) => p.match_id)).size;
  const leagues = mine.map((m) => d.leagues.find((l) => l.id === m.league_id)).filter((l) => !!l);
  const teams = new Set(leagues.map((l) => l!.team_id)).size;
  const paying = Object.values(bstore(d).subs).map((s) => subOf(d, s.team_id)).filter((s) => s && s.paid_by === userId && entitled(s) && s.store !== 'promo' && s.status !== 'ending')
    .map((s) => ({ team: d.teams.find((t) => t.id === s!.team_id)?.name ?? 'Your team', plan: PLANS[s!.plan].name, until: longDate(s!.renews_at), teamId: s!.team_id }));
  const owned = ownedLeagues(d, userId).map((o) => ({
    leagueId: o.league.id, league: o.league.name, team: o.team, suggested: o.suggested,
    members: o.members.map((m) => ({ id: m.id, name: m.display_name, role: m.role, bot: !m.user_id })),
    paid: (() => { const s = subOf(d, o.league.team_id); return s && entitled(s) ? `${PLANS[s.plan].name} plan stays until ${longDate(s.renews_at)}.` : null; })(),
  }));
  return { matches, leagues: leagues.length, teams, coins: leagues.some((l) => isOn(l!, 'coins')), cards: leagues.some((l) => isOn(l!, 'cards')), paying, owned };
}

export async function deleteAccount(user: User, handover: Handover, reason?: string | null) {
  await wait(1000);
  const d = await db();
  const handed: string[] = [];
  deleteUserData(d, user.id, handover, (m, league) => {
    handed.push(`${m.display_name} now owns ${league}`);
    if (m.user_id) notify(d, { league_id: m.league_id, member_id: m.id, kind: 'league.owner', title: `You now own ${league}`, body: 'The previous owner deleted their account and handed the league to you.', href: '/league' });
  });
  void reason; // a leaving reason would go to analytics in the store build
  await save();
  await AsyncStorage.multiRemove(['liga.session', 'liga.currentLeague', 'liga.pendingInvite', 'liga.search.recent', 'liga.inbox.seen']); // session too, so a closed app does not come back signed in
  return { handed };
}
// Called from the Account deleted screen's Close.
export const finishDeletion = () => auth.signOut();
