// G7 Shop: balance, packs (Cards module) with drop rates, avatar frames, titles, card backs. G7.2 confirm sheet.
// The same shelf every day: no timers, no sold out, no rotating stock, no bundles.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Check, Coins, ShoppingBag } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { DAILY_PACKS } from '@/lib/cards';
import { buyItem, equip, KIND_LABEL, shelf, type Item, type ItemKind, type Shelf } from '@/lib/shop';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Icon, Screen, Skeleton, T } from '@/ui';
import { BuySheet, CardBack, PackArt } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';

type ShelfItem = Shelf['items'][number];

export default function Shop() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me } = useLeague();
  const [s, setS] = useState<Shelf | null>(null);
  const [pick, setPick] = useState<Item | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [bought, setBought] = useState(false);

  const load = useCallback(async () => { if (session && league) setS(await shelf(session.user, league.id)); }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (s && !s.on) return <Screen><Header title="Shop" /><Empty icon={ShoppingBag} title="The shop is off in this league" body="An admin can turn on Coins and Shop in the league modules." action={<Button label="Back" size="md" variant="secondary" onPress={() => router.back()} />} /></Screen>;
  if (!s) return <Screen><Header title="Shop" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={60} /><Skeleton h={200} /><Skeleton h={200} /></View></Screen>;
  if (s.guest) return <Screen><Header title="Shop" /><Empty icon={ShoppingBag} title="Guests can't buy" body="Claim your profile with an account to earn and spend coins." /></Screen>;

  const buy = async () => {
    if (!pick || !session || !league) return;
    setBusy(true); setError(false);
    try { await buyItem(session.user, league.id, pick.id); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setBought(true); await load(); }
    catch { setError(true); }
    setBusy(false);
  };
  const wear = async (i: ShelfItem) => {
    if (!session || !league) return;
    Haptics.selectionAsync();
    await equip(session.user, league.id, i.kind, i.equipped && i.kind !== 'back' ? null : i.id);
    await load();
  };
  const close = () => { setPick(null); setBought(false); setError(false); };

  const preview = (i: ShelfItem) => i.kind === 'back' ? <CardBack colour={i.colour} w={56} />
    : i.kind === 'frame' && me ? <View style={{ padding: 6 }}><Avatar name={me.display_name} colour={me.colour} size={44} frame={i.colour} /></View>
    : <View style={{ height: 32, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: t.brand, justifyContent: 'center' }}><T v="label" c="onBrand" numberOfLines={1}>{i.name}</T></View>;
  const tile = (i: ShelfItem) => {
    const short = !i.owned && i.price ? i.price - s.balance : 0;
    return (
      <View key={i.id} style={{ width: '48%', backgroundColor: t.surface, borderRadius: radius.md, padding: space[3], gap: space[2], alignItems: 'center' }}>
        <View style={{ height: 80, alignItems: 'center', justifyContent: 'center' }}>{preview(i)}</View>
        <T v="label" center numberOfLines={1}>{i.name}</T>
        {i.owned ? (
          <Button label={i.equipped ? 'Wearing' : 'Use'} icon={i.equipped ? Check : undefined} size="sm" variant={i.equipped ? 'primary' : 'secondary'} full onPress={() => wear(i)} />
        ) : (
          <Button label={short > 0 ? `Need ${fmt(short)} more` : `${fmt(i.price!)}`} icon={short > 0 ? undefined : Coins} size="sm" variant="secondary" full disabled={short > 0} onPress={() => setPick(i)} />
        )}
      </View>
    );
  };
  const kinds: ItemKind[] = ['frame', 'title', 'back'];

  return (
    <Screen>
      <Header title="Shop" right={<View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: radius.pill, backgroundColor: t.surface2 }}><Icon as={Coins} size={16} color={t.crown} /><T v="label">{fmt(s.balance)}</T></View>} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 64 }}>
        {s.packs.length ? (
          <View style={{ gap: space[2] }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline', paddingHorizontal: space[1] }}>
              <T v="section">Packs</T>
              <T v="caption" c="text3">Daily limit {DAILY_PACKS} packs, {s.packsLeft} more today</T>
            </View>
            {s.packs.map((p) => (
              <Card key={p.kind} onPress={p.open ? () => router.push(`/shop/pack?kind=${p.kind}` as Href) : undefined} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
                <PackArt kind={p.kind} w={52} />
                <View style={{ flex: 1, gap: 2 }}>
                  <T v="heading">{p.name}</T>
                  <T v="small" c="text2">{p.open ? p.body : 'Opens after the first season'}</T>
                  {p.open ? <T v="caption" c="text3">Drop rates inside</T> : null}
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                  <Icon as={Coins} size={16} color={t.crown} />
                  <T v="heading" c={p.open ? 'text' : 'text3'}>{fmt(p.price)}</T>
                </View>
              </Card>
            ))}
          </View>
        ) : null}

        {kinds.map((k) => {
          const list = s.items.filter((i) => i.kind === k);
          return list.length ? (
            <View key={k} style={{ gap: space[2] }}>
              <T v="section" style={{ paddingHorizontal: space[1] }}>{KIND_LABEL[k]}</T>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: space[2] }}>{list.map(tile)}</View>
            </View>
          ) : null;
        })}

        <Pressable accessibilityRole="button" onPress={() => router.push('/coins' as Href)} style={{ minHeight: 44, justifyContent: 'center' }}>
          <T v="caption" c="text3" center>Coins can&apos;t be bought. You earn them by playing.</T>
        </Pressable>
      </ScrollView>
      <BuySheet item={pick?.name ?? null} price={pick?.price ?? 0} balance={s.balance} busy={busy} error={error} bought={bought} onBuy={buy} onClose={close} />
    </Screen>
  );
}
