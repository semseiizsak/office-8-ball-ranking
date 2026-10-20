// G7.1 Pack details and drop rates (always before buying), pity counter, then G7.2 confirm and Open now.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { Coins } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { DAILY_PACKS, PACK, packInfo, packOdds, PITY, type PackKind } from '@/lib/cards';
import { buyPack, shelf, type Shelf } from '@/lib/shop';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, space } from '@/theme';
import { Button, Screen, Skeleton, T } from '@/ui';
import { BuySheet, OddsTable, PackArt } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';

export default function PackDetail() {
  const { session } = useAuth();
  const { league } = useLeague();
  const { kind: raw } = useLocalSearchParams<{ kind: string }>();
  const kind = (raw && raw in PACK ? raw : 'player') as PackKind;
  const p = PACK[kind];
  const [s, setS] = useState<Shelf | null>(null);
  const [pity, setPity] = useState(0);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [bought, setBought] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session || !league) return;
    const [sh, info] = await Promise.all([shelf(session.user, league.id), packInfo(session.user, league.id)]);
    setS(sh); setPity(info.pity);
  }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!s) return <Screen><Header title={p.name} /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={200} /><Skeleton h={320} /></View></Screen>;
  const price = p.price ?? 0;
  const short = price - s.balance;
  const odds = packOdds(kind);

  const buy = async () => {
    if (!session || !league) return;
    setBusy(true); setError(false);
    try { const id = await buyPack(session.user, league.id, kind); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setBought(id); await load(); }
    catch { setError(true); }
    setBusy(false);
  };
  const close = () => { setOpen(false); setBought(null); setError(false); };

  return (
    <Screen>
      <Header title={p.name} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        <View style={{ alignItems: 'center', gap: space[2] }}>
          <PackArt kind={kind} w={120} />
          <T v="heading" center>{kind === 'retro' ? '3 cards from earlier seasons' : p.body}</T>
          <T v="small" c="text2" center>{fmt(price)} coins, up to {DAILY_PACKS} packs a day</T>
        </View>
        <View style={{ gap: space[2] }}>
          <T v="section" style={{ paddingHorizontal: space[1] }}>Drop rates</T>
          <OddsTable slots={odds.slots} />
        </View>
        <View style={{ gap: space[2], paddingHorizontal: space[1] }}>
          <T v="small" c="text2">Guaranteed Legendary after {PITY} packs without one. You&apos;re at {pity} of {PITY}.</T>
          <T v="small" c="text2">A Mythic is 1 of 1 for each player each season. If it&apos;s already taken you get their Legendary instead.</T>
          <T v="small" c="text2">Special editions (Crown, Cup champion, Season champion) are never in packs.</T>
        </View>
        <Button label={s.packsLeft === 0 ? 'Daily limit reached' : short > 0 ? `Need ${fmt(short)} more` : `Buy for ${fmt(price)}`} icon={short > 0 || !s.packsLeft ? undefined : Coins}
          disabled={short > 0 || !s.packsLeft || s.guest || !s.on} onPress={() => setOpen(true)} />
        <T v="caption" c="text3" center>Coins can&apos;t be bought. You earn them by playing.</T>
      </ScrollView>
      <BuySheet item={open ? p.name : null} price={price} balance={bought ? s.balance + price : s.balance} busy={busy} error={error} bought={!!bought} onBuy={buy} onClose={close}
        onOpen={() => { const id = bought; close(); if (id) router.push(`/cards/open?id=${id}` as Href); }} />
    </Screen>
  );
}
