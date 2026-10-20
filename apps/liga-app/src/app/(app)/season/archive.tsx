// M6.4 Hall of fame and R1.9 season picker: the live season, every closed season with its podium and titles, records.
import { router, useFocusEffect } from 'expo-router';
import { Crown, Trophy } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { allTime, lastDay, nameIn, range } from '@/lib/seasons';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Card, Empty, Icon, Pill, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { useSeasons } from '@/ui/season';

type Records = Awaited<ReturnType<typeof allTime>>['records'];

export default function SeasonArchive() {
  const { t } = useTheme();
  const { members, me, league } = useLeague();
  const { data } = useSeasons();
  const [rec, setRec] = useState<Records | null>(null);
  useFocusEffect(useCallback(() => { if (league) (async () => setRec((await allTime(league.id)).records))(); }, [league]));
  const name = (id: string | undefined) => nameIn(members, id, me?.id);

  if (!data) return <Screen><Header title="Hall of fame" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={72} /><Skeleton h={140} /></View></Screen>;
  const cur = data.current;

  return (
    <Screen>
      <Header title="Hall of fame" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 64 }}>
        {data.on ? (
          <Card onPress={() => router.push('/season')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
            <View style={{ flex: 1, gap: 2 }}>
              <T v="heading">Season {cur.n}</T>
              <T v="caption" c="text2">{cur.end ? `Live, ends ${lastDay(cur.end)}` : 'Live'}</T>
            </View>
            <Pill label="Live" tone="brand" />
          </Card>
        ) : null}
        {data.closed.length ? data.closed.map((s) => {
          const champ = s.rows[0];
          return (
            <Card key={s.n} onPress={() => router.push(`/season/${s.n}`)} style={{ gap: space[2] }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                <T v="heading" style={{ flex: 1 }}>Season {s.n}</T>
                <T v="caption" c="text3">{range(s)}</T>
              </View>
              {champ ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                  <View style={{ width: 28, height: 28, borderRadius: 14, backgroundColor: t.crown, alignItems: 'center', justifyContent: 'center' }}>
                    <Icon as={Crown} size={15} color={t.onCrown} />
                  </View>
                  <T v="label">{name(champ.id) === 'You' ? 'You won it' : `Won by ${name(champ.id)}`}</T>
                </View>
              ) : <T v="small" c="text2">No matches this season.</T>}
              {s.rows.length > 1 ? <T v="small" c="text2">2nd {name(s.rows[1]?.id)}{s.rows[2] ? `, 3rd ${name(s.rows[2].id)}` : ''}</T> : null}
              {s.titles.length ? <T v="caption" c="text3">{s.titles.slice(0, 3).map((x) => `${x.label}: ${name(x.who)}`).join(', ')}</T> : null}
            </Card>
          );
        }) : (
          <Empty icon={Trophy} title="No champions yet" body={cur.end ? `The first champion is crowned on ${lastDay(cur.end)}.` : 'The first champion is crowned when an admin ends the season.'} />
        )}
        {rec && (rec.streak || rec.upset) ? (
          <Card style={{ gap: space[2] }}>
            <T v="heading">Records</T>
            {rec.streak ? <T v="small" c="text2">Longest streak: {name(rec.streak.id)}, {rec.streak.n}</T> : null}
            {rec.upset ? <T v="small" c="text2">Biggest upset: {rec.upset.winners.map(name).join(' and ')}, gap {rec.upset.gap}</T> : null}
          </Card>
        ) : null}
      </ScrollView>
    </Screen>
  );
}
