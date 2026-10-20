// Shared pieces of the Cards, Shop and Pass modules (DS #collect): the collectible card in mini and full size,
// card back, pack art, bottom sheet, odds table, and the entry points on Arena and in the wallet.
import { router, useFocusEffect, type Href } from 'expo-router';
import { ChevronRight, Gift, Layers, Lock, Package, ShoppingBag, Ticket, type LucideIcon } from 'lucide-react-native';
import { useCallback, useState, type ReactNode } from 'react';
import { Modal, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';

import { cardsHub, RARITIES, RARITY_LABEL, TRADE_HOURS, type CardView, type Hub, type PackKind, type Rarity } from '@/lib/cards';
import { isOn } from '@/lib/modules';
import { chestState, passView, type ChestView, type PassView } from '@/lib/pass';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, font, playerColours, radius, space, useTheme } from '@/theme';
import { Button, Card, Icon, T } from '@/ui';

// The card keeps its own art direction in both themes: dark inside, the frame colour tells the rarity.
const INK = '#141414', BLACK = '#0A0A0A', WHITE = '#FFFFFF', SOFT = '#ADADAD';
export const FRAME: Record<Rarity, string> = { common: '#A8622C', uncommon: '#C9CCD1', rare: '#F2B705', epic: '#F2B705', legendary: '#F2B705', mythic: BLACK };
const RAINBOW = ['#F2B705', '#FF6B7D', '#7D97F0', '#5FCB8C'];
export const STAT_LABELS = ['Rating', 'Win rate', 'Form', 'Clutch', 'Best streak', 'Rival'] as const;

function Frame({ rarity, w, h, r, children }: { rarity: Rarity; w: number; h: number; r: number; children: ReactNode }) {
  const pad = Math.max(3, Math.round(w * 0.045));
  return (
    <View style={{ width: w, height: h, borderRadius: r, backgroundColor: FRAME[rarity], padding: pad, overflow: 'hidden' }}>
      {rarity === 'legendary' ? (
        <Svg width={w} height={h} style={{ position: 'absolute', left: 0, top: 0 }}>
          <Defs>
            <LinearGradient id="lg" x1="0" y1="0" x2="1" y2="1">
              {RAINBOW.map((c, i) => <Stop key={c} offset={i / (RAINBOW.length - 1)} stopColor={c} />)}
            </LinearGradient>
          </Defs>
          <Rect x={0} y={0} width={w} height={h} fill="url(#lg)" />
        </Svg>
      ) : null}
      <View style={{ flex: 1, borderRadius: r - pad / 2, overflow: 'hidden', backgroundColor: rarity === 'mythic' ? playerColours.ink : rarity === 'epic' ? BLACK : INK,
        borderWidth: rarity === 'epic' ? 1.5 : rarity === 'mythic' ? 2 : 0, borderColor: rarity === 'epic' ? FRAME.epic : WHITE }}>
        <View style={{ flex: 1, backgroundColor: rarity === 'mythic' ? '#5B3DF5' : 'transparent' }}>{children}</View>
      </View>
    </View>
  );
}

const face = (name: string, colour: CardView['colour'], size: number) => (
  <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: playerColours[colour] ?? playerColours.blue, padding: Math.max(2, size / 18) }}>
    <View style={{ flex: 1, borderRadius: size, backgroundColor: '#222222', alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontFamily: font.display, fontSize: size * 0.4, color: WHITE }}>{name.slice(0, 1).toUpperCase()}</Text>
    </View>
  </View>
);

// Mini card (album grid, pack summary) and full card (detail, reveal).
export function CollectCard({ card, w = 104, full, count }: { card: CardView; w?: number; full?: boolean; count?: number }) {
  const h = Math.round(w * 1.4), r = Math.round(w * 0.13);
  const big = full || w >= 200;
  const s = card.stats;
  const stats: [string, string][] = s ? [['Rating', String(s.rating)], ['Win rate', `${s.win}%`], ['Form', `${s.form}%`], ['Clutch', `${s.clutch}%`], ['Best streak', String(s.streak)], ['Rival', s.rival ?? 'None']] : [];
  return (
    <View accessible accessibilityLabel={`${card.name}, ${card.label}, rating ${card.ovr}${count && count > 1 ? `, you have ${count}` : ''}`}>
      <Frame rarity={card.rarity} w={w} h={h} r={r}>
        <View style={{ flex: 1, padding: big ? space[3] : 6, alignItems: 'center', justifyContent: 'space-between' }}>
          <View style={{ alignSelf: 'stretch', flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <Text style={{ fontFamily: font.heavy, fontSize: big ? 40 : w * 0.21, lineHeight: big ? 42 : w * 0.23, color: WHITE, fontVariant: ['tabular-nums'] }}>{card.ovr}</Text>
            {card.jersey ? <Text style={{ fontFamily: font.bold, fontSize: big ? 16 : w * 0.1, color: SOFT }}>{card.jersey}</Text> : null}
          </View>
          {face(card.name, card.colour, big ? w * 0.42 : w * 0.38)}
          <View style={{ alignItems: 'center', gap: big ? 4 : 2, alignSelf: 'stretch' }}>
            <Text numberOfLines={1} style={{ fontFamily: font.display, fontSize: big ? 26 : w * 0.11, color: WHITE, textTransform: 'uppercase', letterSpacing: -0.3 }}>{card.name}</Text>
            <Text numberOfLines={1} style={{ fontFamily: font.semibold, fontSize: big ? 14 : w * 0.085, color: card.rarity === 'mythic' ? WHITE : SOFT }}>{card.label}{big && card.set ? `, season ${card.set}` : ''}</Text>
            {big && stats.length ? (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignSelf: 'stretch', marginTop: space[2], rowGap: space[2] }}>
                {stats.map(([k, v]) => (
                  <View key={k} style={{ width: '33.3%', alignItems: 'center' }}>
                    <Text numberOfLines={1} style={{ fontFamily: font.bold, fontSize: 16, color: WHITE, fontVariant: ['tabular-nums'] }}>{v}</Text>
                    <Text numberOfLines={1} style={{ fontFamily: font.medium, fontSize: 11, color: card.rarity === 'mythic' ? WHITE : SOFT }}>{k}</Text>
                  </View>
                ))}
              </View>
            ) : null}
            {big && card.note ? <Text style={{ fontFamily: font.medium, fontSize: 13, color: WHITE, textAlign: 'center' }}>{card.note}</Text> : null}
          </View>
        </View>
      </Frame>
      {count && count > 1 ? (
        <View style={{ position: 'absolute', top: -6, right: -6, minWidth: 26, height: 22, borderRadius: 11, paddingHorizontal: 6, backgroundColor: WHITE, borderWidth: 2, borderColor: BLACK, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={{ fontFamily: font.bold, fontSize: 11, color: BLACK }}>×{count}</Text>
        </View>
      ) : null}
    </View>
  );
}

// A missing album slot: outline with the number.
export function MissingCard({ no, w = 104, name }: { no: number; w?: number; name?: string }) {
  const { t } = useTheme();
  return (
    <View accessible accessibilityLabel={`Number ${no}, not collected yet`} style={{ width: w, height: Math.round(w * 1.4), borderRadius: Math.round(w * 0.13), borderWidth: 2, borderColor: t.lineStrong, borderStyle: 'dashed', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
      <T v="number" c="text3">{no}</T>
      {name ? <T v="caption" c="text3" numberOfLines={1}>{name}</T> : null}
    </View>
  );
}

// Card back in the equipped colour, with the Liga mark.
export function CardBack({ colour, w = 104 }: { colour: string; w?: number }) {
  const h = Math.round(w * 1.4), r = Math.round(w * 0.13);
  const dark = colour === BLACK || colour === '#146B3A' || colour === '#1F3FA3' || colour === '#7A1F2B' || colour === '#4B2A7B' || colour === '#5B3DF5';
  const fg = dark ? WHITE : BLACK;
  return (
    <View style={{ width: w, height: h, borderRadius: r, backgroundColor: colour, borderWidth: colour === BLACK ? 1.5 : 0, borderColor: WHITE, alignItems: 'center', justifyContent: 'center' }}>
      <View style={{ width: w * 0.62, height: h * 0.62, borderRadius: r * 0.7, borderWidth: 2, borderColor: fg, alignItems: 'center', justifyContent: 'center' }}>
        <Icon as={Layers} size={w * 0.26} color={fg} />
      </View>
    </View>
  );
}

const PACK_COLOUR: Record<PackKind, string> = { player: '#5B3DF5', season: '#1F3FA3', retro: '#7A1F2B', legendary: '#0A0A0A', gold: '#F2B705' };
export function PackArt({ kind, w = 72, label }: { kind: PackKind; w?: number; label?: string }) {
  const bg = PACK_COLOUR[kind], fg = kind === 'gold' ? BLACK : WHITE;
  return (
    <View style={{ width: w, height: Math.round(w * 1.35), borderRadius: Math.round(w * 0.12), backgroundColor: bg, borderWidth: kind === 'legendary' ? 2 : 0, borderColor: '#F2B705', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 }}>
      <Icon as={Package} size={w * 0.36} color={kind === 'legendary' ? '#F2B705' : fg} />
      {label ? <Text numberOfLines={2} style={{ fontFamily: font.display, fontSize: Math.max(10, w * 0.11), color: fg, textTransform: 'uppercase', textAlign: 'center' }}>{label}</Text> : null}
    </View>
  );
}

// Bottom sheet used for confirm, redeem and reward previews.
export function Sheet({ open, onClose, children }: { open: boolean; onClose: () => void; children: ReactNode }) {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable accessibilityLabel="Close" onPress={onClose} style={{ flex: 1, backgroundColor: t.scrim }} />
      <View style={{ backgroundColor: t.overlay, borderTopLeftRadius: radius.lg, borderTopRightRadius: radius.lg, padding: space[4], paddingBottom: insets.bottom + space[4], gap: space[3] }}>
        <View style={{ alignSelf: 'center', width: 36, height: 5, borderRadius: 3, backgroundColor: t.lineStrong }} />
        {children}
      </View>
    </Modal>
  );
}

const pct = (x: number) => `${+(x * 100).toFixed(x >= 0.1 ? 1 : 2)}%`;
// G7.1 odds table: one column per slot group, every rarity listed.
export function OddsTable({ slots }: { slots: { label: string; odds: Record<Rarity, number> }[] }) {
  const { t } = useTheme();
  return (
    <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
      <View style={{ flexDirection: 'row', paddingHorizontal: space[4], paddingVertical: space[2], gap: space[2] }}>
        <T v="label" c="text2" style={{ flex: 1.2 }}>Rarity</T>
        {slots.map((s) => <T key={s.label} v="label" c="text2" style={{ flex: 1, textAlign: 'right' }}>{s.label}</T>)}
      </View>
      {RARITIES.map((r) => (
        <View key={r} style={{ flexDirection: 'row', alignItems: 'center', minHeight: 44, paddingHorizontal: space[4], gap: space[2], borderTopWidth: 1, borderTopColor: t.line }}>
          <View style={{ flex: 1.2, flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <View style={{ width: 12, height: 16, borderRadius: 3, backgroundColor: r === 'mythic' ? '#5B3DF5' : FRAME[r] }} />
            <T v="label">{RARITY_LABEL[r]}</T>
          </View>
          {slots.map((s) => <T key={s.label} v="label" style={{ flex: 1, textAlign: 'right', fontVariant: ['tabular-nums'] }}>{pct(s.odds[r])}</T>)}
        </View>
      ))}
    </View>
  );
}

function entry(icon: LucideIcon, title: string, body: string, href: Href, highlight: boolean, t: ReturnType<typeof useTheme>['t'], key: string) {
  return (
    <Card key={key} onPress={() => router.push(href)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
      <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: highlight ? t.brand : t.surface2, alignItems: 'center', justifyContent: 'center' }}>
        <Icon as={icon} size={22} color={highlight ? t.onBrand : t.text} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading">{title}</T>
        <T v="small" c="text2" numberOfLines={2}>{body}</T>
      </View>
      <Icon as={ChevronRight} size={18} color={t.text3} />
    </Card>
  );
}

// Arena entry (the tab bar is full): Cards row card, plus the season pass and the weekly chest when they have news.
export function CollectArena() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [hub, setHub] = useState<Hub | null>(null);
  const [pass, setPass] = useState<PassView | null>(null);
  const [chest, setChest] = useState<ChestView | null>(null);
  useFocusEffect(useCallback(() => {
    if (!session || !league) return;
    (async () => {
      const [h, p, c] = await Promise.all([
        isOn(league, 'cards') && isOn(league, 'coins') ? cardsHub(session.user, league.id) : null,
        isOn(league, 'pass') && isOn(league, 'seasons') ? passView(session.user, league.id) : null,
        isOn(league, 'quests') && isOn(league, 'coins') ? chestState(session.user, league.id) : null,
      ]);
      setHub(h); setPass(p); setChest(c);
    })();
  }, [session, league]));
  const rows: ReactNode[] = [];
  if (hub?.on && !hub.guest) {
    const n = hub.packs.length;
    rows.push(entry(Layers, 'Cards', n ? `${n === 1 ? 'A pack is' : `${n} packs are`} ready to open` : `Season ${hub.set} album, ${hub.got} of ${hub.total}`, '/cards' as Href, n > 0, t, 'cards'));
  }
  if (chest?.ready) rows.push(entry(Gift, 'Weekly chest ready', `You finished all three quests. ${chest.contents.join(', ')}.`, '/chest' as Href, true, t, 'chest'));
  if (pass?.on && !pass.guest && pass.season) rows.push(entry(Ticket, 'Season pass', pass.ready ? `${pass.ready} ${pass.ready === 1 ? 'reward' : 'rewards'} ready to claim` : `Tier ${pass.tier} of 30`, '/pass' as Href, pass.ready > 0, t, 'pass'));
  if (!rows.length) return null;
  return <View style={{ gap: space[2] }}>{rows}</View>;
}

// Wallet entry to the shop.
export function ShopEntry() {
  const { t } = useTheme();
  const { league } = useLeague();
  if (!isOn(league, 'shop') || !isOn(league, 'coins')) return null;
  return entry(ShoppingBag, 'Shop', isOn(league, 'cards') ? 'Packs, frames, titles and card backs' : 'Frames, titles and card backs', '/shop' as Href, false, t, 'shop');
}

// G7.2 Confirm purchase: item, price, balance before and after. After a pack: Open now or Later.
export function BuySheet({ item, price, balance, busy, error, bought, onBuy, onClose, onOpen }: {
  item: string | null; price: number; balance: number; busy: boolean; error: boolean; bought: boolean;
  onBuy: () => void; onClose: () => void; onOpen?: () => void;
}) {
  return (
    <Sheet open={!!item} onClose={onClose}>
      {bought ? (
        <>
          <T v="section" center>{item} is yours</T>
          {onOpen ? (
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button label="Later" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
              <Button label="Open now" style={{ flex: 1 }} onPress={onOpen} />
            </View>
          ) : <Button label="Done" full onPress={onClose} />}
        </>
      ) : (
        <>
          <T v="section" center>{item}</T>
          <T v="body" c="text2" center>{fmt(balance)} to {fmt(balance - price)} coins</T>
          {error ? <T v="small" c="text2" center>Couldn’t buy. No coins were taken.</T> : null}
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={onClose} />
            <Button label={`Buy for ${fmt(price)}`} style={{ flex: 1 }} loading={busy} onPress={onBuy} />
          </View>
          <T v="caption" c="text3" center>Paid with earned coins. Coins can’t be bought.</T>
        </>
      )}
    </Sheet>
  );
}

export const hoursLeft = (at: string) => Math.max(1, Math.ceil((new Date(at).getTime() + TRADE_HOURS * 3600000 - Date.now()) / 3600000));

export function LockBadge() {
  const { t } = useTheme();
  return (
    <View style={{ position: 'absolute', right: 4, top: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: t.surface3, alignItems: 'center', justifyContent: 'center' }}>
      <Icon as={Lock} size={12} color={t.text} />
    </View>
  );
}
