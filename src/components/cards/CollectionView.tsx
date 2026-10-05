import React, { useMemo, useState } from 'react';
import { ArrowLeftRight, ShoppingBag, SlidersHorizontal, X } from 'lucide-react';
import { MatchRecord, Player } from '../../types';
import { Card, CardType, Collector, DUPLICATE_CHIPS, LEGENDARY_PITY, Pack, RARITIES, Rarity, SHOP_LABEL, SHOP_PRICE, ShopTier, TYPE_LABEL, Trade, albumSize, designKey, weekKeyOf, winsThisWeek } from '../../utils/cards';
import { Coin, PlayerAvatar, Sheet } from '../ui';
import { PlayerCard } from './PlayerCard';
import { PackOpening } from './PackOpening';
import { TradeBuilder } from './TradeBuilder';

interface CollectionViewProps {
  players: Player[];
  currentPlayer: Player;
  cards: Card[];
  packs: Pack[];
  collectors: Collector[];
  trades: Trade[];
  matches: MatchRecord[];
  now: number;
  /** Why this week's earned pack was earned, or null while it is not. */
  earned: { reason: string } | null;
  onOpenPack: (packId: string) => Promise<Card[]>;
  /** The viewer's coin stack, what the shop takes from. */
  coins: number;
  /** Seasons that have closed: each has its own retro pack in the shop. */
  closedSeasons: Array<{ id: string; name: string }>;
  onBuyPack: (tier: ShopTier, seasonId: string) => Promise<void>;
  onCashIn: (cardId: string) => Promise<number>;
  onOfferTrade: (toId: string, give: string[], want: string[], note?: string) => Promise<void>;
  onRespondTrade: (tradeId: string, answer: 'accept' | 'decline' | 'cancel') => Promise<void>;
  /** Every season is its own set; oldest first, the current one last. */
  seasons: Array<{ id: string; name: string }>;
  currentSeasonId: string;
}

const TYPES: CardType[] = ['player', 'season', 'crown', 'cup', 'totw', 'clown', 'moment', 'rivalry'];
const SOURCE: Record<Card['source'], string> = { pack: 'Pulled from a pack', award: 'Earned on the table', trade: 'Came in a trade' };
const chip = (on: boolean) =>
  `press h-8 flex-none rounded-full px-3 text-[10px] font-extrabold uppercase tracking-[0.1em] transition-colors duration-200 ease-[var(--ease)] ${on ? 'bg-white text-bg' : 'bg-surface-alt text-white'}`;
const button = 'press h-11 rounded-full px-4 text-[12px] font-extrabold uppercase tracking-[0.06em]';

/**
 * The Collection tab: your packs, progress to the next, and the album. Every
 * player at every rarity is a slot; duplicates count up; specials sit below.
 * Anyone's album can be browsed, and any card asked for in a trade.
 */
export const CollectionView: React.FC<CollectionViewProps> = ({
  players,
  currentPlayer,
  cards,
  packs,
  collectors,
  trades,
  matches,
  now,
  earned,
  onOpenPack,
  coins,
  closedSeasons,
  onBuyPack,
  onCashIn,
  onOfferTrade,
  onRespondTrade,
  seasons,
  currentSeasonId,
}) => {
  const byId = useMemo(() => new Map(players.map((player) => [player.id, player])), [players]);
  const cardById = useMemo(() => new Map(cards.map((card) => [card.id, card])), [cards]);
  const [viewId, setViewId] = useState(currentPlayer.id);
  const [rarity, setRarity] = useState<Rarity | 'all'>('all');
  const [type, setType] = useState<CardType | 'all'>('all');
  const [seasonId, setSeasonId] = useState(currentSeasonId);
  const [openCard, setOpenCard] = useState<Card | null>(null);
  const [confirmCash, setConfirmCash] = useState(false);
  const [cashing, setCashing] = useState(false);
  const [sheetError, setSheetError] = useState('');
  const [tradeError, setTradeError] = useState<Record<string, string>>({});
  const [builder, setBuilder] = useState<{ toId?: string; give?: string[]; want?: string[]; gift?: boolean } | null>(null);
  const [opening, setOpening] = useState<Pack | null>(null);
  /** The shop offer waiting for a second tap, and any error from buying. */
  const [confirmBuy, setConfirmBuy] = useState<string | null>(null);
  const [buying, setBuying] = useState(false);
  const [buyError, setBuyError] = useState('');
  /** The shop, trades and album filters each open on their own sheet. */
  const [panel, setPanel] = useState<'shop' | 'trades' | 'filters' | null>(null);

  const me = currentPlayer.id;
  const mine = cards.filter((card) => card.ownerId === me);
  // The album shows one season's set at a time; trades and counts use every card.
  const viewed = cards.filter((card) => card.ownerId === viewId && card.seasonId === seasonId);
  const owned = new Set(mine.filter((card) => card.type === 'player' && card.seasonId === currentSeasonId).map(designKey));
  const total = albumSize(players.length);
  const collector = collectors.find((entry) => entry.id === me);
  const week = weekKeyOf(now);
  // Reward and bought packs keep until opened; the others only last their week.
  const openable = packs.filter((pack) => pack.ownerId === me && !pack.openedAt && (pack.kind === 'reward' || pack.kind === 'bought' || pack.week === week));
  const currentSeasonName = seasons.find((entry) => entry.id === currentSeasonId)?.name ?? 'this season';
  const offers: Array<{ key: string; tier: ShopTier; seasonId: string; name: string; line: string }> = [
    { key: 'standard', tier: 'standard', seasonId: currentSeasonId, name: SHOP_LABEL.standard, line: `Three cards from ${currentSeasonName}.` },
    { key: 'premium', tier: 'premium', seasonId: currentSeasonId, name: SHOP_LABEL.premium, line: `Three cards from ${currentSeasonName}, one of them epic or better.` },
    ...closedSeasons.map((season) => ({ key: `retro-${season.id}`, tier: 'retro' as ShopTier, seasonId: season.id, name: `${SHOP_LABEL.retro}, ${season.name}`, line: `Three cards from the ${season.name} set, at the ratings it closed on.` })),
  ];
  const buy = async (offer: (typeof offers)[number]) => {
    if (confirmBuy !== offer.key) {
      setConfirmBuy(offer.key);
      setBuyError('');
      return;
    }
    setBuying(true);
    setBuyError('');
    try {
      await onBuyPack(offer.tier, offer.seasonId);
      setConfirmBuy(null);
    } catch (reason) {
      setBuyError(reason instanceof Error ? reason.message : 'Could not buy it.');
    } finally {
      setBuying(false);
    }
  };
  const earnedPack = packs.some((pack) => pack.ownerId === me && pack.week === week && pack.kind === 'earned');
  const wins = Math.min(5, winsThisWeek(me, matches, now));
  const isMine = viewId === me;

  // Every design the viewed player holds, with how many of it.
  const groups = new Map<string, Card[]>();
  for (const card of viewed) groups.set(designKey(card), [...(groups.get(designKey(card)) ?? []), card]);
  const specials = [...groups.values()].filter((list) => list[0].type !== 'player' && (type === 'all' || type === list[0].type) && (rarity === 'all' || rarity === list[0].rarity));

  const closeSheet = () => {
    setOpenCard(null);
    setConfirmCash(false);
    setSheetError('');
  };
  const cashIn = async (card: Card) => {
    setCashing(true);
    setSheetError('');
    try {
      await onCashIn(card.id);
      closeSheet();
    } catch (reason) {
      setSheetError(reason instanceof Error ? reason.message : 'Could not cash it in.');
    } finally {
      setCashing(false);
    }
  };
  const respond = async (trade: Trade, answer: 'accept' | 'decline' | 'cancel') => {
    setTradeError((prev) => ({ ...prev, [trade.id]: '' }));
    try {
      await onRespondTrade(trade.id, answer);
    } catch (reason) {
      setTradeError((prev) => ({ ...prev, [trade.id]: reason instanceof Error ? reason.message : 'That did not work.' }));
    }
  };

  const mini = (card: Card, count = 1) => (
    <button key={card.id} type="button" onClick={() => setOpenCard(card)} className="press relative block w-full" aria-label={`Open ${byId.get(card.playerId)?.name ?? 'card'}, ${card.rarity}${count > 1 ? `, ${count} of them` : ''}`}>
      <PlayerCard card={card} player={byId.get(card.playerId)} other={card.otherId ? byId.get(card.otherId) : null} size="mini" />
      {count > 1 && <span className="absolute -right-1 -top-1 rounded-full bg-white px-1.5 text-[10px] font-black leading-[16px] tabular-nums text-bg">x{count}</span>}
    </button>
  );
  const tradeSide = (ids: string[]) =>
    ids.length === 0 ? (
      <span className="text-xs font-semibold text-white/55">Nothing back</span>
    ) : (
      <div className="flex flex-wrap gap-1.5">
        {ids.map((id) => {
          const card = cardById.get(id);
          return card ? (
            <span key={id} className="w-10">
              <PlayerCard card={card} player={byId.get(card.playerId)} other={card.otherId ? byId.get(card.otherId) : null} size="mini" />
            </span>
          ) : (
            <span key={id} className="pc-empty block w-10" />
          );
        })}
      </div>
    );
  const tradeRow = (trade: Trade, actions: React.ReactNode) => {
    const incoming = trade.toId === me;
    const other = byId.get(incoming ? trade.fromId : trade.toId);
    return (
      <div key={trade.id} className="grid gap-3 rounded-2xl bg-surface p-3">
        <div className="flex items-center gap-2">
          <PlayerAvatar player={other} size={28} />
          <span className="min-w-0 flex-1 truncate text-sm font-bold">
            {incoming ? `${other?.name.split(' ')[0] ?? 'Someone'} offers` : `To ${other?.name.split(' ')[0] ?? 'someone'}`}
          </span>
          {trade.status !== 'pending' && <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55">{trade.status}</span>}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="grid content-start gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55">{incoming ? 'You get' : 'You give'}</span>
            {tradeSide(trade.give)}
          </div>
          <div className="grid content-start gap-1.5">
            <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55">{incoming ? 'You give' : 'You get'}</span>
            {tradeSide(trade.want)}
          </div>
        </div>
        {trade.note && <p className="text-sm font-semibold text-white/70">{trade.note}</p>}
        {tradeError[trade.id] && <p role="alert" className="rounded-xl bg-live p-2.5 text-sm font-semibold text-white">{tradeError[trade.id]}</p>}
        {actions}
      </div>
    );
  };

  const incoming = trades.filter((trade) => trade.toId === me && trade.status === 'pending');
  const outgoing = trades.filter((trade) => trade.fromId === me && trade.status === 'pending');
  const history = trades
    .filter((trade) => (trade.toId === me || trade.fromId === me) && trade.status !== 'pending')
    .sort((a, b) => (b.respondedAt ?? b.createdAt) - (a.respondedAt ?? a.createdAt))
    .slice(0, 5);
  const viewedPlayer = byId.get(viewId);

  return (
    <div className="stagger grid gap-4 pb-28 pt-1">
      <section className="grid gap-3 rounded-3xl bg-card p-4">
        <div className="flex items-end justify-between gap-3">
          <span className="font-display text-[40px] font-extrabold leading-none tabular-nums">
            {owned.size}
            <span className="text-xl text-white/55"> of {total}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <button type="button" onClick={() => setPanel('shop')} aria-label={`Pack shop, ${coins} coins`} className="press flex h-11 items-center gap-1.5 rounded-full bg-surface-alt pl-3 pr-3.5 text-sm font-black tabular-nums">
              <ShoppingBag className="h-[18px] w-[18px]" strokeWidth={2.25} />
              <Coin size={16} />
              {coins}
            </button>
            <button type="button" onClick={() => setPanel('trades')} aria-label={incoming.length ? `Trades, ${incoming.length} waiting` : 'Trades'} className="press relative grid h-11 w-11 place-items-center rounded-full bg-surface-alt">
              <ArrowLeftRight className="h-[18px] w-[18px]" strokeWidth={2.25} />
              {incoming.length > 0 && (
                <span className="absolute right-0.5 top-0.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-live px-1 text-[10px] font-black tabular-nums text-white">{incoming.length}</span>
              )}
            </button>
          </span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-surface-alt">
          <div className="grow-x h-full rounded-full bg-crown" style={{ width: `${total ? (owned.size / total) * 100 : 0}%` }} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="grid gap-1 rounded-xl bg-surface p-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Cards</span>
            <span className="text-2xl font-black leading-none tabular-nums">{mine.length}</span>
          </div>
          <div className="grid gap-1 rounded-xl bg-surface p-3">
            <span className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Coins cashed in</span>
            <span className="text-2xl font-black leading-none tabular-nums">{collector?.duplicateChips ?? 0}</span>
          </div>
        </div>
        {/* The week's earned pack, folded in: one line, one bar, the pity count beside it. */}
        <div className="grid gap-1.5 rounded-xl bg-surface p-3">
          <div className="flex items-center justify-between gap-3">
            <span className="text-sm font-extrabold">Earned pack</span>
            <span className="text-xs font-bold tabular-nums text-white/55">
              {earned || earnedPack ? 'Earned this week' : `${wins} of 5 wins`}, pity {collector?.pity ?? 0} of {LEGENDARY_PITY}
            </span>
          </div>
          {!(earned || earnedPack) && (
            <div className="h-1.5 overflow-hidden rounded-full bg-surface-alt">
              <div className="grow-x h-full rounded-full bg-felt" style={{ width: `${(wins / 5) * 100}%` }} />
            </div>
          )}
          <p className="text-xs font-semibold text-white/55">
            {earned ? `${earned.reason}. One extra pack a week.` : 'Five wins this week, a new achievement tier, or the match of the day three days running.'}
          </p>
        </div>
      </section>

      {openable.map((pack) => (
        <section key={pack.id} className="grid grid-cols-[96px_1fr] items-center gap-4 rounded-3xl bg-card p-4 shadow-[inset_0_0_0_1.5px_#F2B705]">
          <div className={`pk ${pack.kind} ${pack.tier ?? ''} h-[132px] w-[96px]`}>
            <span className={`relative z-10 font-display text-[40px] font-extrabold ${pack.tier === 'premium' || pack.tier === 'retro' || pack.kind === 'champion' ? 'text-white' : 'text-bg'}`}>8</span>
          </div>
          <div className="grid min-w-0 content-center gap-2">
            <h2 className="text-xl">{pack.kind === 'bought' ? SHOP_LABEL[pack.tier ?? 'standard'] : pack.kind === 'reward' ? (pack.minRarity ? `${pack.minRarity[0].toUpperCase()}${pack.minRarity.slice(1)} pack` : 'Reward pack') : pack.kind === 'champion' ? 'Champion pack' : pack.kind === 'earned' ? 'Earned pack' : 'Weekly pack'}</h2>
            <p className="text-sm font-semibold text-white/70">{pack.reason ?? 'Three cards. Open it this week or it is gone.'}</p>
            <button type="button" onClick={() => setOpening(pack)} className={`${button} w-fit bg-white text-bg`}>
              Open
            </button>
          </div>
        </section>
      ))}

      <section className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-xl">{isMine ? 'Your album' : `${viewedPlayer?.name.split(' ')[0] ?? 'Their'} album`}</h2>
          {!isMine && (
            <button type="button" onClick={() => setViewId(me)} className={`${chip(false)}`}>
              Back to mine
            </button>
          )}
        </div>
        {/* One Filter button; whatever is narrowed shows as a chip that clears it. */}
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" onClick={() => setPanel('filters')} className={`${chip(false)} flex items-center gap-1.5`}>
            <SlidersHorizontal className="h-3.5 w-3.5" strokeWidth={2.5} />
            Filter
          </button>
          {seasonId !== currentSeasonId && (
            <button type="button" onClick={() => setSeasonId(currentSeasonId)} className={`${chip(true)} flex items-center gap-1`}>
              {seasons.find((entry) => entry.id === seasonId)?.name ?? 'Season'}
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
          )}
          {rarity !== 'all' && (
            <button type="button" onClick={() => setRarity('all')} className={`${chip(true)} flex items-center gap-1`}>
              {rarity}
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
          )}
          {type !== 'all' && (
            <button type="button" onClick={() => setType('all')} className={`${chip(true)} flex items-center gap-1`}>
              {type === 'player' ? 'Players' : TYPE_LABEL[type]}
              <X className="h-3 w-3" strokeWidth={3} />
            </button>
          )}
        </div>

        {(type === 'all' || type === 'player') &&
          players.map((player) => {
            const slots = RARITIES.filter((value) => rarity === 'all' || rarity === value);
            const have = RARITIES.filter((value) => groups.has(designKey({ type: 'player', playerId: player.id, rarity: value }))).length;
            return (
              <div key={player.id} className="grid gap-2">
                <div className="flex items-center gap-2">
                  <PlayerAvatar player={player} size={24} />
                  <span className="min-w-0 flex-1 truncate text-[12px] font-extrabold uppercase tracking-[0.12em] text-white/70">{player.name}</span>
                  <span className="text-[12px] font-extrabold tabular-nums text-white/55">
                    {have} of {RARITIES.length}
                  </span>
                </div>
                <div className="grid grid-cols-6 gap-1.5">
                  {slots.map((value) => {
                    const list = groups.get(designKey({ type: 'player', playerId: player.id, rarity: value }));
                    return list ? mini(list[0], list.length) : <span key={value} className="pc-empty block w-full" aria-label={`${value} missing`} />;
                  })}
                </div>
              </div>
            );
          })}

        {type !== 'player' && (
          <div className="grid gap-2">
            <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-white/70">Specials</span>
            {specials.length ? (
              <div className="grid grid-cols-6 gap-1.5">{specials.map((list) => mini(list[0], list.length))}</div>
            ) : (
              <p className="rounded-xl bg-surface p-3 text-sm font-semibold text-white/55">None yet. They come from the crown, the cup, awards and big moments.</p>
            )}
          </div>
        )}
      </section>

      {panel === 'shop' && (
        <Sheet
          title={
            <span className="flex items-center gap-2">
              Shop
              <span className="flex items-center gap-1.5 rounded-full bg-surface-alt px-3 py-1 text-sm font-black tabular-nums">
                <Coin size={16} />
                {coins}
              </span>
            </span>
          }
          label="Pack shop"
          onClose={() => setPanel(null)}
        >
          <div className="grid gap-3 pb-2">
          <p className="text-sm font-semibold text-white/70">Spend the coins you win calling matches. Bought packs keep until you open them.</p>
          {offers.map((offer) => {
            const price = SHOP_PRICE[offer.tier];
            const short = price - coins;
            const armed = confirmBuy === offer.key;
            return (
              <div key={offer.key} className="grid grid-cols-[48px_1fr_auto] items-center gap-3 rounded-2xl bg-surface p-3">
                <div className={`pk bought ${offer.tier} h-[66px] w-[48px]`}>
                  <span className={`relative z-10 font-display text-xl font-extrabold ${offer.tier === 'standard' ? 'text-bg' : 'text-white'}`}>8</span>
                </div>
                <div className="grid min-w-0 gap-0.5">
                  <span className="truncate text-sm font-extrabold">{offer.name}</span>
                  <span className="text-xs font-semibold text-white/55">{offer.line}</span>
                </div>
                <button
                  type="button"
                  disabled={short > 0 || buying}
                  onClick={() => void buy(offer)}
                  className={`${button} flex items-center gap-1.5 ${armed ? 'bg-felt text-white' : short > 0 ? 'bg-surface-alt text-white/40' : 'bg-white text-bg'}`}
                >
                  {armed ? (buying ? 'Buying' : 'Confirm') : (
                    <>
                      <Coin size={16} />
                      {price}
                    </>
                  )}
                </button>
              </div>
            );
          })}
          {buyError && <p role="alert" className="rounded-xl bg-live p-2.5 text-sm font-semibold text-white">{buyError}</p>}
          </div>
        </Sheet>
      )}

      {panel === 'filters' && (
        <Sheet title="Filter the album" onClose={() => setPanel(null)}>
          <div className="grid gap-3 pb-2">
        <div className="grid grid-cols-2 gap-2">
          {[
            {
              label: 'Album of',
              value: viewId,
              set: setViewId,
              options: players.map((player) => ({ value: player.id, label: player.id === me ? 'You' : player.name.split(' ')[0] })),
            },
            {
              label: 'Season',
              value: seasonId,
              set: setSeasonId,
              options: [...seasons].reverse().map((entry) => ({ value: entry.id, label: entry.id === currentSeasonId ? `${entry.name}, now` : entry.name })),
            },
            {
              label: 'Rarity',
              value: rarity,
              set: (value: string) => setRarity(value as Rarity | 'all'),
              options: (['all', ...RARITIES] as const).map((value) => ({ value, label: value === 'all' ? 'All rarities' : value[0].toUpperCase() + value.slice(1) })),
            },
            {
              label: 'Type',
              value: type,
              set: (value: string) => setType(value as CardType | 'all'),
              options: (['all', ...TYPES] as const).map((value) => ({ value, label: value === 'all' ? 'All types' : value === 'player' ? 'Players' : TYPE_LABEL[value] })),
            },
          ].map((filter) => (
            <label key={filter.label} className="grid min-w-0 gap-1">
              <span className="px-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-white/55">{filter.label}</span>
              <span className="relative block">
                <select
                  value={filter.value}
                  onChange={(event) => filter.set(event.target.value)}
                  className="h-11 w-full min-w-0 appearance-none truncate rounded-xl bg-surface pl-3 pr-8 text-sm font-bold text-white outline-none focus-visible:shadow-[inset_0_0_0_2px_#fff]"
                >
                  {filter.options.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
                <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/55">▾</span>
              </span>
            </label>
          ))}
        </div>

            <button type="button" onClick={() => setPanel(null)} className={`${button} bg-white text-bg`}>
              Show cards
            </button>
          </div>
        </Sheet>
      )}

      {panel === 'trades' && (
        <Sheet
          title="Trades"
          onClose={() => setPanel(null)}
          footer={
            <button type="button" onClick={() => { setPanel(null); setBuilder({}); }} className={`${button} w-full bg-white text-bg`}>
              New offer
            </button>
          }
        >
          <div className="grid gap-3 pb-2">
          {incoming.length + outgoing.length + history.length === 0 && (
            <p className="rounded-xl bg-surface p-3 text-sm font-semibold text-white/55">No trades yet. Open anyone's album to ask for a card.</p>
          )}
          {incoming.map((trade) =>
            tradeRow(
              trade,
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => respond(trade, 'decline')} className={`${button} bg-surface-alt text-white`}>
                  Decline
                </button>
                <button type="button" onClick={() => respond(trade, 'accept')} className={`${button} bg-felt text-white`}>
                  Accept
                </button>
              </div>
            )
          )}
          {outgoing.map((trade) =>
            tradeRow(
              trade,
              <button type="button" onClick={() => respond(trade, 'cancel')} className={`${button} bg-surface-alt text-white`}>
                Cancel offer
              </button>
            )
          )}
          {history.length > 0 && <span className="text-[12px] font-extrabold uppercase tracking-[0.12em] text-white/55">Recent</span>}
          {history.map((trade) => tradeRow(trade, null))}
          </div>
        </Sheet>
      )}

      {openCard && (
        <Sheet title={byId.get(openCard.playerId)?.name.split(' ')[0] ?? 'Card'} onClose={closeSheet}>
          <div className="grid justify-items-center py-2">
            <PlayerCard card={openCard} player={byId.get(openCard.playerId)} other={openCard.otherId ? byId.get(openCard.otherId) : null} size="full" />
          </div>
          <dl className="grid grid-cols-2 gap-2">
            <div className="grid gap-1 rounded-xl bg-surface p-3">
              <dt className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Serial</dt>
              <dd className="text-lg font-black tabular-nums">{openCard.rarity === 'mythic' ? '1 of 1' : `No ${openCard.serial}`}</dd>
            </div>
            <div className="grid gap-1 rounded-xl bg-surface p-3">
              <dt className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">Rarity</dt>
              <dd className="text-lg font-black capitalize">{openCard.rarity}</dd>
            </div>
            <div className="col-span-2 grid gap-1 rounded-xl bg-surface p-3">
              <dt className="text-[11px] font-extrabold uppercase tracking-[0.14em] text-white/55">How it came</dt>
              <dd className="text-sm font-semibold">
                {SOURCE[openCard.source]}, {new Date(openCard.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
              </dd>
              {openCard.note && <dd className="text-sm font-semibold text-white/70">{openCard.note}</dd>}
            </div>
          </dl>
          {sheetError && <p role="alert" className="rounded-xl bg-live p-3 text-sm font-semibold text-white">{sheetError}</p>}
          {openCard.ownerId === me ? (
            <div className="grid gap-2">
              {openCard.rarity !== 'mythic' &&
                (confirmCash ? (
                  <div className="grid gap-2 rounded-2xl bg-surface p-3">
                    <p className="text-sm font-semibold">
                      Cash it in for {DUPLICATE_CHIPS[openCard.rarity]} coins? The card is gone for good.
                    </p>
                    <div className="grid grid-cols-2 gap-2">
                      <button type="button" onClick={() => setConfirmCash(false)} className={`${button} bg-surface-alt text-white`}>
                        Keep it
                      </button>
                      <button type="button" disabled={cashing} onClick={() => cashIn(openCard)} className={`${button} bg-white text-bg disabled:opacity-40`}>
                        {cashing ? 'Cashing' : 'Cash in'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button type="button" onClick={() => setConfirmCash(true)} className={`${button} bg-surface-alt text-white`}>
                    Cash in for {DUPLICATE_CHIPS[openCard.rarity]} coins
                  </button>
                ))}
              <div className="grid gap-2">
                <button type="button" onClick={() => { setBuilder({ give: [openCard.id] }); closeSheet(); }} className={`${button} bg-white text-bg`}>
                  Offer in a trade
                </button>
                <button type="button" onClick={() => { setBuilder({ give: [openCard.id], gift: true }); closeSheet(); }} className={`${button} bg-surface-alt text-white`}>
                  Give to someone
                </button>
              </div>
            </div>
          ) : (
            <button type="button" onClick={() => { setBuilder({ toId: openCard.ownerId, want: [openCard.id] }); closeSheet(); }} className={`${button} bg-white text-bg`}>
              Ask for this card
            </button>
          )}
        </Sheet>
      )}

      {builder && <TradeBuilder me={currentPlayer} players={players} cards={cards} initial={builder} onSend={onOfferTrade} onClose={() => setBuilder(null)} />}
      {opening && <PackOpening pack={opening} players={players} onOpen={onOpenPack} onClose={() => setOpening(null)} />}
    </div>
  );
};
