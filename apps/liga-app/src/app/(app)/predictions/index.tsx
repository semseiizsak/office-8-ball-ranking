// Predictions hub: open calls (live, challenges, cup games), your tips and the way into The Oracle (M13.2, Tippelés module)
import { router, useFocusEffect, type Href } from 'expo-router';
import { Crown, Radio, Swords, Target, Trophy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, View } from 'react-native';

import { myTips, oddsLabel, openCalls, pays, predictionsOn, type Call, type TipView } from '@/lib/predictions';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Empty, Icon, Pill, Screen, Skeleton, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';

type Mine = Awaited<ReturnType<typeof myTips>>;
const ICON = { live: Radio, challenge: Swords, cup: Trophy } as const;

export default function Predictions() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [on, setOn] = useState<boolean | null>(null);
  const [calls, setCalls] = useState<Call[]>([]);
  const [mine, setMine] = useState<Mine>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!session || !league) return;
    const ok = await predictionsOn(session.user, league);
    const [c, m] = ok ? await Promise.all([openCalls(session.user, league.id), myTips(session.user, league.id)]) : [[], null];
    setOn(ok); setCalls(c); setMine(m);
  }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const open = (c: Call) => router.push({ pathname: '/predictions/call', params: { target: c.target, id: c.id } });

  const callRow = (c: Call) => (
    <View key={`${c.target}${c.id}`} style={{ borderRadius: radius.md, backgroundColor: t.surface, overflow: 'hidden' }}>
      <Row first icon={ICON[c.target]} label={c.title} value={c.mine ? 'Called' : `${oddsLabel(c.odds.a)}, ${oddsLabel(c.odds.b)}`} onPress={() => open(c)} />
    </View>
  );

  const tipLine = (x: TipView) => {
    const result = x.status === 'won' ? (x.payout ? `+${fmt(x.payout)}` : `+${x.points} pts`) : x.status === 'refunded' ? 'Returned' : x.status === 'lost' ? 'Missed' : null;
    return (
      <View key={x.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[3], borderTopWidth: 1, borderTopColor: t.line }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T v="heading" numberOfLines={1}>{x.pick_name}</T>
          <T v="caption" c="text3" numberOfLines={1}>{x.title}, {oddsLabel(x.odds)}{x.stake ? `, ${x.stake} coins` : ''}</T>
        </View>
        {result ? <Pill label={result} tone={x.status === 'won' ? 'win' : 'neutral'} />
          : <T v="label" c="text2">{x.stake ? `Pays ${fmt(pays(x.stake, x.odds))}` : 'Open'}</T>}
      </View>
    );
  };

  return (
    <Screen>
      <Header title="Predictions" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={t.text2} />}>
        {on === null ? <View style={{ gap: space[2] }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={56} />)}</View> : !on ? (
          <Empty icon={Target} title="Predictions are off" body="Your league has not turned them on, or they are not available for your account." />
        ) : (
          <>
            <T c="text2">Call the winner for the bragging rights. Tips use earned coins only, never real money.</T>
            <View style={{ gap: space[2] }}>
              <T v="label" c="text2" style={{ paddingHorizontal: space[1] }}>Open to call</T>
              {calls.length ? calls.map(callRow) : <T v="small" c="text3" style={{ paddingHorizontal: space[1] }}>Nothing to call right now. Live matches, challenges and cup games show up here.</T>}
            </View>
            <Group title="The Oracle">
              <Row first icon={Crown} label="Best predictors" value={mine?.total ? `You ${mine.called} of ${mine.total}` : undefined} onPress={() => router.push('/predictions/oracle' as Href)} />
            </Group>
            {mine?.open.length ? (
              <View style={{ gap: space[2] }}>
                <T v="label" c="text2" style={{ paddingHorizontal: space[1] }}>Your open tips</T>
                <View style={{ borderRadius: radius.md, backgroundColor: t.surface, overflow: 'hidden', marginTop: -1 }}>{mine.open.map(tipLine)}</View>
              </View>
            ) : null}
            {mine?.settled.length ? (
              <View style={{ gap: space[2] }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], paddingHorizontal: space[1] }}>
                  <T v="label" c="text2" style={{ flex: 1 }}>Settled</T>
                  <Icon as={Target} size={14} color={t.text3} />
                  <T v="caption" c="text3">{mine.points} points</T>
                </View>
                <View style={{ borderRadius: radius.md, backgroundColor: t.surface, overflow: 'hidden', marginTop: -1 }}>{mine.settled.map(tipLine)}</View>
              </View>
            ) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
