// The Oracle: best predictors of the league, this week or all time (Tippelés module, G10 Oracle award source)
import { useFocusEffect } from 'expo-router';
import { Crown, Target } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { oracle, type OracleRow } from '@/lib/predictions';
import type { PlayerColour } from '@/theme';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Avatar, Empty, Pill, Screen, Seg, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Data = Awaited<ReturnType<typeof oracle>>;

export default function Oracle() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [period, setPeriod] = useState<'week' | 'all'>('all');
  const [d, setD] = useState<Data | undefined>(undefined);

  const load = useCallback(async () => { if (session && league) setD(await oracle(session.user, league.id, period)); }, [session, league, period]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const row = (r: OracleRow, i: number) => {
    const me = r.member_id === d?.meId;
    return (
      <View key={r.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 64, paddingHorizontal: space[4], paddingVertical: space[2],
        borderTopWidth: i ? 1 : 0, borderTopColor: t.line, backgroundColor: me ? t.surface2 : 'transparent' }}>
        <T v="number" style={{ width: 28 }}>{i + 1}</T>
        <Avatar name={r.name} colour={r.colour as PlayerColour} jersey={r.jersey} size={40} />
        <View style={{ flex: 1, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
            <T v="heading" numberOfLines={1}>{me ? 'You' : r.name}</T>
            {i === 0 ? <Pill label="The Oracle" icon={Crown} tone="crown" /> : null}
          </View>
          <T v="caption" c="text3">Called {r.called} of {r.total}{d?.coinsOn && r.net ? `, ${signed(r.net)} coins` : ''}</T>
        </View>
        <T v="number">{fmt(r.points)}</T>
      </View>
    );
  };

  return (
    <Screen>
      <Header title="The Oracle" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <Seg value={period} onChange={setPeriod} options={[{ value: 'week', label: 'This week' }, { value: 'all', label: 'All time' }]} />
        <T v="small" c="text2">Points for every right call, more for an underdog. Returned tips do not count.</T>
        {d === undefined ? <View style={{ gap: space[2] }}>{[0, 1, 2, 3].map((i) => <Skeleton key={i} h={64} />)}</View>
          : !d ? <Empty icon={Target} title="Predictions are off" body="Your league has not turned them on, or they are not available for your account." />
          : !d.rows.length ? <Empty icon={Crown} title="No calls yet" body={period === 'week' ? 'Nobody has called a match this week. Be the first.' : 'Call a match to start the table.'} />
          : <View style={{ borderRadius: radius.md, backgroundColor: t.surface, overflow: 'hidden' }}>{d.rows.map(row)}</View>}
      </ScrollView>
    </Screen>
  );
}
