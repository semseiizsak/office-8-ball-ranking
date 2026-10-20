// G8.4 Spares and G8.4.1 Redeem and upgrade sheets. One copy of every card always stays in the album.
// Specials never show here: they can't be redeemed for coins or traded.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, type Href } from 'expo-router';
import { ArrowLeftRight, ArrowUp, Recycle } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { nextRarity, RARITIES, RARITY_LABEL, redeem, spares, upgrade, upgradeOptions, UPGRADE_COST, type CardView, type Rarity, type Spare } from '@/lib/cards';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Button, Empty, IconButton, Screen, Skeleton, T } from '@/ui';
import { CollectCard, Sheet } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';

type Ask = { kind: 'redeem'; items: { key: string; n: number }[]; coins: number; count: number }
  | { kind: 'upgrade'; keys: string[]; set: number; from: Rarity; to: Rarity; options: CardView[] };

export default function Spares() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [list, setList] = useState<Spare[] | null>(null);
  const [ask, setAsk] = useState<Ask | null>(null);
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<CardView | null>(null);

  const load = useCallback(async () => { if (session && league) setList(await spares(session.user, league.id)); }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!list) return <Screen><Header title="Spares" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={80} /><Skeleton h={240} /></View></Screen>;
  const total = list.reduce((n, s) => n + s.spare, 0);
  const worth = list.reduce((n, s) => n + s.spare * s.card.redeem, 0);
  const groups = [...RARITIES].reverse().map((r) => ({ r, rows: list.filter((s) => s.card.rarity === r) })).filter((g) => g.rows.length);
  const commons = list.filter((s) => s.card.rarity === 'common');

  // Three spares of one rarity from one season, taking the most duplicated first.
  const upgradeFor = (r: Rarity) => {
    const bySet = new Map<number, string[]>();
    for (const s of list.filter((x) => x.card.rarity === r && x.card.set)) for (let i = 0; i < s.spare; i++) bySet.set(s.card.set!, [...(bySet.get(s.card.set!) ?? []), s.card.key]);
    const best = [...bySet.entries()].filter(([, keys]) => keys.length >= UPGRADE_COST).sort((a, b) => b[0] - a[0])[0];
    return best ? { set: best[0], keys: best[1].slice(0, UPGRADE_COST) } : null;
  };
  const askUpgrade = async (r: Rarity) => {
    const u = upgradeFor(r), to = nextRarity(r);
    if (!u || !to || !league) return;
    setAsk({ kind: 'upgrade', keys: u.keys, set: u.set, from: r, to, options: await upgradeOptions(league.id, u.set, r) });
  };
  const confirm = async () => {
    if (!ask || !session || !league) return;
    setBusy(true);
    try {
      if (ask.kind === 'redeem') { await redeem(session.user, league.id, ask.items); setAsk(null); }
      else { const r = await upgrade(session.user, league.id, ask.keys); setAsk(null); setGot(r.card); if (r.setDone) Alert.alert(`Season ${r.setDone.set} album complete`, '+250 coins, added to your wallet.'); }
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      await load();
    } catch { Alert.alert('Couldn’t do that', 'Nothing was lost. Try again in a moment.'); }
    setBusy(false);
  };

  const row = (s: Spare, first: boolean) => (
    <View key={s.card.key} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], borderTopWidth: first ? 0 : 1, borderTopColor: t.line }}>
      <Pressable accessibilityRole="button" accessibilityLabel={`Open ${s.card.name}`} onPress={() => router.push(`/cards/card?key=${encodeURIComponent(s.card.key)}` as Href)}>
        <CollectCard card={s.card} w={44} />
      </Pressable>
      <View style={{ flex: 1, gap: 2 }}>
        <T v="label" numberOfLines={1}>{s.card.name}, season {s.card.set}</T>
        <T v="caption" c="text3">{s.spare} {s.spare === 1 ? 'spare' : 'spares'}, {s.card.redeem} coins each</T>
      </View>
      <IconButton icon={ArrowLeftRight} label={`Trade ${s.card.name}`} onPress={() => router.push(`/cards/trade-new?give=${encodeURIComponent(s.card.key)}` as Href)} />
      <IconButton icon={Recycle} label={`Redeem ${s.card.name}`} onPress={() => setAsk({ kind: 'redeem', items: [{ key: s.card.key, n: s.spare }], coins: s.spare * s.card.redeem, count: s.spare })} />
    </View>
  );

  return (
    <Screen>
      <Header title="Spares" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        {!list.length ? <Empty icon={Recycle} title="No spares yet" body="Duplicates land here. Trade them, redeem them for coins or upgrade three into one." /> : (
          <>
            <View style={{ gap: 2, paddingHorizontal: space[1] }}>
              <T v="section">{total} {total === 1 ? 'spare' : 'spares'}</T>
              <T c="text2">Worth {fmt(worth)} coins</T>
            </View>
            {commons.length > 1 ? <Button label="Redeem all Commons" icon={Recycle} variant="secondary" size="md"
              onPress={() => { const n = commons.reduce((x, s) => x + s.spare, 0); setAsk({ kind: 'redeem', items: commons.map((s) => ({ key: s.card.key, n: s.spare })), coins: n * 5, count: n }); }} /> : null}
            {groups.map((g) => {
              const up = upgradeFor(g.r), to = nextRarity(g.r);
              return (
                <View key={g.r} style={{ gap: space[2] }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
                    <T v="heading">{RARITY_LABEL[g.r]}</T>
                    {up && to ? <Button label={`Upgrade 3 to 1 ${RARITY_LABEL[to]}`} icon={ArrowUp} size="sm" variant="secondary" onPress={() => askUpgrade(g.r)} /> : null}
                  </View>
                  <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>{g.rows.map((s, i) => row(s, i === 0))}</View>
                </View>
              );
            })}
          </>
        )}
      </ScrollView>

      <Sheet open={!!ask} onClose={() => setAsk(null)}>
        {ask?.kind === 'redeem' ? (
          <>
            <T v="section" center>Redeem {ask.count} {ask.count === 1 ? 'spare' : 'spares'} for {ask.coins} coins?</T>
            <T v="small" c="text2" center>One copy of each card stays in your album. Common 5, Uncommon 10, Rare 25, Epic 60, Legendary 200.</T>
          </>
        ) : ask?.kind === 'upgrade' ? (
          <>
            <T v="section" center>Trade 3 {RARITY_LABEL[ask.from]} spares for 1 random {RARITY_LABEL[ask.to]} from season {ask.set}</T>
            <T v="small" c="text2" center>Every one of these has the same chance, {Math.round(100 / Math.max(1, ask.options.length))}% each:</T>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
              {ask.options.map((c) => <CollectCard key={c.key} card={c} w={64} />)}
            </ScrollView>
          </>
        ) : null}
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label="Cancel" variant="secondary" style={{ flex: 1 }} onPress={() => setAsk(null)} />
          <Button label="Confirm" style={{ flex: 1 }} loading={busy} onPress={confirm} />
        </View>
      </Sheet>

      <Sheet open={!!got} onClose={() => setGot(null)}>
        {got ? (
          <View style={{ alignItems: 'center', gap: space[3] }}>
            <CollectCard card={got} w={160} />
            <T v="heading" center>{got.name}, {got.label}</T>
            <Button label="Done" full onPress={() => setGot(null)} />
          </View>
        ) : null}
      </Sheet>
    </Screen>
  );
}
