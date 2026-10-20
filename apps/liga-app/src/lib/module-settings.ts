// B4.4 Modules, B4.4.2 Needs another module, A8.3 setups: league.modules writes with dependencies.
import { ApiError, db, save, wait, type User } from '@/lib/api';
import { notify } from '@/lib/engine';
import { isOn, MODULES, type ModuleId } from '@/lib/modules';
import type { League } from '@/lib/types';

type L = Pick<League, 'template' | 'modules'> | null | undefined;
export type SetupId = 'ladder' | 'club' | 'office' | 'full';
export const SETUPS: { id: SetupId; label: string; body: string }[] = [
  { id: 'ladder', label: 'Just the ladder', body: 'Log, rate, done.' },
  { id: 'club', label: 'Club', body: 'Seasons, weekly cup, titles and rivalries.' },
  { id: 'office', label: 'Office', body: 'Challenges, coins, cup and lunch rivalries.' },
  { id: 'full', label: 'Full party', body: 'Everything on.' },
];
export const setupOf = (id?: string) => SETUPS.find((s) => s.id === id) ?? SETUPS[2];
export const moduleOf = (id: ModuleId) => MODULES.find((m) => m.id === id)!;

/* ---------- pure ---------- */
export const stateOf = (l: L) => Object.fromEntries(MODULES.map((m) => [m.id, isOn(l, m.id)])) as Record<ModuleId, boolean>;
export const setupModules = (s: SetupId) => Object.fromEntries(MODULES.map((m) => [m.id, s === 'full' || isOn({ template: s }, m.id)])) as Record<ModuleId, boolean>;
export const isCustomised = (l: L) => { const a = stateOf(l), b = setupModules(setupOf(l?.template).id); return MODULES.some((m) => a[m.id] !== b[m.id]); };

// Everything a module needs, transitively.
export function needsOf(id: ModuleId, seen = new Set<ModuleId>()): ModuleId[] {
  for (const n of moduleOf(id).needs ?? []) if (!seen.has(n)) { seen.add(n); needsOf(n, seen); }
  return [...seen];
}
// Every module that needs this one, transitively.
export function dependantsOf(id: ModuleId): ModuleId[] {
  return MODULES.filter((m) => needsOf(m.id).includes(id)).map((m) => m.id);
}
// What a switch flip really changes: turning on also turns on missing needs, turning off also turns off dependants.
export function planToggle(l: L, id: ModuleId, on: boolean) {
  const s = stateOf(l);
  const extra = (on ? needsOf(id) : dependantsOf(id)).filter((x) => s[x] !== on);
  const changes = Object.fromEntries([id, ...extra].map((x) => [x, on])) as Partial<Record<ModuleId, boolean>>;
  return { changes, extra };
}
export const names = (ids: ModuleId[]) => {
  const l = ids.map((x) => moduleOf(x).label);
  return l.length < 2 ? l.join('') : `${l.slice(0, -1).join(', ')} and ${l[l.length - 1]}`;
};

/* ---------- writes ---------- */
async function adminLeague(user: User, leagueId: string) {
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId);
  const me = d.members.find((m) => m.league_id === leagueId && m.user_id === user.id);
  if (!l || !me || (me.role !== 'owner' && me.role !== 'admin')) throw new ApiError('not allowed');
  if (l.archived_at) throw new ApiError('league archived');
  const others = d.members.filter((m) => m.league_id === leagueId && !m.status && m.id !== me.id);
  const tell = (title: string, body: string) => others.forEach((m) => notify(d, { league_id: leagueId, member_id: m.id, kind: 'modules', title, body, href: '/league/modules' }));
  return { l, me, tell };
}

export async function setModules(user: User, leagueId: string, changes: Partial<Record<ModuleId, boolean>>) {
  await wait(150);
  const { l, me, tell } = await adminLeague(user, leagueId);
  l.modules = { ...l.modules, ...changes };
  const ids = Object.keys(changes) as ModuleId[];
  const on = ids.filter((x) => changes[x]), off = ids.filter((x) => !changes[x]);
  if (on.length) tell(`${names(on)} turned on`, `${me.display_name} turned on ${names(on)} for everyone.`);
  if (off.length) tell(`${names(off)} turned off`, `${me.display_name} turned off ${names(off)}. Nothing was deleted.`);
  await save();
}

export async function applySetupModules(user: User, leagueId: string, setup: SetupId) {
  await wait(200);
  const { l, me, tell } = await adminLeague(user, leagueId);
  l.template = setup;
  l.modules = setupModules(setup);
  tell('League setup changed', `${me.display_name} switched the league to ${setupOf(setup).label}. Nothing was deleted.`);
  await save();
}
