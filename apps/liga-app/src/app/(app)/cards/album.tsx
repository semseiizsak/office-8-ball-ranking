// G8.1 Album: season switcher plus Specials, filter All, Got, Need, Spares, sort, 3 column grid with missing outlines.
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { BookOpen } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, useWindowDimensions, View } from 'react-native';

import { album, cardsHub, RARITIES, type AlbumSlot } from '@/lib/cards';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Empty, Screen, Seg, Skeleton, T } from '@/ui';
import { CollectCard, MissingCard } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';

type Filter = 'all' | 'got' | 'need' | 'spares';
type Sort = 'number' | 'rarity' | 'player';
type Data = Awaited<ReturnType<typeof album>>;

export default function Album() {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { league, me, members } = useLeague();
  const params = useLocalSearchParams<{ member?: string }>();
  const memberId = params.member ?? me?.id ?? null;
  const [sets, setSets] = useState<number[] | null>(null);
  const [set, setSet] = useState<number | 'specials' | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [sort, setSort] = useState<Sort>('number');
  const [data, setData] = useState<Data | null>(null);

  useFocusEffect(useCallback(() => {
    if (!session || !league || !memberId) return;
    (async () => {
      const h = await cardsHub(session.user, league.id);
      setSets(h.sets);
      const pick = set ?? h.set;
      if (set === null) setSet(pick);
      setData(await album(league.id, memberId, pick));
    })();
  }, [session, league, memberId, set]));

  const owner = members.find((m) => m.id === memberId);
  const mine = memberId === me?.id;
  const title = mine ? 'Album' : `${owner?.display_name ?? 'Their'} album`;
  if (!sets || !data || set === null) return <Screen><Header title={title} /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={44} /><Skeleton h={300} /></View></Screen>;

  const w = Math.floor((width - space[4] * 2 - space[2] * 2) / 3);
  const shown = data.slots
    .filter((s) => filter === 'all' || (filter === 'got' && s.got) || (filter === 'need' && !s.got) || (filter === 'spares' && s.card.count > 1))
    .sort((a, b) => sort === 'number' ? a.no - b.no : sort === 'rarity' ? RARITIES.indexOf(b.card.rarity) - RARITIES.indexOf(a.card.rarity) || a.no - b.no : a.card.name.localeCompare(b.card.name) || a.no - b.no);
  const chip = (value: number | 'specials', label: string) => {
    const on = value === set;
    return (
      <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { setData(null); setSet(value); }}
        style={{ height: 44, justifyContent: 'center' }}>
        <View style={{ height: 36, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? t.primary : t.surface2, justifyContent: 'center' }}>
          <T v="label" c={on ? 'onPrimary' : 'text'}>{label}</T>
        </View>
      </Pressable>
    );
  };
  const slot = (s: AlbumSlot) => (
    <Pressable key={s.key} accessibilityRole="button" onPress={() => router.push(`/cards/card?key=${encodeURIComponent(s.key)}${mine ? '' : `&member=${memberId}`}` as Href)}>
      {s.got ? <CollectCard card={s.card} w={w} count={s.card.count} /> : <MissingCard no={s.no} w={w} name={s.card.name} />}
    </Pressable>
  );

  return (
    <Screen>
      <Header title={title} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 64 }}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
          {[...sets].reverse().map((n) => chip(n, `Season ${n}`))}
          {chip('specials', 'Specials')}
        </ScrollView>
        {set !== 'specials' ? <Seg options={[{ value: 'all', label: 'All' }, { value: 'got', label: 'Got' }, { value: 'need', label: 'Need' }, { value: 'spares', label: 'Spares' }]} value={filter} onChange={setFilter} /> : null}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
          <T v="label" c="text2">{set === 'specials' ? `${data.got} special ${data.got === 1 ? 'edition' : 'editions'}` : data.retro ? `Retro, read only, ${data.got} of ${data.total}` : `${data.got} of ${data.total}`}</T>
          <Pressable accessibilityRole="button" accessibilityLabel={`Sort by ${sort === 'number' ? 'rarity' : sort === 'rarity' ? 'player' : 'number'}`} hitSlop={8}
            onPress={() => setSort(sort === 'number' ? 'rarity' : sort === 'rarity' ? 'player' : 'number')} style={{ minHeight: 44, justifyContent: 'center' }}>
            <T v="label" c="text2">Sort: {sort}</T>
          </Pressable>
        </View>
        {shown.length ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{shown.map(slot)}</View>
        ) : (
          <Empty icon={BookOpen} title={set === 'specials' ? 'No special editions yet' : filter === 'spares' ? 'No spares yet' : filter === 'need' ? 'Nothing missing' : 'Nothing here yet'}
            body={set === 'specials' ? 'Hold the crown, win a cup or a season. Specials are never in packs.' : filter === 'spares' ? 'Duplicates land here.' : 'Open packs to fill the album.'} />
        )}
      </ScrollView>
    </Screen>
  );
}
