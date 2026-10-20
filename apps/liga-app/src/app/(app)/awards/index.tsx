// G10.1 and M6.6 Awards archive: most MVPs, every past week with its player of the week, tap to replay the story.
import { router, useFocusEffect } from 'expo-router';
import { ChevronRight, Crown, Medal } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { awardsHome, weekRange, type AwardsHome } from '@/lib/awards';
import { dayHm } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Icon, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

const PAGE = 10;

export default function AwardsArchive() {
  const { t } = useTheme();
  const { league, members, me } = useLeague();
  const [h, setH] = useState<AwardsHome | null>(null);
  const [limit, setLimit] = useState(PAGE);
  useFocusEffect(useCallback(() => { if (league && isOn(league, 'awards')) (async () => setH(await awardsHome(league.id)))(); }, [league]));

  if (!isOn(league, 'awards')) return <Screen><Header title="Weekly awards" /><Empty icon={Medal} title="Awards are off in this league" body="An admin can turn on Weekly awards in the league modules." /></Screen>;
  if (!h) return <Screen><Header title="Weekly awards" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={88} /><Skeleton h={72} /><Skeleton h={72} /></View></Screen>;
  const who = (id: string) => members.find((m) => m.id === id);
  const name = (id: string) => (id === me?.id ? 'You' : who(id)?.display_name ?? 'Someone');
  const top = h.mostMvp && who(h.mostMvp.id);

  return (
    <Screen>
      <Header title="Weekly awards" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 64 }}>
        <T v="small" c="text2" style={{ paddingHorizontal: space[1] }}>Next ceremony {dayHm(h.next, h.tz)}.</T>
        {top && h.mostMvp ? (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <Avatar name={top.display_name} colour={top.colour} jersey={top.jersey} size={48} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="caption" c="text2">Most player of the week awards</T>
              <T v="heading">{name(top.id)}, {h.mostMvp.n}</T>
            </View>
            <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: t.crown, alignItems: 'center', justifyContent: 'center' }}>
              <Icon as={Crown} size={18} color={t.onCrown} />
            </View>
          </Card>
        ) : null}
        {h.list.length ? h.list.slice(0, limit).map((a) => {
          const mvp = a.items.find((x) => x.key === 'mvp');
          return (
            <Card key={a.id} onPress={() => router.push(`/awards/${a.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ flex: 1, gap: 2 }}>
                <T v="heading">Week {a.week_no}{a.quiet ? '' : `, ${a.items.length} awards`}</T>
                <T v="caption" c="text3">{weekRange(a, h.tz)}</T>
                <T v="small" c="text2">{a.quiet ? `Quiet week, ${a.matches} ${a.matches === 1 ? 'match' : 'matches'}` : mvp ? `Player of the week: ${name(mvp.members[0])}` : `${a.matches} matches`}</T>
              </View>
              <Icon as={ChevronRight} size={18} color={t.text3} />
            </Card>
          );
        }) : <Empty icon={Medal} title="No awards yet" body="The first awards land Friday 16:00." />}
        {h.list.length > limit ? <Button label="Load more" variant="secondary" size="md" onPress={() => setLimit(limit + PAGE)} /> : null}
      </ScrollView>
    </Screen>
  );
}
