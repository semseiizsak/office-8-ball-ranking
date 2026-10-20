// Shop module (G7 Shop, G7.1 Pack details and drop rates, G7.2 Confirm purchase). Module id 'shop', needs 'coins'.
// Everything costs earned coins only; coins are never bought. No timers, no "sold out", no rotating stock,
// no bundle discounts: the same shelf every day. Packs need the Cards module and show their odds before buying.
import { db, save, wait, type User } from '@/lib/api';
import { balanceOf, credit, syncCoins } from '@/lib/coins';
import { cardsOn, cardStore, DAILY_PACKS, grantPack, PACK, packsBoughtToday, retroOpen, SHOP_PACKS, syncCards, type PackKind } from '@/lib/cards';
import { ApiError, uid, type DB } from '@/lib/engine';
import { isOn } from '@/lib/modules';

export type ItemKind = 'frame' | 'title' | 'back';
export type Item = { id: string; kind: ItemKind; name: string; price?: number; colour: string; pass?: boolean };
export const KIND_LABEL: Record<ItemKind, string> = { frame: 'Avatar frames', title: 'Titles', back: 'Card backs' };
export const DEFAULT_BACK = 'back_classic';

// Shop items have a price; pass items (pass: true) only come from the season pass Pro row.
export const ITEMS: Item[] = [
  { id: 'frame_bronze', kind: 'frame', name: 'Bronze frame', price: 150, colour: '#A8622C' },
  { id: 'frame_silver', kind: 'frame', name: 'Silver frame', price: 250, colour: '#C9CCD1' },
  { id: 'frame_gold', kind: 'frame', name: 'Gold frame', price: 400, colour: '#F2B705' },
  { id: 'frame_violet', kind: 'frame', name: 'Violet frame', price: 600, colour: '#5B3DF5' },
  { id: 'frame_court', kind: 'frame', name: 'Court frame', colour: '#0EA650', pass: true },
  { id: 'frame_ember', kind: 'frame', name: 'Ember frame', colour: '#E8601C', pass: true },
  { id: 'frame_ice', kind: 'frame', name: 'Ice frame', colour: '#7D97F0', pass: true },
  { id: 'frame_crown', kind: 'frame', name: 'Crown frame', colour: '#FFFFFF', pass: true },
  { id: 'frame_royal', kind: 'frame', name: 'Royal frame', colour: '#1F3FA3', pass: true },
  { id: 'frame_maroon', kind: 'frame', name: 'Maroon frame', colour: '#7A1F2B', pass: true },
  { id: 'frame_red', kind: 'frame', name: 'Red frame', colour: '#C8102E', pass: true },
  { id: 'title_boss', kind: 'title', name: 'Table Boss', price: 300, colour: '#5B3DF5' },
  { id: 'title_owl', kind: 'title', name: 'Night Owl', price: 200, colour: '#5B3DF5' },
  { id: 'title_kid', kind: 'title', name: 'Comeback Kid', price: 200, colour: '#5B3DF5' },
  { id: 'title_regular', kind: 'title', name: 'Regular', colour: '#5B3DF5', pass: true },
  { id: 'title_grinder', kind: 'title', name: 'Grinder', colour: '#5B3DF5', pass: true },
  { id: 'title_finisher', kind: 'title', name: 'Season Finisher', colour: '#5B3DF5', pass: true },
  { id: 'title_king', kind: 'title', name: 'King', colour: '#5B3DF5', pass: true },
  { id: 'title_clutch', kind: 'title', name: 'Clutch', colour: '#5B3DF5', pass: true },
  { id: 'title_underdog', kind: 'title', name: 'Underdog', colour: '#5B3DF5', pass: true },
  { id: DEFAULT_BACK, kind: 'back', name: 'Classic', colour: '#5B3DF5' },
  { id: 'back_midnight', kind: 'back', name: 'Midnight', price: 150, colour: '#0A0A0A' },
  { id: 'back_court', kind: 'back', name: 'Court', price: 250, colour: '#146B3A' },
  { id: 'back_royal', kind: 'back', name: 'Royal', price: 400, colour: '#1F3FA3' },
  { id: 'back_maroon', kind: 'back', name: 'Maroon', colour: '#7A1F2B', pass: true },
  { id: 'back_gold', kind: 'back', name: 'Gold', colour: '#F2B705', pass: true },
  { id: 'back_ember', kind: 'back', name: 'Ember', colour: '#E8601C', pass: true },
  { id: 'back_ice', kind: 'back', name: 'Ice', colour: '#7D97F0', pass: true },
  { id: 'back_purple', kind: 'back', name: 'Purple', colour: '#4B2A7B', pass: true },
];
export const ITEM = new Map(ITEMS.map((i) => [i.id, i]));

export type ShopStore = { owned: Record<string, string[]>; equipped: Record<string, Partial<Record<ItemKind, string>>> };
export const shopStore = (d: DB): ShopStore => { const s = (d.shop as ShopStore | undefined) ?? { owned: {}, equipped: {} }; d.shop = s; return s; };
const mk = (leagueId: string, memberId: string) => `${leagueId}|${memberId}`;
export const ownsItem = (d: DB, leagueId: string, memberId: string, id: string) => id === DEFAULT_BACK || (shopStore(d).owned[mk(leagueId, memberId)] ?? []).includes(id);
// Pass rewards land here too (pass.ts).
export function giveItem(d: DB, leagueId: string, memberId: string, id: string) {
  const s = shopStore(d), list = (s.owned[mk(leagueId, memberId)] ??= []);
  if (!list.includes(id)) list.push(id);
}

export type Looks = { frame: string | null; title: string | null; back: string };
// What a member wears: equipped frame colour, title and card back colour.
export function looksOf(d: DB, leagueId: string, memberId: string): Looks {
  const e = shopStore(d).equipped[mk(leagueId, memberId)] ?? {};
  return { frame: e.frame ? ITEM.get(e.frame)?.colour ?? null : null, title: e.title ? ITEM.get(e.title)?.name ?? null : null, back: ITEM.get(e.back ?? DEFAULT_BACK)?.colour ?? '#5B3DF5' };
}
export async function looks(leagueId: string, memberId: string) { return looksOf(await db(), leagueId, memberId); }

const meIn = (d: DB, leagueId: string, user: User) => d.members.find((m) => m.league_id === leagueId && m.user_id === user.id && !m.status);
const shopOn = (l: Parameters<typeof isOn>[0]) => isOn(l, 'coins') && isOn(l, 'shop');

export type ShelfPack = { kind: PackKind; name: string; body: string; price: number; open: boolean };
export type Shelf = {
  on: boolean; guest: boolean; balance: number; packs: ShelfPack[]; packsLeft: number;
  items: (Item & { owned: boolean; equipped: boolean })[]; looks: Looks;
};
export async function shelf(user: User, leagueId: string): Promise<Shelf> {
  await wait(80);
  const d = await db();
  const l = d.leagues.find((x) => x.id === leagueId), me = meIn(d, leagueId, user);
  const off: Shelf = { on: false, guest: false, balance: 0, packs: [], packsLeft: 0, items: [], looks: { frame: null, title: null, back: '#5B3DF5' } };
  if (!l || !me || !shopOn(l)) return off;
  let changed = syncCoins(d, leagueId);
  if (cardsOn(l)) changed = syncCards(d, leagueId) || changed;
  if (changed) await save();
  const eq = shopStore(d).equipped[mk(leagueId, me.id)] ?? {};
  return {
    on: true, guest: !!me.guest, balance: balanceOf(d, leagueId, me.id),
    packs: cardsOn(l) ? SHOP_PACKS.map((k) => ({ kind: k, name: PACK[k].name, body: PACK[k].body, price: PACK[k].price!, open: k !== 'retro' || retroOpen(l) })) : [],
    packsLeft: Math.max(0, DAILY_PACKS - packsBoughtToday(d, leagueId, me.id)),
    items: ITEMS.filter((i) => i.price || ownsItem(d, leagueId, me.id, i.id)).map((i) => ({ ...i, owned: ownsItem(d, leagueId, me.id, i.id), equipped: (eq[i.kind] ?? (i.kind === 'back' ? DEFAULT_BACK : null)) === i.id })),
    looks: looksOf(d, leagueId, me.id),
  };
}

// The one place the shop takes coins: checks the balance first, writes one negative ledger row.
function spend(d: DB, leagueId: string, memberId: string, amount: number, label: string, ref: string) {
  syncCoins(d, leagueId);
  if (balanceOf(d, leagueId, memberId) < amount) throw new ApiError('Not enough coins');
  credit(d, { league_id: leagueId, member_id: memberId, amount: -amount, reason: 'shop', label, ref, href: '/shop' });
}
function buyer(d: DB, leagueId: string, user: User) {
  const l = d.leagues.find((x) => x.id === leagueId), me = meIn(d, leagueId, user);
  if (!l || !me || !shopOn(l)) throw new ApiError('shop off');
  if (me.guest) throw new ApiError('Guests can’t buy');
  return { l, me };
}

export async function buyItem(user: User, leagueId: string, id: string) {
  await wait(250);
  const d = await db();
  const { me } = buyer(d, leagueId, user);
  const item = ITEM.get(id);
  if (!item?.price) throw new ApiError('not for sale');
  if (ownsItem(d, leagueId, me.id, id)) throw new ApiError('You already own this');
  spend(d, leagueId, me.id, item.price, `Bought ${item.name}`, `shop:${id}:${uid()}`);
  giveItem(d, leagueId, me.id, id);
  shopStore(d).equipped[mk(leagueId, me.id)] = { ...shopStore(d).equipped[mk(leagueId, me.id)], [item.kind]: id };
  await save();
}

export async function buyPack(user: User, leagueId: string, kind: PackKind) {
  await wait(250);
  const d = await db();
  const { l, me } = buyer(d, leagueId, user);
  const p = PACK[kind];
  if (!cardsOn(l) || !p.price) throw new ApiError('not for sale');
  if (kind === 'retro' && !retroOpen(l)) throw new ApiError('Retro packs open after the first season');
  if (packsBoughtToday(d, leagueId, me.id) >= DAILY_PACKS) throw new ApiError(`Up to ${DAILY_PACKS} packs a day`);
  const ref = `shop:${kind}:${uid()}`;
  spend(d, leagueId, me.id, p.price, `Bought a ${p.name}`, ref);
  const pack = grantPack(d, leagueId, me.id, kind, 'Bought in the shop', ref)!;
  await save();
  return pack.id;
}

export async function equip(user: User, leagueId: string, kind: ItemKind, id: string | null) {
  const d = await db();
  const me = meIn(d, leagueId, user);
  if (!me) throw new ApiError('not a member');
  if (id && (!ownsItem(d, leagueId, me.id, id) || ITEM.get(id)?.kind !== kind)) throw new ApiError('not yours');
  const s = shopStore(d);
  s.equipped[mk(leagueId, me.id)] = { ...s.equipped[mk(leagueId, me.id)], [kind]: id ?? undefined };
  await save();
}

export const unopened = (d: DB, leagueId: string, memberId: string) => cardStore(d).packs.filter((p) => p.league_id === leagueId && p.member_id === memberId && !p.opened_at).length;
