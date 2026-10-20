// K7.2 Season recap card: my season in one card, three variants, shared as text until image export lands.
import { useLocalSearchParams } from 'expo-router';
import { Share2, Trophy } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';

import { nameIn, seasonWrap, WRAP_MIN, type Wrap } from '@/lib/seasons';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Button, Empty, Screen, Seg, Skeleton, T } from '@/ui';
import { LineChart } from '@/ui/chart';
import { Header } from '@/ui/list-row';

type Variant = 'rank' | 'stats' | 'rival';

export default function SeasonRecap() {
  const { t } = useTheme();
  const { n } = useLocalSearchParams<{ n: string }>();
  const { members, me, league } = useLeague();
  const [w, setW] = useState<Wrap | null>(null);
  const [variant, setVariant] = useState<Variant>('rank');

  useEffect(() => {
    if (!league) return;
    (async () => { const r = await seasonWrap(league.id, Number(n), me?.id ?? null); if (r) setW(r.wrap); })();
  }, [league, n, me?.id]);

  if (!w) return <Screen><Header title="Recap card" /><View style={{ padding: space[4] }}><Skeleton h={420} r={radius.lg} /></View></Screen>;
  if (w.played < WRAP_MIN) return <Screen><Header title="Recap card" /><Empty icon={Trophy} title="No recap card this time" body={`Play ${WRAP_MIN} matches next season to get a recap card.`} /></Screen>;

  const rate = Math.round((w.won / w.played) * 100);
  const title = w.titles.find((x) => x.who === me?.id);
  const rival = w.rival ? `${nameIn(members, w.rival.id)} ${w.rival.won} : ${w.rival.lost}` : null;
  const share = () => Share.share({
    message: [`Season ${w.n}, ${w.league}`, `#${w.final} of ${w.of}`, `${w.played} matches, ${w.won} wins, ${rate}%`,
      w.peakRating ? `Peak ${fmt(w.peakRating)}` : '', w.bestStreak >= 2 ? `${w.bestStreak} in a row` : '', title ? title.label : '', rival ? `Top rival ${rival}` : '', 'Played on Liga']
      .filter(Boolean).join('\n'),
  });

  const line = (label: string, value: string) => (
    <View key={label} style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
      <T v="body" c="onBrand">{label}</T>
      <T v="heading" c="onBrand">{value}</T>
    </View>
  );

  return (
    <Screen>
      <Header title="Recap card" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        <Seg options={[{ value: 'rank', label: 'Rank' }, { value: 'stats', label: 'Stats' }, { value: 'rival', label: 'Rival' }]} value={variant} onChange={setVariant} />
        <View style={{ backgroundColor: t.brand, borderRadius: radius.lg, padding: space[6], gap: space[4], aspectRatio: 9 / 14 }}>
          <T v="heading" c="onBrand">Season {w.n}, {w.league}</T>
          {variant === 'rank' ? (
            <View style={{ flex: 1, justifyContent: 'center', gap: space[2] }}>
              <T v="hero" c="onBrand" style={{ fontSize: 112, lineHeight: 112 }}>#{w.final}</T>
              <T v="heading" c="onBrand">of {w.of} players</T>
              {title ? <T v="section" c="onBrand">{title.label}</T> : null}
            </View>
          ) : variant === 'stats' ? (
            <View style={{ flex: 1, justifyContent: 'center', gap: space[3] }}>
              {line('Matches', `${w.played}`)}
              {line('Wins', `${w.won}, ${rate}%`)}
              {w.peakRating ? line('Peak', fmt(w.peakRating)) : null}
              {line('Best streak', w.bestStreak >= 2 ? `${w.bestStreak} in a row` : 'None')}
              {line('Season change', signed(w.change))}
            </View>
          ) : (
            <View style={{ flex: 1, justifyContent: 'center', gap: space[2] }}>
              <T v="label" c="onBrand">Top rival</T>
              <T v="title" c="onBrand">{rival ?? 'Everyone'}</T>
              {w.line.length > 2 ? <LineChart series={[{ values: w.line, color: t.onBrand }]} height={110} peak={false} /> : null}
            </View>
          )}
          <T v="section" c="onBrand">Liga</T>
        </View>
        <Button label="Share" icon={Share2} onPress={share} />
      </ScrollView>
    </Screen>
  );
}
