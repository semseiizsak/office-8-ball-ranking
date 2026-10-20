// G10 Weekly awards ceremony: a full screen story, one solid colour page per award, tap right for next, left for back, hold to pause.
import { router, useLocalSearchParams } from 'expo-router';
import { Medal, Share2, X } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Pressable, Share, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getAward, nextCeremony, weekRange, type Award, type AwardItem } from '@/lib/awards';
import { dayHm, tzOf } from '@/lib/cup';
import { isOn } from '@/lib/modules';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Icon, IconButton, Screen, Skeleton, T } from '@/ui';
import { AWARD_ICON } from '@/ui/rewards';

const PAGE_MS = 6000;
type Page = { kind: 'intro' } | { kind: 'award'; item: AwardItem } | { kind: 'final' };

export default function AwardsStory() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { league, members, me } = useLeague();
  const [a, setA] = useState<Award | null | undefined>(undefined);
  const [page, setPage] = useState(0);
  const [paused, setPaused] = useState(false);
  const [prog] = useState(() => new Animated.Value(0));
  const [next, setNext] = useState('');
  const held = useRef(0);

  useEffect(() => {
    if (league) (async () => { setA(await getAward(league.id, id)); setNext(dayHm(nextCeremony(Date.now(), tzOf(league)), tzOf(league))); })();
  }, [league, id]);

  const pages: Page[] = !a ? [] : a.quiet ? [{ kind: 'intro' }] : [{ kind: 'intro' }, ...a.items.map((item) => ({ kind: 'award' as const, item })), { kind: 'final' }];
  const go = (i: number) => {
    const next = Math.max(0, Math.min(pages.length - 1, i));
    if (next === page) return;
    held.current = 0; prog.setValue(0); setPage(next);
  };
  useEffect(() => {
    if (paused || !a) return;
    const anim = Animated.timing(prog, { toValue: 1, duration: PAGE_MS * (1 - held.current), easing: Easing.inOut(Easing.ease), useNativeDriver: false });
    anim.start(({ finished }) => {
      if (finished && page < pages.length - 1) { held.current = 0; prog.setValue(0); setPage(page + 1); }
    });
    return () => anim.stop();
  }, [page, paused, a, pages.length, prog]);
  const pause = () => { prog.stopAnimation((v) => { held.current = v; }); setPaused(true); };

  if (!isOn(league, 'awards')) return <Screen><Empty icon={Medal} title="Awards are off in this league" body="An admin can turn on Weekly awards in the league modules." action={<Button label="Close" size="md" onPress={() => router.back()} />} /></Screen>;
  if (a === undefined) return <Screen><View style={{ padding: space[4], paddingTop: space[12] }}><Skeleton h={480} r={radius.lg} /></View></Screen>;
  if (a === null) return <Screen><Empty icon={Medal} title="These awards are gone" body="This week is no longer in the archive." action={<Button label="Close" size="md" onPress={() => router.back()} />} /></Screen>;

  const tz = tzOf(league);
  const who = (mid: string) => members.find((m) => m.id === mid);
  const name = (mid: string) => (mid === me?.id ? 'You' : who(mid)?.display_name ?? 'Someone');
  const names = (ids: string[]) => ids.map(name).join(' and ');
  const coins = isOn(league, 'coins');
  const cur = pages[page] ?? pages[0];
  const palette = [[t.win, t.onWin], [t.surface, t.text], [t.crown, t.onCrown], [t.brand, t.onBrand]] as const;
  const [bg, fg] = cur.kind === 'intro' ? [t.brand, t.onBrand] : cur.kind === 'final' ? [t.crown, t.onCrown] : palette[(page - 1) % palette.length];

  const share = async () => {
    pause();
    const lines = a.items.map((x) => `${x.label}: ${names(x.members)}, ${x.value}`);
    await Share.share({ message: `${league?.name ?? 'League'}, week ${a.week_no} awards\n${lines.join('\n')}` });
  };

  const body = () => {
    if (cur.kind === 'intro') {
      return (
        <View style={{ gap: space[5] }}>
          <T v="display" c={fg}>Week {a.week_no} awards</T>
          <T v="heading" c={fg}>{league?.name}{'\n'}{weekRange(a, tz)}</T>
          {a.quiet ? (
            <>
              <T v="title" c={fg}>Quiet week</T>
              <T v="heading" c={fg}>{a.matches} {a.matches === 1 ? 'match' : 'matches'}, no awards. Next one {next}.</T>
              <Button label="Close" size="md" variant="secondary" style={{ alignSelf: 'flex-start' }} onPress={() => router.back()} />
            </>
          ) : <T v="title" c={fg}>{a.matches} matches{'\n'}{a.items.length} awards</T>}
        </View>
      );
    }
    if (cur.kind === 'award') {
      const it = cur.item;
      const first = who(it.members[0]);
      return (
        <View style={{ gap: space[4] }}>
          <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: fg, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={AWARD_ICON[it.key]} size={30} color={bg} />
          </View>
          <T v="display" c={fg}>{it.label}</T>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {it.members.map((mid) => { const m = who(mid); return m ? <Avatar key={mid} name={m.display_name} colour={m.colour} jersey={m.jersey} size={64} /> : null; })}
          </View>
          <T v="title" c={fg}>{names(it.members)}</T>
          <T v="heading" c={fg}>{it.value}</T>
          {coins && it.coins ? <T v="label" c={fg}>+{it.coins} coins</T> : null}
          <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
            {first ? <Button label="Open profile" size="md" variant="secondary" onPress={() => { pause(); router.push(`/player/${first.id}`); }} /> : null}
            {it.match_id ? <Button label="Open the match" size="md" variant="secondary" onPress={() => { pause(); router.push(`/match/${it.match_id}`); }} /> : null}
          </View>
        </View>
      );
    }
    return (
      <View style={{ gap: space[4] }}>
        <T v="display" c={fg}>That was week {a.week_no}</T>
        <View style={{ gap: space[2] }}>
          {a.items.map((x) => <T key={x.key} v="heading" c={fg}>{x.label}: {names(x.members)}</T>)}
        </View>
        <T v="body" c={fg}>Next ceremony {next}.</T>
        <View style={{ flexDirection: 'row', gap: space[2], flexWrap: 'wrap' }}>
          <Button label="Share" icon={Share2} size="md" variant="primary" onPress={share} />
          <Button label="All weeks" size="md" variant="secondary" onPress={() => { router.back(); router.push('/awards'); }} />
        </View>
      </View>
    );
  };

  return (
    <View style={{ flex: 1, backgroundColor: bg }}>
      <Pressable accessibilityHint="Tap right for next, left for back, hold to pause" delayLongPress={250}
        onPress={(e) => go(e.nativeEvent.pageX > width / 2 ? page + 1 : page - 1)}
        onLongPress={pause} onPressOut={() => { if (paused) setPaused(false); }}
        style={{ flex: 1, paddingTop: insets.top + 72, paddingHorizontal: space[6], paddingBottom: insets.bottom + space[6], justifyContent: 'center' }}>
        {body()}
      </Pressable>
      <View style={{ position: 'absolute', top: insets.top + space[2], left: space[4], right: space[4], gap: space[2] }}>
        <View style={{ flexDirection: 'row', gap: 4 }}>
          {pages.map((p, i) => (
            <View key={i} style={{ flex: 1, height: 4, borderRadius: 2, backgroundColor: t.lineStrong, overflow: 'hidden' }}>
              {i < page ? <View style={{ flex: 1, backgroundColor: fg }} />
                : i === page ? <Animated.View style={{ height: 4, backgroundColor: fg, width: prog.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }) }} /> : null}
            </View>
          ))}
        </View>
        <View style={{ alignSelf: 'flex-end' }}>
          <IconButton icon={X} label="Close the ceremony" onPress={() => router.back()} />
        </View>
      </View>
    </View>
  );
}
