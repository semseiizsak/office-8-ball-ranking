// G8.2 Pack opening and G8.5 Set complete. Tap the pack to open, then the 3 cards flip one by one, the rarest last.
// Each reveal is at most 1.4 s (Mythic), ease in out, no bounce. Legendary and Mythic switch the scene to the
// rarity colour. Skip jumps to the summary. Reduced motion shows all three cards at once with a fade.
import * as Haptics from 'expo-haptics';
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { X } from 'lucide-react-native';
import { useEffect, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, Share, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { nextPack, openPack, packById, PACK, PITY, SET_REWARD, type Opened, type Pack, type Rarity } from '@/lib/cards';
import { looks } from '@/lib/shop';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, motion, radius, space, useTheme } from '@/theme';
import { IconButton, T } from '@/ui';
import { CardBack, CollectCard, PackArt } from '@/ui/cards-kit';

const ease = Easing.bezier(...motion.easing);
const REVEAL: Record<Rarity, number> = { common: 600, uncommon: 600, rare: 700, epic: 800, legendary: 1000, mythic: 1400 };
const SCENE: Partial<Record<Rarity, { bg: string; fg: string }>> = { legendary: { bg: '#F2B705', fg: '#0A0A0A' }, mythic: { bg: '#5B3DF5', fg: '#FFFFFF' } };
const ordinal = (n: number) => `${n}${n % 10 === 1 && n % 100 !== 11 ? 'st' : n % 10 === 2 && n % 100 !== 12 ? 'nd' : n % 10 === 3 && n % 100 !== 13 ? 'rd' : 'th'}`;

type Phase = 'closed' | 'opening' | 'reveal' | 'summary' | 'set' | 'error';

export default function OpenPack() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { session } = useAuth();
  const { league } = useLeague();
  const params = useLocalSearchParams<{ id?: string }>();
  const [pack, setPack] = useState<Pack | null>(null);
  const [res, setRes] = useState<Opened | null>(null);
  const [phase, setPhase] = useState<Phase>('closed');
  const [i, setI] = useState(0);
  const [shown, setShown] = useState(false); // current card turned
  const [reduce, setReduce] = useState(false);
  const [back, setBack] = useState('#5B3DF5');
  const [more, setMore] = useState<Pack | null>(null);
  const [a] = useState(() => ({ flip: new Animated.Value(0), scene: new Animated.Value(0), fade: new Animated.Value(0), lift: new Animated.Value(0) }));

  useEffect(() => {
    if (!session || !league) return;
    (async () => {
      setReduce(await AccessibilityInfo.isReduceMotionEnabled());
      const p = params.id ? await packById(session.user, league.id, params.id) : await nextPack(session.user, league.id);
      if (!p) { router.back(); return; }
      setPack(p);
      setBack((await looks(league.id, p.member_id)).back);
    })();
  }, [session, league, params.id]);

  const run = (v: Animated.Value, to: number, duration: number) => new Promise<void>((done) => Animated.timing(v, { toValue: to, duration, easing: ease, useNativeDriver: true }).start(() => done()));

  const open = async () => {
    if (!session || !league || !pack || phase === 'opening') return;
    setPhase('opening');
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    try {
      const [r] = await Promise.all([openPack(session.user, league.id, pack.id), reduce ? Promise.resolve() : run(a.lift, 1, motion.slow)]);
      setRes(r);
      setMore(await nextPack(session.user, league.id));
      if (reduce) { a.fade.setValue(0); setPhase('summary'); run(a.fade, 1, motion.base); return; }
      a.flip.setValue(0); a.scene.setValue(0); setI(0); setShown(false); setPhase('reveal');
    } catch {
      a.lift.setValue(0);
      setPhase('error');
    }
  };

  const reveal = async () => {
    if (!res || shown) return;
    const c = res.cards[i];
    setShown(true);
    Haptics.impactAsync(['legendary', 'mythic'].includes(c.rarity) ? Haptics.ImpactFeedbackStyle.Heavy : Haptics.ImpactFeedbackStyle.Light);
    const d = REVEAL[c.rarity];
    await Promise.all([run(a.flip, 1, d), SCENE[c.rarity] ? run(a.scene, 1, Math.min(d, 600)) : Promise.resolve()]);
  };
  const next = () => {
    if (!res) return;
    if (i + 1 >= res.cards.length) { finish(); return; }
    a.flip.setValue(0); a.scene.setValue(0); setShown(false); setI(i + 1);
  };
  const finish = () => {
    a.scene.setValue(0); a.fade.setValue(reduce ? 0 : 1); setPhase('summary');
    if (reduce) run(a.fade, 1, motion.base);
  };
  const again = () => {
    if (!more) return;
    setPack(more); setRes(null); setMore(null); a.lift.setValue(0); setPhase('closed');
  };

  const card = res?.cards[i];
  const scene = phase === 'reveal' && card && shown ? SCENE[card.rarity] : undefined;
  const fg = scene?.fg ?? t.text;
  const w = Math.min(280, width - space[6] * 2);
  const mini = Math.floor((width - space[5] * 2 - space[2] * 2) / 3);
  const front = a.flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg'] });
  const rear = a.flip.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'] });
  const pill = (label: string, onPress: () => void, primary = true) => (
    <Pressable key={label} accessibilityRole="button" onPress={onPress}
      style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: primary ? t.primary : t.surface2, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Text style={{ fontFamily: font.bold, fontSize: 16, color: primary ? t.onPrimary : t.text }}>{label}</Text>
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[4], paddingHorizontal: space[5] }}>
      {card ? <Animated.View pointerEvents="none" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: SCENE[card.rarity]?.bg ?? t.bg, opacity: a.scene }} /> : null}
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', minHeight: 44 }}>
        {phase === 'reveal' ? (
          <Pressable accessibilityRole="button" onPress={finish} hitSlop={8} style={{ minHeight: 44, justifyContent: 'center' }}><T v="label" c={fg}>Skip</T></Pressable>
        ) : <View />}
        <IconButton icon={X} label="Close" tone="ghost" onPress={() => router.back()} />
      </View>

      {phase === 'closed' || phase === 'opening' || phase === 'error' ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[5] }}>
          {pack ? (
            <>
              <T v="title" center>{PACK[pack.kind].name}</T>
              <Pressable accessibilityRole="button" accessibilityLabel="Open the pack" onPress={open} disabled={phase === 'opening'}>
                <Animated.View style={{ transform: [{ translateY: a.lift.interpolate({ inputRange: [0, 1], outputRange: [0, -40] }) }, { scale: a.lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] }) }] }}>
                  <PackArt kind={pack.kind} w={Math.min(200, width * 0.5)} label={`${pack.kind === 'retro' ? 'Earlier seasons' : `Season ${pack.set}`}`} />
                </Animated.View>
              </Pressable>
              <T c="text2" center>{phase === 'error' ? 'Couldn’t open it. The pack is still yours.' : phase === 'opening' ? 'Opening' : `${pack.reason}. Tap to open.`}</T>
              {phase === 'error' ? <View style={{ flexDirection: 'row', alignSelf: 'stretch' }}>{pill('Try again', open)}</View> : null}
            </>
          ) : null}
        </View>
      ) : null}

      {phase === 'reveal' && card && res ? (
        <Pressable accessibilityRole="button" accessibilityLabel={shown ? (i + 1 < res.cards.length ? 'Next card' : 'See all three') : `Reveal card ${i + 1} of ${res.cards.length}`}
          onPress={shown ? next : reveal} style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: space[5] }}>
          <T v="label" c={fg}>Card {i + 1} of {res.cards.length}</T>
          <View style={{ width: w, height: Math.round(w * 1.4) }}>
            <Animated.View style={{ position: 'absolute', backfaceVisibility: 'hidden', transform: [{ perspective: 900 }, { rotateY: rear }] }}><CardBack colour={back} w={w} /></Animated.View>
            <Animated.View style={{ position: 'absolute', backfaceVisibility: 'hidden', transform: [{ perspective: 900 }, { rotateY: front }] }}><CollectCard card={card} w={w} full /></Animated.View>
          </View>
          <T v="heading" c={fg} center>{shown ? `${card.name}, ${card.label}${res.fresh.includes(card.key) ? ', new' : ', a spare'}` : 'Tap to reveal'}</T>
        </Pressable>
      ) : null}

      {phase === 'summary' && res ? (
        <Animated.View style={{ flex: 1, justifyContent: 'center', gap: space[5], opacity: a.fade }}>
          <T v="title" center>{res.fresh.length ? `${res.fresh.length} new for your album` : 'All spares this time'}</T>
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: space[2] }}>
            {res.cards.map((c, k) => (
              <Pressable key={`${c.key}${k}`} accessibilityRole="button" onPress={() => router.push(`/cards/card?key=${encodeURIComponent(c.key)}` as Href)} style={{ alignItems: 'center', gap: space[2] }}>
                <CollectCard card={c} w={mini} />
                <View style={{ height: 24, paddingHorizontal: 10, borderRadius: radius.pill, backgroundColor: res.fresh.includes(c.key) ? t.win : t.surface3, justifyContent: 'center' }}>
                  <T v="caption" c={res.fresh.includes(c.key) ? 'onWin' : 'text'}>{res.fresh.includes(c.key) ? 'New' : 'Spare'}</T>
                </View>
              </Pressable>
            ))}
          </View>
          <T v="small" c="text2" center>{res.pity} of {PITY} packs to a guaranteed Legendary</T>
          <View style={{ flexDirection: 'row', gap: space[2] }}>
            {more ? pill('Open next', again, false) : null}
            {pill(res.setDone ? 'Continue' : 'Done', () => (res.setDone ? setPhase('set') : router.back()))}
          </View>
        </Animated.View>
      ) : null}

      {phase === 'set' && res?.setDone ? (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: space[3] }}>
          <T v="display" center>Season {res.setDone.set} album complete</T>
          <T v="bigNumber" c="win">+{SET_REWARD}</T>
          <T c="text2" center>coins, added to your wallet.{'\n'}{ordinal(res.setDone.place)} in the league to finish.</T>
          <View style={{ flexDirection: 'row', gap: space[2], alignSelf: 'stretch', marginTop: space[4] }}>
            {pill('Share', () => Share.share({ message: `I completed the Season ${res.setDone!.set} album in our Liga league.` }), false)}
            {pill('Collect', () => router.back())}
          </View>
        </View>
      ) : null}
    </View>
  );
}
