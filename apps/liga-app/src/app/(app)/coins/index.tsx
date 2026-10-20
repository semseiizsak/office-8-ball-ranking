// G6 Wallet: balance, this week, weekly balance line, breakdown, quests, last 5 entries, Richest link.
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, Coins, Target, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { REASON_LABEL, wallet, type Line, type Wallet } from '@/lib/coins';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Button, Card, Empty, Icon, Screen, Skeleton, T } from '@/ui';
import { LineChart } from '@/ui/chart';
import { Group, Header, Row } from '@/ui/list-row';
import { EntrySheet, LedgerRow } from '@/ui/rewards';
import { ShopEntry } from '@/ui/cards-kit';

export default function WalletScreen() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [w, setW] = useState<Wallet | null>(null);
  const [open, setOpen] = useState<Line | null>(null);
  useFocusEffect(useCallback(() => { if (session && league) (async () => setW(await wallet(session.user, league.id)))(); }, [session, league]));

  if (!isOn(league, 'coins') || (w && !w.on)) {
    return <Screen><Header title="Coins" /><Empty icon={Coins} title="Coins are off in this league" body="An admin can turn them on in the league modules." action={<Button label="Back" size="md" variant="secondary" onPress={() => router.back()} />} /></Screen>;
  }
  if (!w) return <Screen><Header title="Coins" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={140} /><Skeleton h={160} /><Skeleton h={220} /></View></Screen>;
  const quests = isOn(league, 'quests');

  return (
    <Screen>
      <Header title="Coins" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        <Card style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <Icon as={Coins} size={28} color={t.crown} />
            <T v="bigNumber">{fmt(w.balance)}</T>
          </View>
          <T v="small" c="text2">{w.balance ? `coins, ${w.week ? `${signed(w.week)} this week` : 'nothing new this week yet'}` : 'Play your first match to earn 40 coins.'}</T>
          {w.line.some((x) => x > 0) ? <View style={{ marginTop: space[2] }}><LineChart series={[{ values: w.line, color: t.brand }]} height={100} peak={false} /></View> : null}
          {w.line.some((x) => x > 0) ? <T v="caption" c="text3">Balance over the last 8 weeks</T> : null}
        </Card>

        {w.breakdown.length ? (
          <Group title="Where they came from">
            {w.breakdown.map((b, i) => <Row key={b.reason} first={i === 0} label={REASON_LABEL[b.reason]} value={signed(b.amount)} />)}
          </Group>
        ) : null}

        {quests ? (
          <Card onPress={() => router.push('/quests')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={Target} size={22} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="heading">Weekly quests</T>
              <T v="small" c="text2">Three goals a week, 75 coins each</T>
            </View>
            <Icon as={ChevronRight} size={18} color={t.text3} />
          </Card>
        ) : null}

        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
            <T v="label" c="text2">Latest</T>
            {w.recent.length ? (
              <Pressable accessibilityRole="button" onPress={() => router.push('/coins/history')} hitSlop={12} style={{ minHeight: 44, justifyContent: 'center' }}>
                <T v="label" c="text2">See all</T>
              </Pressable>
            ) : null}
          </View>
          {w.recent.length ? (
            <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
              {w.recent.map((e, i) => <LedgerRow key={e.id} e={e} first={i === 0} onPress={() => setOpen(e)} />)}
            </View>
          ) : <Card><T v="small" c="text2">Nothing yet. Every match pays 20, a win 20 more.</T></Card>}
        </View>

        <ShopEntry />{/* G7 */}
        <Group>
          <Row first icon={Users} label="Richest" onPress={() => router.push('/coins/richest')} />
        </Group>
        <T v="caption" c="text3" center>Coins can&apos;t be bought. You earn them by playing.</T>
      </ScrollView>
      <EntrySheet e={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}
