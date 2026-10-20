import { router, useFocusEffect } from 'expo-router';
import { ArrowLeft, ChevronDown, ChevronUp, Users } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { PAIR_MIN, pairRatings, type Pair } from '@/lib/stats';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Empty, Icon, IconButton, Screen, Skeleton, T } from '@/ui';

type Data = Awaited<ReturnType<typeof pairRatings>>;

// R1.10 Pairs: every duo is rated on its own from its 2v2 matches.
export default function Pairs() {
  const { t } = useTheme();
  const { members, me, league } = useLeague();
  const [d, setD] = useState<Data | null>(null);
  const [open, setOpen] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!league) return;
    (async () => setD(await pairRatings(league.id)))();
  }, [league]));

  const byId = new Map(members.map((m) => [m.id, m]));
  const name = (id: string) => (id === me?.id ? 'You' : byId.get(id)?.display_name ?? 'Former player');

  const row = (p: Pair, rank: number | null) => {
    const mine = p.a === me?.id || p.b === me?.id;
    return (
      <Pressable key={p.key} accessibilityRole="button" onPress={() => router.push({ pathname: '/pair/[a]/[b]', params: { a: p.a, b: p.b } })}
        style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 60, paddingHorizontal: space[3], borderRadius: radius.sm,
          backgroundColor: pressed ? t.surface3 : mine ? t.surface2 : 'transparent' })}>
        {mine ? <View style={{ position: 'absolute', left: 0, top: 10, bottom: 10, width: 3, borderRadius: 2, backgroundColor: t.brand }} /> : null}
        <T v="label" c="text3" style={{ width: 22, textAlign: 'center' }}>{rank ?? ''}</T>
        <View style={{ flexDirection: 'row' }}>
          {[p.a, p.b].map((id, i) => {
            const m = byId.get(id);
            return <View key={id} style={{ marginLeft: i ? -12 : 0 }}>{m ? <Avatar name={m.display_name} colour={m.colour} size={40} /> : <Avatar name="?" colour="ink" size={40} ring={false} />}</View>;
          })}
        </View>
        <View style={{ flex: 1 }}>
          <T v="heading" numberOfLines={1}>{name(p.a)} and {name(p.b)}</T>
          <T v="caption" c="text3">{p.played} played, {p.won} won</T>
        </View>
        <T v="number" c={rank ? 'text' : 'text3'}>{fmt(p.rating)}</T>
      </Pressable>
    );
  };

  return (
    <Screen>
      <View style={{ paddingHorizontal: space[4], paddingVertical: space[2] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
      </View>
      <ScrollView contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 60, gap: 2 }}>
        <T v="title" style={{ paddingHorizontal: space[1] }}>Pairs</T>
        <T v="small" c="text2" style={{ paddingHorizontal: space[1], marginBottom: space[3] }}>Pairs with {PAIR_MIN} or more matches together</T>
        {!d ? [0, 1, 2].map((i) => <Skeleton key={i} h={56} />) : (
          <>
            {d.ranked.map((p, i) => row(p, i + 1))}
            {!d.ranked.length ? <Empty icon={Users} title={d.hasDoubles ? `No pair has ${PAIR_MIN} matches yet` : 'No doubles yet'} body={d.hasDoubles ? 'Keep playing with the same partner.' : 'Log a 2v2 match to start the doubles ladder.'} /> : null}
            {d.unranked.length ? (
              <Pressable accessibilityRole="button" onPress={() => setOpen(!open)} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, marginTop: space[4], paddingHorizontal: space[1] }}>
                <T v="label" c="text2" style={{ flex: 1 }}>Not ranked yet, {d.unranked.length}</T>
                <Icon as={open ? ChevronUp : ChevronDown} size={18} color={t.text2} />
              </Pressable>
            ) : null}
            {open ? d.unranked.map((p) => row(p, null)) : null}
          </>
        )}
      </ScrollView>
    </Screen>
  );
}
