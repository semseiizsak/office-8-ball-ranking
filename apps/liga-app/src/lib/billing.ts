// Mock subscription store that behaves like RevenueCat (offerings, purchase, restore, entitlement, trial)
// until the dev build has real IAP. The entitlement belongs to the team (teams.plan), so every league of a
// paying team is on that plan. Status changes and purchase outcomes are testable from About, Billing test panel.
import { db, save, wait, type User } from '@/lib/api';
import { ApiError, notify, uid, type DB } from '@/lib/engine';
import {
  PLANS, PROMOS, RANK, advance, entitled, leagueCap, newSub, offerings, planOf, playerCap, product, productById, readOnlyIds,
  type PlanId, type Product, type Reason, type Sub, type SubStatus,
} from '@/lib/plans';
import type { League, Member } from '@/lib/types';

export type { PlanId, Reason } from '@/lib/plans';
export type Outcome = 'success' | 'cancel' | 'fail' | 'pending';
export type BillingStore = {
  subs: Record<string, Sub>; // team id -> subscription
  trialUsed: Record<string, string>; // team id -> when the 14 day trial started (once per team)
  purchases: { user_id: string; team_id: string; product: string; at: string }[]; // what this phone's store account bought (restore)
  requests: { id: string; user_id: string; team_id: string; reason: string; created_at: string }[]; // B5.10
  leads: { id: string; user_id: string; company: string; email: string; players: number; needs: string[]; message: string; created_at: string }[]; // B5.11
  promos: { team_id: string; code: string; at: string }[];
  sim: { outcome: Outcome; storeDown: boolean };
  notified: Record<string, string>; // usage notices sent, key -> date
};
export class PurchaseError extends Error { constructor(public kind: 'cancelled' | 'failed' | 'store') { super(kind); } }

const DAY = 86400000;
export function bstore(d: DB): BillingStore {
  const b = (d.billing ?? {}) as Partial<BillingStore>;
  d.billing = { subs: {}, trialUsed: {}, purchases: [], requests: [], leads: [], promos: [], sim: { outcome: 'success', storeDown: false }, notified: {}, ...b };
  return d.billing as BillingStore;
}

/* ---------- sync entitlement cache for hasPro() ---------- */
const cache = { team: new Map<string, string>(), subs: new Map<string, Sub>() };
function prime(d: DB) {
  cache.team = new Map(d.leagues.map((l) => [l.id, l.team_id]));
  cache.subs = new Map(Object.entries(bstore(d).subs));
}
setTimeout(() => { db().then(prime).catch(() => {}); }, 0);

// Sync check other features use to gate Pro extras (cosmetics only, never coins or packs).
export function hasPro(league: (Pick<League, 'id'> & { team_id?: string; plan?: PlanId }) | null | undefined): boolean {
  if (!league) return false;
  if (league.plan) return league.plan !== 'free';
  return planFor(league) !== 'free';
}
export function planFor(league: (Pick<League, 'id'> & { team_id?: string }) | null | undefined): PlanId {
  const team = league?.team_id ?? (league ? cache.team.get(league.id) : undefined);
  const s = team ? cache.subs.get(team) : undefined;
  return s ? planOf(advance(s)) : 'free';
}

/* ---------- reads ---------- */
const leagueOf = (d: DB, leagueId: string) => { const l = d.leagues.find((x) => x.id === leagueId); if (!l) throw new ApiError('unknown league'); return l; };
const teamName = (d: DB, teamId: string) => d.teams.find((t) => t.id === teamId)?.name ?? 'Your team';
const isAdmin = (m?: Member | null) => m?.role === 'owner' || m?.role === 'admin';

export function subOf(d: DB, teamId: string): Sub | null {
  const s = bstore(d).subs[teamId];
  if (!s) return null;
  const next = advance(s);
  if (next.status !== s.status || next.renews_at !== s.renews_at) bstore(d).subs[teamId] = next;
  return next;
}

export function usageOf(d: DB, teamId: string) {
  const sub = subOf(d, teamId);
  const plan = planOf(sub);
  const leagues = d.leagues.filter((l) => l.team_id === teamId && !l.archived_at);
  const ids = new Set(leagues.map((l) => l.id));
  const players = new Map<string, Member>();
  d.members.filter((m) => ids.has(m.league_id) && !m.status && !m.guest).forEach((m) => {
    const key = m.user_id ?? m.id;
    const prev = players.get(key);
    if (!prev || (m.last_played_at ?? '') > (prev.last_played_at ?? '')) players.set(key, m);
  });
  return { plan, players: players.size, cap: playerCap(plan, sub?.band ?? null), leagues: leagues.length, leagueCap: leagueCap(plan), list: [...players.values()] };
}

// B5.7 downgrade: over the cap, the most active players stay, the rest can watch but not log.
export function readOnlyIn(d: DB, leagueId: string): Set<string> {
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) return new Set();
  const u = usageOf(d, l.team_id);
  const ro = readOnlyIds(u.list.map((m) => ({ id: m.user_id ?? m.id, last_played_at: m.last_played_at })), u.cap);
  return new Set(d.members.filter((m) => m.league_id === leagueId && ro.has(m.user_id ?? m.id)).map((m) => m.id));
}

// Soft limit check before an action: returns the paywall reason, or null when the plan allows it.
export async function planGate(leagueId: string, memberId: string | null, action: 'log' | 'invite' | 'league'): Promise<Reason | null> {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  if (!l) return null;
  const u = usageOf(d, l.team_id);
  if (action === 'log') return memberId && readOnlyIn(d, leagueId).has(memberId) ? 'readonly' : null;
  if (action === 'invite') return u.players >= u.cap ? 'seats' : null;
  return u.leagueCap !== null && u.leagues >= u.leagueCap ? 'leagues' : null;
}

export type BillingInfo = {
  teamId: string; team: string; sub: Sub | null; plan: PlanId; admin: boolean; isPayer: boolean; payer: string | null;
  trialEligible: boolean; usage: ReturnType<typeof usageOf>; readOnly: boolean; owner: string; lastAsk: string | null; // lastAsk: within the last day
};
export async function billingInfo(userId: string, leagueId: string): Promise<BillingInfo> {
  const d = await db();
  const l = leagueOf(d, leagueId);
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === userId);
  const sub = subOf(d, l.team_id);
  const usage = usageOf(d, l.team_id);
  const b = bstore(d);
  const payerMember = sub ? d.members.find((m) => m.user_id === sub.paid_by) : null;
  const owner = d.members.find((m) => m.league_id === leagueId && m.role === 'owner')?.display_name ?? 'your admin';
  const ask = b.requests.filter((r) => r.user_id === userId && r.team_id === l.team_id).sort((x, y) => y.created_at.localeCompare(x.created_at))[0];
  usageNotice(d, l.team_id, usage);
  trialNotice(d, l.team_id, sub);
  prime(d);
  await save();
  return {
    teamId: l.team_id, team: teamName(d, l.team_id), sub, plan: planOf(sub), admin: isAdmin(me), isPayer: !!sub && sub.paid_by === userId,
    payer: sub ? (sub.paid_by === userId ? 'you' : payerMember?.display_name ?? 'a former admin') : null,
    trialEligible: !b.trialUsed[l.team_id], usage, readOnly: !!me && readOnlyIn(d, leagueId).has(me.id), owner, lastAsk: ask && Date.now() - Date.parse(ask.created_at) < DAY ? ask.created_at : null,
  };
}

// B5.7: one inbox notice to admins at 80 % and when full.
function usageNotice(d: DB, teamId: string, u: ReturnType<typeof usageOf>) {
  const level = u.players >= u.cap ? 'full' : u.players >= Math.ceil(u.cap * 0.8) ? '80' : null;
  if (!level) return;
  const key = `${teamId}:${u.plan}:${level}`;
  const b = bstore(d);
  if (b.notified[key]) return;
  b.notified[key] = new Date().toISOString();
  const left = Math.max(0, u.cap - u.players);
  const title = level === 'full' ? `${teamName(d, teamId)} is full` : `${u.players} of ${u.cap} players`;
  const body = level === 'full' ? `${u.players} of ${u.cap} players on ${PLANS[u.plan].name}. A bigger plan makes room for everyone.` : `${left === 1 ? 'One spot' : `${left} spots`} left on ${PLANS[u.plan].name}.`;
  adminsOf(d, teamId).forEach((m) => notify(d, { league_id: m.league_id, member_id: m.id, kind: 'billing.usage', title, body, href: '/plans/status' }));
}
// B5.4: two days before the trial ends, once, to owners and admins (stands in for the scheduled push).
function trialNotice(d: DB, teamId: string, s: Sub | null) {
  if (s?.status !== 'trial' || !s.trial_ends_at || Date.parse(s.trial_ends_at) - Date.now() > 2 * DAY) return;
  const key = `${teamId}:trial:${s.trial_ends_at}`;
  const b = bstore(d);
  if (b.notified[key]) return;
  b.notified[key] = new Date().toISOString();
  const name = PLANS[s.plan].name;
  const day = new Date(s.trial_ends_at).toLocaleDateString('en-GB', { weekday: 'long' });
  adminsOf(d, teamId).forEach((m) => notify(d, { league_id: m.league_id, member_id: m.id, kind: 'billing.trial', title: `Your ${name} trial ends ${day}`, body: `Keep ${name} or switch to Free, nothing is lost.`, href: '/plans?reason=trial_end' }));
}
const adminsOf = (d: DB, teamId: string) => onePerUser(d, teamId).filter(isAdmin);
function onePerUser(d: DB, teamId: string) {
  const ids = new Set(d.leagues.filter((l) => l.team_id === teamId).map((l) => l.id));
  const seen = new Set<string>();
  return d.members.filter((m) => ids.has(m.league_id) && m.user_id && !m.status && !seen.has(m.user_id) && seen.add(m.user_id));
}

/* ---------- store (RevenueCat-like) ---------- */
export async function getOfferings(): Promise<Product[]> {
  await wait(700);
  const d = await db();
  if (bstore(d).sim.storeDown) throw new PurchaseError('store');
  return offerings();
}

// B5.5: Confirming, then success, pending (Ask to Buy), cancel (silent) or failure (nothing charged).
export async function purchase(user: User, leagueId: string, productId: string, trial: boolean): Promise<'success' | 'pending'> {
  await wait(1400);
  const d = await db();
  const b = bstore(d);
  const l = leagueOf(d, leagueId);
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);
  if (!isAdmin(me)) throw new ApiError('only owners and admins can buy');
  const p = productById(productId);
  if (!p) throw new PurchaseError('failed');
  if (b.sim.storeDown) throw new PurchaseError('store');
  if (b.sim.outcome === 'cancel') throw new PurchaseError('cancelled');
  if (b.sim.outcome === 'fail') throw new PurchaseError('failed');
  const useTrial = trial && !b.trialUsed[l.team_id];
  const sub = newSub(p, l.team_id, user.id, useTrial);
  if (b.sim.outcome === 'pending') sub.status = 'pending';
  b.subs[l.team_id] = sub;
  if (useTrial) b.trialUsed[l.team_id] = sub.started_at;
  b.purchases = b.purchases.filter((x) => !(x.user_id === user.id && x.team_id === l.team_id));
  b.purchases.push({ user_id: user.id, team_id: l.team_id, product: p.id, at: sub.started_at });
  if (sub.status !== 'pending') announce(d, l.team_id, sub);
  prime(d);
  await save();
  return sub.status === 'pending' ? 'pending' : 'success';
}

function announce(d: DB, teamId: string, sub: Sub) {
  const what = { team: 'Seasons, challenges and live matches are on.', club: 'Kiosk mode and unlimited leagues are on.', business: 'Every Club feature plus single sign on is on.' }[sub.plan];
  onePerUser(d, teamId).forEach((m) => notify(d, { league_id: m.league_id, member_id: m.id, kind: 'billing.plan', title: `${teamName(d, teamId)} is on ${PLANS[sub.plan].name}`, body: what, href: '/plans/status' }));
}

// B5.8 restore. A purchase made for another team can move here when the user is an admin in both.
export async function restore(user: User, leagueId: string): Promise<{ kind: 'restored'; plan: PlanId; team: string } | { kind: 'none' } | { kind: 'other'; fromTeam: string; fromName: string; team: string }> {
  await wait(1200);
  const d = await db();
  const b = bstore(d);
  const l = leagueOf(d, leagueId);
  const mine = b.purchases.filter((x) => x.user_id === user.id).sort((x, y) => y.at.localeCompare(x.at));
  const here = mine.find((x) => x.team_id === l.team_id);
  if (here) {
    const s = subOf(d, l.team_id);
    if (!entitled(s)) {
      const p = productById(here.product);
      if (!p) return { kind: 'none' };
      b.subs[l.team_id] = { ...newSub(p, l.team_id, user.id, false), started_at: here.at };
    }
    prime(d);
    await save();
    return { kind: 'restored', plan: b.subs[l.team_id].plan, team: teamName(d, l.team_id) };
  }
  const other = mine.find((x) => entitled(subOf(d, x.team_id)));
  if (other) return { kind: 'other', fromTeam: other.team_id, fromName: teamName(d, other.team_id), team: teamName(d, l.team_id) };
  return { kind: 'none' };
}
export async function moveSubscription(user: User, fromTeam: string, leagueId: string) {
  const d = await db();
  const b = bstore(d);
  const l = leagueOf(d, leagueId);
  const adminIn = (teamId: string) => d.members.some((m) => m.user_id === user.id && isAdmin(m) && d.leagues.find((x) => x.id === m.league_id)?.team_id === teamId);
  if (!adminIn(fromTeam) || !adminIn(l.team_id)) throw new ApiError('admin in both teams');
  const s = b.subs[fromTeam];
  if (!s) throw new ApiError('nothing to move');
  b.subs[l.team_id] = { ...s, team_id: l.team_id };
  delete b.subs[fromTeam];
  b.purchases.forEach((x) => { if (x.user_id === user.id && x.team_id === fromTeam) x.team_id = l.team_id; });
  announce(d, l.team_id, b.subs[l.team_id]);
  prime(d);
  await save();
}

// B5.9 stand-in for the store's own sheet: turn auto renew off (Ending) or back on.
export async function setAutoRenew(user: User, leagueId: string, on: boolean) {
  await wait(500);
  const d = await db();
  const l = leagueOf(d, leagueId);
  const s = subOf(d, l.team_id);
  if (!s || s.paid_by !== user.id) throw new ApiError('only the payer');
  if (on && s.status === 'ending') s.status = 'active';
  if (!on && (s.status === 'active' || s.status === 'trial')) {
    s.status = 'ending';
    if (s.trial_ends_at && Date.parse(s.trial_ends_at) > Date.now()) s.renews_at = s.trial_ends_at;
    adminsOf(d, l.team_id).filter((m) => m.user_id !== user.id).forEach((m) => notify(d, { league_id: m.league_id, member_id: m.id, kind: 'billing.ending', title: `${PLANS[s.plan].name} ends ${new Date(s.renews_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`, body: `${teamName(d, l.team_id)} goes back to Free after that. Nothing is deleted.`, href: '/plans/status' }));
  }
  bstore(d).subs[l.team_id] = s;
  prime(d);
  await save();
}

/* ---------- members, sales, promo ---------- */
// B5.10: one request a day per person, collected for the owner and admins.
export async function askAdmin(user: User, leagueId: string, reason: string) {
  await wait(400);
  const d = await db();
  const b = bstore(d);
  const l = leagueOf(d, leagueId);
  const last = b.requests.find((r) => r.user_id === user.id && r.team_id === l.team_id && Date.now() - Date.parse(r.created_at) < DAY);
  if (last) return last.created_at;
  const now = new Date().toISOString();
  b.requests.push({ id: uid(), user_id: user.id, team_id: l.team_id, reason, created_at: now });
  const week = b.requests.filter((r) => r.team_id === l.team_id && Date.now() - Date.parse(r.created_at) < 7 * DAY);
  const who = new Set(week.map((r) => r.user_id)).size;
  const reasons = [...new Set(week.map((r) => r.reason))].join(', ');
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);
  adminsOf(d, l.team_id).forEach((m) => notify(d, { league_id: m.league_id, member_id: m.id, kind: 'billing.ask',
    title: who > 1 ? `${who} people asked for an upgrade this week` : `${me?.display_name ?? 'Someone'} asked for an upgrade`, body: reasons, href: '/plans' }));
  await save();
  return now;
}

export async function sendLead(user: User, p: { company: string; email: string; players: number; needs: string[]; message: string }) {
  await wait(700);
  const d = await db();
  bstore(d).leads.push({ id: uid(), user_id: user.id, ...p, created_at: new Date().toISOString() });
  await save();
}

// B5.12 server codes (store offer codes need the dev build). Applied = a free period on the team.
export async function redeemPromo(user: User, leagueId: string, raw: string): Promise<{ ok: true; plan: PlanId; days: number } | { ok: false; why: 'invalid' | 'ended' | 'used' | 'paid'; ends?: string }> {
  await wait(900);
  const code = raw.trim().toUpperCase();
  const d = await db();
  const b = bstore(d);
  const l = leagueOf(d, leagueId);
  const p = PROMOS[code];
  if (!p) return { ok: false, why: 'invalid' };
  if (Date.parse(p.ends) < Date.now()) return { ok: false, why: 'ended', ends: p.ends };
  if (b.promos.some((x) => x.team_id === l.team_id && x.code === code)) return { ok: false, why: 'used' };
  const cur = subOf(d, l.team_id);
  if (entitled(cur) && cur!.store !== 'promo' && RANK[cur!.plan] >= RANK[p.plan]) return { ok: false, why: 'paid' };
  const sub = newSub(product(p.plan, 'monthly', p.plan === 'team' ? null : 20), l.team_id, user.id, false);
  sub.store = 'promo'; sub.status = 'ending'; sub.price = 0;
  sub.renews_at = new Date(Date.now() + p.days * DAY).toISOString();
  b.subs[l.team_id] = sub;
  b.promos.push({ team_id: l.team_id, code, at: sub.started_at });
  announce(d, l.team_id, sub);
  prime(d);
  await save();
  return { ok: true, plan: p.plan, days: p.days };
}

/* ---------- Billing test panel (About, 7 taps) ---------- */
export async function simState() { const d = await db(); return { ...bstore(d).sim }; }
export async function setSim(p: Partial<BillingStore['sim']>) { const d = await db(); Object.assign(bstore(d).sim, p); await save(); }

export async function testSetStatus(user: User, leagueId: string, status: SubStatus | 'none', plan: Exclude<PlanId, 'free'> = 'team') {
  const d = await db();
  const b = bstore(d);
  const l = leagueOf(d, leagueId);
  if (status === 'none') { delete b.subs[l.team_id]; prime(d); await save(); return; }
  const now = Date.now();
  const prev = b.subs[l.team_id];
  const s = prev && prev.plan === plan ? prev : newSub(product(plan, 'yearly', plan === 'team' ? null : 40), l.team_id, user.id, false); // the panel's plan pick wins
  s.status = status;
  if (status === 'trial') { s.trial_ends_at = new Date(now + 5 * DAY).toISOString(); s.renews_at = s.trial_ends_at; b.trialUsed[l.team_id] = new Date(now - 9 * DAY).toISOString(); }
  if (status === 'active' || status === 'ending') s.renews_at = new Date(now + 23 * DAY).toISOString();
  if (status === 'billing_issue') s.grace_ends_at = new Date(now + 6 * DAY).toISOString();
  b.subs[l.team_id] = s;
  if (!b.purchases.some((x) => x.team_id === l.team_id)) b.purchases.push({ user_id: s.paid_by, team_id: l.team_id, product: s.product, at: s.started_at });
  prime(d);
  await save();
}
// Moves time for the team's subscription: the trial or period ends now, as if days passed.
export async function testSkipToEnd(leagueId: string) {
  const d = await db();
  const l = leagueOf(d, leagueId);
  const s = bstore(d).subs[l.team_id];
  if (!s) return;
  const past = new Date(Date.now() - 1000).toISOString();
  if (s.status === 'trial') s.trial_ends_at = past;
  else if (s.status === 'billing_issue') s.grace_ends_at = past;
  else s.renews_at = past;
  subOf(d, l.team_id);
  prime(d);
  await save();
}
export async function testApprovePending(leagueId: string) {
  const d = await db();
  const l = leagueOf(d, leagueId);
  const s = bstore(d).subs[l.team_id];
  if (s?.status !== 'pending') return;
  s.status = s.trial_ends_at ? 'trial' : 'active';
  announce(d, l.team_id, s);
  prime(d);
  await save();
}
export async function testResetStore(leagueId: string) {
  const d = await db();
  const b = bstore(d);
  const l = leagueOf(d, leagueId);
  delete b.trialUsed[l.team_id];
  b.purchases = b.purchases.filter((x) => x.team_id !== l.team_id);
  b.requests = b.requests.filter((x) => x.team_id !== l.team_id);
  b.promos = b.promos.filter((x) => x.team_id !== l.team_id);
  Object.keys(b.notified).forEach((k) => { if (k.startsWith(l.team_id)) delete b.notified[k]; });
  await save();
}
export async function testMakeMeAdmin(user: User, leagueId: string) {
  const d = await db();
  const m = d.members.find((x) => x.league_id === leagueId && x.user_id === user.id);
  if (m && m.role === 'member') m.role = 'admin';
  await save();
}

// B5.9 stand-in: the payer updated the card in the store, the next try goes through.
export async function fixPayment(user: User, leagueId: string) {
  await wait(800);
  const d = await db();
  const l = leagueOf(d, leagueId);
  const s = subOf(d, l.team_id);
  if (!s || s.paid_by !== user.id || s.status !== 'billing_issue') return;
  s.status = 'active'; s.grace_ends_at = null;
  bstore(d).subs[l.team_id] = s;
  prime(d);
  await save();
}
