// G1.9 Past cups: every week with its champion, most cups on top, 20 at a time
import { router, useFocusEffect } from 'expo-router';
import { Trophy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { pastCups, type Cup } from '@/lib/cup';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Skeleton, T } from '@/ui';
import { who } from '@/ui/cup';
import { Header } from '@/ui/list-row';

const PAGE = 20;

export default function PastCups() {
  const { t } = useTheme();
  const { league, members, me } = useLeague();
  const [list, setList] = useState<Cup[] | null>(null);
  const [n, setN] = useState(PAGE);
  useFocusEffect(useCallback(() => { if (league) pastCups(league.id).then(setList); }, [league]));

  const name = (id: string | null) => who(members, id, me?.id) ?? 'Former player';
  const counts = new Map<string, number>();
  (list ?? []).forEach((c) => c.champion_id && counts.set(c.champion_id, (counts.get(c.champion_id) ?? 0) + 1));
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1]);
  const top = ranked[0] && ranked[0][1] > 1 && (ranked[1]?.[1] ?? 0) < ranked[0][1] ? ranked[0] : undefined; // only a clear leader

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }}>
      <Header title="All cups" />
      {!list ? <View style={{ padding: space[4], gap: space[2] }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={56} />)}</View> : !list.length ? (
        <Empty icon={Trophy} title="No cups yet" body="The first cup is still to come." />
      ) : (
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
          {top ? <Card><T v="heading">Most cups: {name(top[0])}, {top[1]}</T></Card> : null}
          <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
            {list.slice(0, n).map((c, i) => {
              const m = members.find((x) => x.id === c.champion_id);
              return (
                <Pressable key={c.id} accessibilityRole="button" disabled={c.status !== 'done'} onPress={() => router.push(`/cup/bracket?id=${c.id}`)}
                  style={({ pressed }) => ({ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], paddingVertical: space[2], backgroundColor: pressed ? t.surface3 : 'transparent', borderTopWidth: i ? 1 : 0, borderTopColor: t.line })}>
                  {m ? <Avatar name={m.display_name} colour={m.colour} size={36} /> : <View style={{ width: 36 }} />}
                  <View style={{ flex: 1 }}>
                    <T v="label" numberOfLines={1}>{c.status === 'done' ? name(c.champion_id) : 'No cup'}</T>
                    <T v="caption" c="text3" numberOfLines={1}>
                      {c.status === 'done' ? `Final against ${name(c.runner_up_id)}${c.final_score ? `, ${c.final_score[0]} : ${c.final_score[1]}` : ''}` : c.reason ?? 'Cancelled'}
                    </T>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <T v="caption">Week {c.week_no}</T>
                    {c.status === 'done' ? <T v="caption" c="text3">{c.seeds.length} players</T> : null}
                  </View>
                </Pressable>
              );
            })}
          </View>
          {list.length > n ? <Button label="Load more" variant="secondary" onPress={() => setN((x) => x + PAGE)} /> : null}
        </ScrollView>
      )}
    </View>
  );
}
