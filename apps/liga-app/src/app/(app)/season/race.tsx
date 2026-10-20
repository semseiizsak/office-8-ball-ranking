// G3.1 Season race: rating lines over the season (top 8 or around me), tap for a point, then the season table.
import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { nameIn, shortDate } from '@/lib/seasons';
import { useLeague } from '@/providers/league';
import { fmt, space, useTheme } from '@/theme';
import { Card, Screen, Seg, Skeleton, T } from '@/ui';
import { LineChart } from '@/ui/chart';
import { Header } from '@/ui/list-row';
import { StandingRow, useSeasons } from '@/ui/season';

export default function SeasonRace() {
  const { t } = useTheme();
  const { members, me } = useLeague();
  const { data } = useSeasons();
  const [view, setView] = useState<'top' | 'me'>('top');
  const [sel, setSel] = useState<number | null>(null);

  if (!data) return <Screen><Header title="Season race" /><View style={{ padding: space[4] }}><Skeleton h={220} /></View></Screen>;
  const s = data.current;
  const myIdx = s.rows.findIndex((r) => r.id === me?.id);
  const shown = view === 'me' && myIdx >= 0 ? s.rows.slice(Math.max(0, myIdx - 3), myIdx + 4) : s.rows.slice(0, 8);
  // My line goes first so it is the one the finger selects and it stays on top in brand colour.
  const lines = [...shown].sort((a, b) => (a.id === me?.id ? -1 : b.id === me?.id ? 1 : 0));
  const colour = (id: string) => (id === me?.id ? t.brand : t.pct[members.find((m) => m.id === id)?.colour ?? 'ink']);
  const pt = sel !== null ? s.race[sel] : null;

  return (
    <Screen>
      <Header title={`Season ${s.n} race`} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        {myIdx >= 0 ? <Seg options={[{ value: 'top', label: 'Top 8' }, { value: 'me', label: 'Around me' }]} value={view} onChange={(v) => { setView(v); setSel(null); }} /> : null}
        <Card style={{ gap: space[3] }}>
          {s.race.length >= 3 && lines.length ? (
            <>
              <LineChart height={200} peak={false} selected={sel} onSelect={setSel}
                series={lines.map((r) => ({ values: s.race.map((p) => p.ratings[r.id] ?? r.start), color: colour(r.id) }))} />
              {pt ? (
                <View style={{ gap: 4 }}>
                  <T v="label">{shortDate(pt.at)}</T>
                  {lines.map((r) => ({ r, v: pt.ratings[r.id] ?? r.start })).sort((a, b) => b.v - a.v).map(({ r, v }) => (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colour(r.id) }} />
                      <T v="small" style={{ flex: 1 }}>{nameIn(members, r.id, me?.id)}</T>
                      <T v="small">{fmt(v)}</T>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[3] }}>
                  {lines.map((r) => (
                    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: colour(r.id) }} />
                      <T v="caption" c="text2">{nameIn(members, r.id, me?.id)}</T>
                    </View>
                  ))}
                </View>
              )}
            </>
          ) : <T v="small" c="text2">The race chart fills in after a few days.</T>}
        </Card>
        <View style={{ gap: 2 }}>
          <T v="heading" style={{ paddingHorizontal: space[1], paddingBottom: space[2] }}>Season table</T>
          {s.rows.length ? s.rows.map((r) => <StandingRow key={r.id} r={r} members={members} meId={me?.id} />)
            : <T v="small" c="text2">No matches yet this season. The first one starts the race.</T>}
        </View>
      </ScrollView>
    </Screen>
  );
}
