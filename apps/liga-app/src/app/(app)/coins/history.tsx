// G6.1 Coin history: filter chips, rows grouped by day with a running balance, Load more by 30. Tap opens G6.2.
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Coins } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { coinHistory, type Filter, type Line } from '@/lib/coins';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, radius, space, useTheme } from '@/theme';
import { Button, Empty, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { byDay, EntrySheet, LedgerRow } from '@/ui/rewards';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' }, { value: 'earned', label: 'Earned' }, { value: 'matches', label: 'Matches' }, { value: 'cup', label: 'Cup' },
  { value: 'quests', label: 'Quests' }, { value: 'awards', label: 'Awards' }, { value: 'corrections', label: 'Corrections' },
];
const PAGE = 30;

export default function CoinHistory() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members } = useLeague();
  const { member } = useLocalSearchParams<{ member?: string }>(); // admins open someone else's history for a dispute
  const [filter, setFilter] = useState<Filter>('all');
  const [limit, setLimit] = useState(PAGE);
  const [data, setData] = useState<{ rows: Line[]; more: boolean } | null>(null);
  const [open, setOpen] = useState<Line | null>(null);
  const [failed, setFailed] = useState(false);

  useFocusEffect(useCallback(() => {
    if (!session || !league) return;
    (async () => {
      try { setData(await coinHistory(session.user, league.id, filter, limit, member)); setFailed(false); } catch { setFailed(true); }
    })();
  }, [session, league, filter, limit, member]));

  const who = member ? members.find((m) => m.id === member)?.display_name : null;
  const title = who ? `${who}'s coins` : 'Coin history';
  if (!isOn(league, 'coins')) return <Screen><Header title={title} /><Empty icon={Coins} title="Coins are off in this league" body="An admin can turn them on in the league modules." /></Screen>;
  if (failed) return <Screen><Header title={title} /><Empty icon={Coins} title="Only your own history" body="Admins can open anyone's history from the members list." action={<Button label="Back" size="md" variant="secondary" onPress={() => router.back()} />} /></Screen>;

  const chip = (f: { value: Filter; label: string }) => {
    const on = f.value === filter;
    return (
      <Pressable key={f.value} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { setFilter(f.value); setLimit(PAGE); }}
        style={{ height: 44, justifyContent: 'center' }}>
        <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? t.primary : t.surface2, justifyContent: 'center' }}>
          <T style={{ fontFamily: font.semibold, fontSize: 14, color: on ? t.onPrimary : t.text2 }}>{f.label}</T>
        </View>
      </Pressable>
    );
  };

  return (
    <Screen>
      <Header title={title} />
      <View>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2] }}>
          {FILTERS.map(chip)}
        </ScrollView>
      </View>
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        {!data ? <View style={{ gap: space[3] }}><Skeleton h={200} /><Skeleton h={140} /></View>
          : !data.rows.length ? <Empty icon={Coins} title="Nothing here yet" body={filter === 'all' ? 'Play a match to earn your first coins.' : 'No entries of this kind yet.'} />
            : byDay(data.rows).map((g) => (
              <View key={g.day} style={{ gap: space[2] }}>
                <T v="label" c="text2" style={{ paddingHorizontal: space[1] }}>{g.day}</T>
                <View style={{ backgroundColor: t.surface, borderRadius: radius.md, overflow: 'hidden' }}>
                  {g.rows.map((e, i) => <LedgerRow key={e.id} e={e} first={i === 0} onPress={() => setOpen(e)} />)}
                </View>
              </View>
            ))}
        {data?.more ? <Button label="Load more" variant="secondary" size="md" onPress={() => setLimit(limit + PAGE)} /> : null}
      </ScrollView>
      <EntrySheet e={open} onClose={() => setOpen(null)} />
    </Screen>
  );
}
