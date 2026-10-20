// G1.8 Trophy cabinet: cups won, finals, entries, a shelf per week and the best run
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Medal, Trophy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { cabinet } from '@/lib/cup';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Empty, Icon, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Data = Awaited<ReturnType<typeof cabinet>>;

export default function Cabinet() {
  const { t } = useTheme();
  const { league, members, me } = useLeague();
  const { member } = useLocalSearchParams<{ member?: string }>();
  const id = member ?? me?.id;
  const [d, setD] = useState<Data | null>(null);
  useFocusEffect(useCallback(() => { if (league && id) cabinet(league.id, id).then(setD); }, [league, id]));

  const m = members.find((x) => x.id === id);
  const title = id === me?.id ? 'Your trophies' : `${m?.display_name ?? 'Player'}, trophies`;
  const num = (v: number, label: string) => (
    <View style={{ flex: 1, backgroundColor: t.surface, borderRadius: radius.md, padding: space[3], gap: 2 }}>
      <T v="number">{v}</T>
      <T v="caption" c="text3">{label}</T>
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title={title} />
      {!d ? <View style={{ padding: space[4] }}><Skeleton h={200} /></View> : !d.entries ? (
        <Empty icon={Trophy} title="No cups yet" body="The next one opens Monday 8:00." action={<Button label="Go to the cup" variant="secondary" onPress={() => router.navigate('/cup')} />} />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {num(d.wins, d.wins === 1 ? 'Cup' : 'Cups')}
            {num(d.finals, d.finals === 1 ? 'Final' : 'Finals')}
            {num(d.entries, 'Entered')}
          </View>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {d.shelf.map((s) => {
              const bg = s.kind === 'won' ? t.crown : s.kind === 'final' ? t.surface3 : 'transparent';
              const fg = s.kind === 'won' ? t.onCrown : s.kind === 'final' ? t.text : t.text3;
              return (
                <Pressable key={s.cup_id} accessibilityRole="button" accessibilityLabel={`Week ${s.week_no}, ${s.round}`} onPress={() => router.push(`/cup/bracket?id=${s.cup_id}`)}
                  style={{ width: '31%', minHeight: 96, borderRadius: radius.md, backgroundColor: bg, borderWidth: 2, borderColor: s.kind === 'entered' ? t.lineStrong : bg, alignItems: 'center', justifyContent: 'center', gap: 4, padding: space[2] }}>
                  <Icon as={s.kind === 'entered' ? Medal : Trophy} size={24} color={fg} />
                  <T v="label" c={fg} center>Week {s.week_no}</T>
                  <T v="caption" c={fg} center numberOfLines={2}>{s.kind === 'final' ? 'Final' : s.round}</T>
                </Pressable>
              );
            })}
          </View>
          {d.best > 1 ? <T c="text2">Won {d.best} in a row</T> : null}
        </ScrollView>
      )}
    </View>
  );
}
