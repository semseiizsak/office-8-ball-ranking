// B5 plan catalog, prices (EUR incl. VAT), seat bands, limits and subscription status rules.
// Pure: no storage, so billing.ts and tests share it.

export type PlanId = 'free' | 'team' | 'club' | 'business';
export type Period = 'monthly' | 'yearly';
export type SubStatus = 'pending' | 'trial' | 'active' | 'ending' | 'billing_issue' | 'expired';
export type Sub = {
  team_id: string; plan: Exclude<PlanId, 'free'>; period: Period; band: number | null; product: string;
  status: SubStatus; started_at: string; renews_at: string; trial_ends_at?: string | null; grace_ends_at?: string | null;
  paid_by: string; store: 'app_store' | 'play' | 'promo'; price: number;
};
export type Product = { id: string; plan: Exclude<PlanId, 'free'>; period: Period; band: number | null; price: number; perMonth: number };

export const TRIAL_DAYS = 14;
export const GRACE_DAYS = 16;
export const BANDS = [20, 40, 80, 150] as const;
const DAY = 86400000;

export const PLANS: Record<PlanId, { name: string; players: number | null; leagues: number | null; lines: string[]; blurb: string }> = {
  free: { name: 'Free', players: 12, leagues: 1, blurb: 'For trying Liga with a small crew', lines: ['12 players', '1 league', 'Ladder, cup and guests'] },
  team: { name: 'Team', players: 30, leagues: 3, blurb: 'For an office or a group of friends', lines: ['30 players', '3 leagues', 'Seasons, challenges and live matches'] },
  club: { name: 'Club', players: null, leagues: null, blurb: 'Priced by players, from 10', lines: ['Players by band, up to 150', 'Any number of leagues', 'Kiosk, custom card art and CSV export'] },
  business: { name: 'Business', players: null, leagues: null, blurb: 'For companies, priced per seat', lines: ['Seats by band, up to 150', 'Single sign on and admin console', 'Invoices in EUR and priority support'] },
};
export const PAID: Exclude<PlanId, 'free'>[] = ['team', 'club', 'business'];
export const RANK: Record<PlanId, number> = { free: 0, team: 1, club: 2, business: 3 };

// Per player per month: Club 0.99 monthly, 0.79 billed yearly. Business 2.49 and 1.99 per seat.
const SEAT = { club: { monthly: 0.99, yearly: 0.79 }, business: { monthly: 2.49, yearly: 1.99 } } as const;
const r2 = (n: number) => Math.round(n * 100) / 100;

export function product(plan: Exclude<PlanId, 'free'>, period: Period, band: number | null = null): Product {
  if (plan === 'team') {
    const price = period === 'yearly' ? 59.99 : 5.99;
    return { id: `team_${period}`, plan, period, band: null, price, perMonth: period === 'yearly' ? 5 : 5.99 };
  }
  const b = band ?? BANDS[0];
  const per = SEAT[plan][period];
  return { id: `${plan}_${b}_${period}`, plan, period, band: b, price: r2(per * b * (period === 'yearly' ? 12 : 1)), perMonth: r2(per * b) };
}
export function productById(id: string): Product | null {
  const [plan, a, b] = id.split('_');
  if (plan === 'team' && (a === 'monthly' || a === 'yearly')) return product('team', a);
  if ((plan === 'club' || plan === 'business') && (b === 'monthly' || b === 'yearly')) return product(plan, b, Number(a));
  return null;
}
export const offerings = (): Product[] => [
  product('team', 'monthly'), product('team', 'yearly'),
  ...(['club', 'business'] as const).flatMap((p) => BANDS.flatMap((b) => [product(p, 'monthly', b), product(p, 'yearly', b)])),
];

// Smallest band that fits; null above 150 (Talk to us).
export const bandFor = (players: number) => BANDS.find((b) => b >= Math.max(players, 10)) ?? null;
export const savePct = (plan: Exclude<PlanId, 'free'>) => {
  const m = product(plan, 'monthly', 20).price * 12, y = product(plan, 'yearly', 20).price;
  return Math.round((1 - y / m) * 100);
};

export const euro = (n: number) => '€' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const longDate = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

export const playerCap = (plan: PlanId, band: number | null) => PLANS[plan].players ?? band ?? 150;
export const leagueCap = (plan: PlanId) => PLANS[plan].leagues;

// Lazy, time based status changes (store renewals, trial end, grace period). Returns the sub as of `now`.
export function advance(sub: Sub, now = Date.now()): Sub {
  const s = { ...sub };
  const len = (p: Period) => (p === 'yearly' ? 365 : 30) * DAY;
  if (s.status === 'trial' && s.trial_ends_at && now >= Date.parse(s.trial_ends_at)) s.status = 'active';
  if (s.status === 'billing_issue' && s.grace_ends_at && now >= Date.parse(s.grace_ends_at)) s.status = 'expired';
  if ((s.status === 'active' || s.status === 'ending') && now >= Date.parse(s.renews_at)) {
    if (s.status === 'ending') s.status = 'expired';
    else while (now >= Date.parse(s.renews_at)) s.renews_at = new Date(Date.parse(s.renews_at) + len(s.period)).toISOString();
  }
  return s;
}
export const entitled = (s: Sub | null | undefined) => !!s && ['trial', 'active', 'ending', 'billing_issue'].includes(s.status);
export const planOf = (s: Sub | null | undefined): PlanId => (entitled(s) ? s!.plan : 'free');
export const daysLeft = (iso: string | null | undefined, now = Date.now()) => (iso ? Math.max(0, Math.ceil((Date.parse(iso) - now) / DAY)) : 0);

export function newSub(p: Product, teamId: string, userId: string, trial: boolean, now = Date.now()): Sub {
  const start = new Date(now).toISOString();
  const trialEnd = trial ? new Date(now + TRIAL_DAYS * DAY).toISOString() : null;
  const firstCharge = trialEnd ?? start;
  const renews = trial ? firstCharge : new Date(now + (p.period === 'yearly' ? 365 : 30) * DAY).toISOString();
  return { team_id: teamId, plan: p.plan, period: p.period, band: p.band, product: p.id, status: trial ? 'trial' : 'active', started_at: start, renews_at: renews, trial_ends_at: trialEnd, paid_by: userId, store: 'app_store', price: p.price };
}

/* ---------- paywall reasons (B5.1 entry points) ---------- */
export type Reason = 'seats' | 'leagues' | 'kiosk' | 'seasons' | 'history' | 'cardart' | 'export' | 'readonly' | 'pass' | 'trial_end' | 'compare';
export function reasonCopy(reason: string | undefined, team: string, used?: { players: number; cap: number }): { title: string; body: string; min: Exclude<PlanId, 'free'>; feature: string } {
  const full = used ? `${used.players} of ${used.cap}` : 'full';
  switch (reason) {
    case 'seats': return { title: 'Make room for everyone', body: used && used.players < used.cap ? `${full} spots taken. A bigger plan lets everyone play.` : `Your league is full, ${full}. A bigger plan lets everyone play.`, min: 'team', feature: 'More players' };
    case 'readonly': return { title: 'Make room for everyone', body: `${team} is over the plan limit, so some players can only watch. Upgrade and everyone logs again.`, min: 'team', feature: 'More players' };
    case 'leagues': return { title: 'Add another league', body: 'Free has one league per team. Team gives you three, Club any number.', min: 'team', feature: 'More leagues' };
    case 'kiosk': return { title: 'Kiosk mode is part of Club', body: 'Put a shared tablet next to the table and let anyone log a match.', min: 'club', feature: 'Kiosk mode' };
    case 'seasons': return { title: 'Seasons are part of Team', body: 'Quarterly races with a fresh start and a wrap story.', min: 'team', feature: 'Seasons' };
    case 'history': return { title: 'Season history is part of Team', body: 'Every past season, its champions and the all time table.', min: 'team', feature: 'Season history' };
    case 'cardart': return { title: 'Custom card art is part of Club', body: 'Your own artwork on every player card.', min: 'club', feature: 'Custom card art' };
    case 'export': return { title: 'Export is part of Club', body: 'Every match and rating as a CSV file.', min: 'club', feature: 'CSV export' };
    case 'pass': return { title: 'The Pro track is part of Team', body: 'Extra frames and titles on the season pass. Cosmetics only, never coins or packs.', min: 'team', feature: 'Pro track' };
    case 'trial_end': return { title: `Keep the good stuff for ${team}`, body: 'Your trial is ending. Pick a plan or stay on Free, nothing is lost.', min: 'team', feature: 'Your plan' };
    default: return { title: `Plans for ${team}`, body: 'Start free. Upgrade when your crew grows.', min: 'team', feature: 'Your plan' };
  }
}

// Status card copy (B5.6).
export function statusLine(s: Sub | null, teamName: string, now = Date.now()): { title: string; body: string; tone: 'win' | 'warning' | 'neutral' | 'brand'; label: string } {
  if (!s || s.status === 'expired') return { title: 'Free', body: s ? `${teamName} is back on Free. Nothing was deleted.` : `${teamName} is on Free.`, tone: 'neutral', label: s ? 'Expired' : 'Free' };
  const name = PLANS[s.plan].name;
  const per = s.period === 'yearly' ? 'yearly' : 'monthly';
  switch (s.status) {
    case 'pending': return { title: name, body: `Waiting for approval. We'll unlock ${name} when it comes through.`, tone: 'warning', label: 'Waiting' };
    case 'trial': return { title: `${name} trial`, body: `${daysLeft(s.trial_ends_at, now)} of ${TRIAL_DAYS} days left. First charge ${shortDate(s.trial_ends_at!)}.`, tone: 'brand', label: 'Trial' };
    case 'ending': return { title: name, body: `Auto renew is off. ${name} until ${longDate(s.renews_at)}, Free after that.`, tone: 'warning', label: 'Ending' };
    case 'billing_issue': return { title: name, body: `Payment didn't go through. ${name} stays on for ${daysLeft(s.grace_ends_at, now)} more days.`, tone: 'warning', label: 'Payment issue' };
    default: return { title: name, body: `Renews on ${longDate(s.renews_at)}, ${euro(s.price)} ${per}.`, tone: 'win', label: 'Active' };
  }
}

/* ---------- limits (B5.7) ---------- */
// Who stays active when a team is over its cap: the most recently active players. Nothing is deleted.
export function readOnlyIds(players: { id: string; last_played_at: string | null }[], cap: number): Set<string> {
  if (players.length <= cap) return new Set();
  const sorted = [...players].sort((a, b) => (b.last_played_at ?? '').localeCompare(a.last_played_at ?? ''));
  return new Set(sorted.slice(cap).map((p) => p.id));
}

/* ---------- promo codes (B5.12, server codes only in this build) ---------- */
export const PROMOS: Record<string, { plan: Exclude<PlanId, 'free'>; days: number; ends: string }> = {
  OFFICE20: { plan: 'team', days: 30, ends: '2027-06-30' },
  CLUB30: { plan: 'club', days: 30, ends: '2027-06-30' },
  SUMMER25: { plan: 'team', days: 30, ends: '2025-06-30' },
};
