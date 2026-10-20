// G3.6 Season wrap story: up to 4 solid colour pages, tap right for next, left for back, hold to pause.
import { router, useLocalSearchParams } from 'expo-router';
import { Clapperboard, Share2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { seasonWrap, nameIn, type Wrap } from '@/lib/seasons';
import { useLeague } from '@/providers/league';
import { fmt, radius, signed, space, useTheme } from '@/theme';
import { Button, Empty, IconButton, Screen, Skeleton, T } from '@/ui';
import { LineChart } from '@/ui/chart';

const PAGE_MS = 7000;
type Page = 'intro' | 'numbers' | 'moment' | 'final';
type Loaded = { wrap: Wrap; wrapOn: boolean; played: boolean };

export default function SeasonWrap() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { n } = useLocalSearchParams<{ n: string }>();
  const { members, me, league } = useLeague();
  const [data, setData] = useState<Loaded | null>(null);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [prog] = useState(() => new Animated.Value(0));
  const held = useRef(0);

  useEffect(() => {
    if (!league) return;
    (async () => {
      const r = await seasonWrap(league.id, Number(n), me?.id ?? null);
      if (r) setData({ wrap: r.wrap, wrapOn: r.wrapOn, played: r.season.rows.some((x) => x.id === me?.id) });
    })();
  }, [league, n, me?.id]);

  const w = data?.wrap;
  const pages: Page[] = !w || !data?.played ? ['intro'] : w.short ? ['intro', 'final'] : ['intro', 'numbers', 'moment', 'final'];
  const go = (i: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, i));
    if (next === page) return;
    held.current = 0; prog.setValue(0); setPage(next);
  };

  useEffect(() => {
    if (paused || !data) return;
    const anim = Animated.timing(prog, { toValue: 1, duration: PAGE_MS * (1 - held.current), easing: Easing.inOut(Easing.ease), useNativeDriver: false });
    anim.start(({ finished }) => {
      if (!finished) return;
      if (page < pages.length - 1) { held.current = 0; prog.setValue(0); setPage(page + 1); }
    });
    return () => anim.stop();
  }, [page, paused, data, pages.length, prog]);

  const pause = () => { prog.stopAnimation((v) => { held.current = v; }); setPaused(true); };

  if (!data || !w) return <Screen><View style={{ padding: space[4], gap: space[3], paddingTop: space[12] }}><Skeleton h={480} r={radius.lg} /></View></Screen>;
  if (!data.wrapOn) {
    return <Screen><Empty icon={Clapperboard} title="Season wraps are off" body="An admin can turn them on in the season settings." action={<Button label="Close" size="md" onPress={() => router.back()} />} /></Screen>;
  }

  const name = (id: string) => nameIn(members, id, me?.id);
  const kind = pages[page];
  const bg = { intro: t.brand, numbers: t.surface, moment: t.win, final: t.crown }[kind];
  const fg = { intro: t.onBrand, numbers: t.text, moment: t.onWin, final: t.onCrown }[kind];
  const stat = (label: string, value: string) => (
    <View key={label} style={{ width: '50%', paddingVertical: space[2] }}>
      <T v="number" c={fg}>{value}</T>
      <T v="caption" c={fg}>{label}</T>
    </View>
  );
  const rival = w.rival ? `${name(w.rival.id)}, ${w.rival.won} : ${w.rival.lost}` : null;

  const body = () => {
    if (kind === 'intro') {
      return (
        <View style={{ gap: space[5] }}>
          <T v="display" c={fg}>Your season, wrapped</T>
          <T v="heading" c={fg}>Season {w.n}, {w.league}</T>
          <T v="title" c={fg}>{w.matches} matches{'\n'}{w.players} players</T>
          {data.played && w.started && w.peak && w.final ? (
            <T v="heading" c={fg}>Started #{w.started}{'\n'}Peak #{w.peak}{'\n'}Finished #{w.final}</T>
          ) : <T v="heading" c={fg}>No matches for you this season. A new one is already running.</T>}
          {data.played && w.short ? <T v="body" c={fg}>You played {w.played} {w.played === 1 ? 'match' : 'matches'} this season.</T> : null}
        </View>
      );
    }
    if (kind === 'numbers') {
      return (
        <View style={{ gap: space[4] }}>
          <T v="display" c={fg}>Your numbers</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap' }}>
            {stat('played', `${w.played}`)}
            {stat('wins', `${w.won}`)}
            {stat('win rate', `${Math.round((w.won / Math.max(1, w.played)) * 100)}%`)}
            {stat('longest streak', w.bestStreak ? `W${w.bestStreak}` : 'None')}
            {stat('final rating', `${fmt(w.rating ?? 0)} (${signed(w.change)})`)}
            {rival ? stat('most played', rival) : null}
          </View>
          {w.line.length > 2 ? <LineChart series={[{ values: w.line, color: t.brand }]} height={120} /> : null}
        </View>
      );
    }
    if (kind === 'moment') {
      const m = w.moment;
      const opp = (ids: string[]) => ids.map(name).join(' and ');
      return (
        <View style={{ gap: space[4] }}>
          <T v="display" c={fg}>Best moment</T>
          {m?.kind === 'upset' && w.upset ? <T v="title" c={fg}>You beat {opp(w.upset.opps)} with a {Math.round(w.upset.chance * 100)}% chance</T>
            : m?.kind === 'reactions' ? <T v="title" c={fg}>Your match got {m.reactions} reactions</T>
              : w.bestWin ? <T v="title" c={fg}>You beat {opp(w.bestWin.opps)} at {fmt(w.bestWin.oppRating)}</T>
                : <T v="title" c={fg}>Every match counted</T>}
          {w.bestWin ? <T v="heading" c={fg}>Best win: {opp(w.bestWin.opps)}, {signed(w.bestWin.delta)}</T> : null}
          {w.upset ? <T v="heading" c={fg}>Biggest upset: {Math.round(w.upset.chance * 100)}% chance, {signed(w.upset.delta)}</T> : null}
          {w.bestStreak >= 2 ? <T v="heading" c={fg}>Longest streak: {w.bestStreak} wins in a row</T> : null}
          {m ? <Button label="Open the match" size="md" variant="secondary" style={{ alignSelf: 'flex-start' }} onPress={() => { pause(); router.push(`/match/${m.matchId}`); }} /> : null}
        </View>
      );
    }
    return (
      <View style={{ gap: space[4] }}>
        <T v="display" c={fg}>Final standing</T>
        <T v="hero" c={fg} style={{ fontSize: 120, lineHeight: 120 }}>#{w.final}</T>
        <T v="heading" c={fg}>of {w.of} players</T>
        <View style={{ gap: 4 }}>
          {w.podium.map((id, i) => <T key={id} v="heading" c={fg}>{i + 1}. {name(id)}</T>)}
        </View>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Button label="Share your season" icon={Share2} size="md" variant="primary" onPress={() => { pause(); router.push(`/season/recap/${w.n}`); }} />
          <Button label="Close" size="md" variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <Pressable accessibilityRole="button" accessibilityHint="Tap right for next, left for back, hold to pause" delayLongPress={250}
        onPress={(e) => go(e.nativeEvent.locationX > width / 2 ? page + 1 : page - 1)}
        onLongPress={pause} onPressOut={() => { if (paused) setPaused(false); }}
        style={{ flex: 1, paddingTop: insets.top + 72, paddingHorizontal: space[6], paddingBottom: insets.bottom + space[6], justifyContent: 'center' }}>
        {body()}
      </Pressable>
      <View style={{ position: 'absolute', top: insets.top + space[2], left: space[4], right: space[4], gap: space[2] }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {pages.map((p, i) => (
            <View key={p} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.lineStrong, overflow: 'hidden' }}>
              {i < page ? <View style={{ flex: 1, backgroundColor: fg }} />
                : i === page ? <Animated.View style={{ height: 4, backgroundColor: fg, width: prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /> : null}
            </View>
          ))}
        </View>
        <View style={{ alignSelf: 'flex-end' }}>
          <IconButton icon={X} label="Close the story" onPress={() => router.back()} />
        </View>
      </View>
    </View>
  );
}
