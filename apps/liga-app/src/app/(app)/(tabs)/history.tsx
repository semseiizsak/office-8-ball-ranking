import { router, useFocusEffect } from 'expo-router';
import { History as HistoryIcon, Plus } from 'lucide-react-native';
import { useCallback, useMemo, useState } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';

import { leagueMatches } from '@/lib/api';
import { dayLabel } from '@/lib/time';
import type { MatchRow } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Button, Empty, Screen, Seg, Skeleton, T } from '@/ui';
import { AppBar } from '@/ui/appbar';
import { PendingBanner } from '@/ui/confirm-kit';
import { LiveBanner } from '@/ui/live';
import { MatchCard } from '@/ui/match-card';

// M6 History feed, grouped by day.
export default function History() {
  const { t } = useTheme();
  const { league, members, me } = useLeague();
  const [rows, setRows] = useState<MatchRow[] | null>(null);
  const [filter, setFilter] = useState<'all' | 'mine'>('all');
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!league) return;
    setRows(await leagueMatches(league.id));
  }, [league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const sections = useMemo(() => {
    const list = (rows ?? []).filter((r) => filter === 'all' || r.match_players.some((p) => p.member_id === me?.id));
    const groups = new Map<string, MatchRow[]>();
    list.forEach((r) => { const k = dayLabel(r.played_at); groups.set(k, [...(groups.get(k) ?? []), r]); });
    return [...groups].map(([title, data]) => ({ title, data }));
  }, [rows, filter, me]);

  return (
    <Screen>
      <AppBar />
      <SectionList
        sections={sections}
        keyExtractor={(r) => r.id}
        stickySectionHeadersEnabled={false}
        contentContainerStyle={{ paddingHorizontal: space[4], paddingBottom: 120 }}
        ListHeaderComponent={
          <View style={{ gap: space[3], marginTop: space[2], marginBottom: space[2] }}>
            <T v="title" style={{ paddingHorizontal: space[1] }}>History</T>
            <LiveBanner />{/* M13.4 */}
            <PendingBanner />
            <Seg value={filter} onChange={setFilter} options={[{ value: 'all', label: 'Everyone' }, { value: 'mine', label: 'My matches' }]} />
          </View>
        }
        renderSectionHeader={({ section }) => <T v="label" c="text2" style={{ marginTop: space[4], marginBottom: space[2], paddingHorizontal: space[1] }}>{section.title}</T>}
        renderItem={({ item }) => <View style={{ marginBottom: space[2] }}><MatchCard match={item} members={members} meId={me?.id} /></View>}
        ListEmptyComponent={rows && filter === 'mine' && rows.length ? (
          <Empty icon={HistoryIcon} title="Nothing of yours yet" body="Your matches show up here once you play."
            action={<Button label="Log a match" icon={Plus} onPress={() => router.push('/log')} />} />
        ) : rows ? (
          <Empty icon={HistoryIcon} title="No matches yet" body="The first result starts the ladder. It takes five seconds."
            action={<Button label="Log a match" icon={Plus} onPress={() => router.push('/log')} />} />
        ) : (
          <View style={{ gap: space[2], marginTop: space[4] }}>{[0, 1, 2].map((i) => <Skeleton key={i} h={150} />)}</View>
        )}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }} tintColor={t.text2} />}
      />
    </Screen>
  );
}
