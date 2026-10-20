// G6.3 Richest (and the R1.2 coin ranking): balance list, own row highlighted, number one stays neutral (the crown belongs to rating).
import { router, useFocusEffect } from 'expo-router';
import { Coins } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { richest } from '@/lib/coins';
import { isOn } from '@/lib/modules';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Empty, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Rows = Awaited<ReturnType<typeof richest>>;

export default function Richest() {
  const { t } = useTheme();
  const { league, me } = useLeague();
  const [rows, setRows] = useState<Rows | null>(null);
  useFocusEffect(useCallback(() => { if (league && isOn(league, 'coins')) (async () => setRows(await richest(league.id)))(); }, [league]));

  if (!isOn(league, 'coins')) return <Screen><Header title="Richest" /><Empty icon={Coins} title="Coins are off in this league" body="An admin can turn them on in the league modules." /></Screen>;
  const row = (r: Rows[number], i: number) => {
    const mine = r.member.id === me?.id;
    return (
      <Pressable key={r.member.id} accessibilityRole="button" onPress={() => router.push(`/player/${r.member.id}`)}
        style={({ pressed }) => ({ minHeight: 64, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2],
          backgroundColor: pressed ? t.surface3 : mine ? t.surface2 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
        <T v="number" c="text2" style={{ width: 28 }}>{i + 1}</T>
        <Avatar name={r.member.display_name} colour={r.member.colour} jersey={r.member.jersey} size={40} />
        <T v="heading" style={{ flex: 1 }} numberOfLines={1}>{mine ? 'You' : r.member.display_name}</T>
        <View style={{ alignItems: 'flex-end' }}>
          <T v="number" style={{ fontSize: 17 }}>{fmt(r.balance)}</T>
          <T v="caption" c="text3">{r.week ? `${signed(r.week)} this week` : 'none this week'}</T>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Header title="Richest" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 64 }}>
        <T v="small" c="text2" style={{ paddingHorizontal: space[1] }}>Coins earned by playing. Coins never decide rank.</T>
        {!rows ? <Skeleton h={320} />
          : rows.every((r) => !r.balance) ? <Empty icon={Coins} title="No coins yet" body="Every match pays 20 coins, a win 20 more." />
            : <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>{rows.map(row)}</View>}
      </ScrollView>
    </Screen>
  );
}
