// G4.4 Unlock moment, M2.2 Unlocked, G5.2 Level up: one 1.3 s scene for one reward, one combined sheet for several.
// Ease in out, no bounce; reduced motion shows the finished card at once.
import * as Haptics from 'expo-haptics';
import { router, type Href } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, Share, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Path } from 'react-native-svg';

import { takeCelebrations, type Celebration } from '@/lib/badges';
import { BADGE, TIER_LABEL } from '@/lib/progress-engine';
import { levelName } from '@/lib/xp';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { font, motion, radius, space, useTheme } from '@/theme';
import { T } from '@/ui';
import { LevelHex, Medal } from '@/ui/badges-kit';

const ease = Easing.bezier(...motion.easing);
const RAYS = Array.from({ length: 16 }, (_, i) => {
  const c = 360, r = 360, a0 = (i * 22.5 * Math.PI) / 180, a1 = ((i * 22.5 + 9) * Math.PI) / 180;
  return `M ${c} ${c} L ${c + r * Math.sin(a0)} ${c - r * Math.cos(a0)} L ${c + r * Math.sin(a1)} ${c - r * Math.cos(a1)} Z`;
});

const describe = (c: Celebration) => {
  if (c.kind === 'level') return { title: `Level ${c.level} reached`, body: `${levelName(c.level)}. Every match adds XP.`, href: '/badges/progress' };
  const b = BADGE.get(c.id)!;
  return { title: b.name, body: `${b.rule(b.goals[c.step])}.`, tier: b.tiers[c.step], icon: b.icon, href: `/badges/${c.id}` };
};

export default function Unlock() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { league } = useLeague();
  const { session } = useAuth();
  const [list, setList] = useState<Celebration[] | null>(null);
  const [a] = useState(() => ({ medal: new Animated.Value(0), rays: new Animated.Value(0), text: new Animated.Value(0), act: new Animated.Value(0) }));

  useEffect(() => {
    if (!league || !session) return;
    (async () => {
      const got = await takeCelebrations(session.user, league.id);
      if (!got.length) { router.back(); return; }
      setList(got);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const reduce = await AccessibilityInfo.isReduceMotionEnabled();
      const all = [a.medal, a.rays, a.text, a.act];
      if (reduce) { all.forEach((v) => v.setValue(1)); return; }
      const run = (v: Animated.Value, duration: number, delay = 0) => Animated.timing(v, { toValue: 1, duration, delay, easing: ease, useNativeDriver: true });
      Animated.parallel([run(a.medal, 760), run(a.rays, 900), run(a.text, 520, 420), run(a.act, 420, 880)]).start();
    })();
  }, [league, session, a]);

  if (!list) return <View style={{ flex: 1, backgroundColor: t.brand }} />;
  const close = () => router.back();
  const rise = (v: Animated.Value) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] });
  const light = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: '#FFFFFF', alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Text style={{ fontFamily: font.bold, fontSize: 16, color: '#0A0A0A' }}>{label}</Text>
    </Pressable>
  );
  const dark = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ flex: 1, height: 52, borderRadius: radius.pill, backgroundColor: t.brandPress, alignItems: 'center', justifyContent: 'center', transform: [{ scale: pressed ? 0.97 : 1 }] })}>
      <Text style={{ fontFamily: font.bold, fontSize: 16, color: t.onBrand }}>{label}</Text>
    </Pressable>
  );
  const shell = (children: ReactNode) => (
    <View style={{ flex: 1, backgroundColor: t.brand, paddingTop: insets.top + space[6], paddingBottom: insets.bottom + space[4], paddingHorizontal: space[5], overflow: 'hidden' }}>{children}</View>
  );

  // Several at once: one combined sheet, never a scene per item.
  if (list.length > 1) {
    const badges = list.filter((c) => c.kind === 'badge').length;
    const title = badges === list.length ? `${badges} new badges` : `${list.length} new rewards`;
    return shell(
      <>
        <Animated.View style={[{ alignItems: 'center', gap: space[2], marginBottom: space[5] }, rise(a.text)]}>
          <T v="title" c="onBrand" center>{title}</T>
          <T c="onBrand" center>Nice work. Tap one to see it.</T>
        </Animated.View>
        <ScrollView contentContainerStyle={{ gap: space[2] }}>
          {list.map((c, i) => {
            const x = describe(c);
            return (
              <Animated.View key={i} style={rise(a.medal)}>
                <Pressable accessibilityRole="button" onPress={() => router.replace(x.href as Href)}
                  style={({ pressed }) => ({ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[3], borderRadius: radius.md, backgroundColor: pressed ? t.bg : t.brandPress })}>
                  {c.kind === 'level' ? <LevelHex level={c.level} size={44} tone="light" /> : <Medal tier={x.tier!} icon={x.icon!} size={48} />}
                  <View style={{ flex: 1 }}>
                    <T v="heading" c="onBrand">{x.title}{x.tier ? `, ${TIER_LABEL[x.tier]}` : ''}</T>
                    <T v="small" c="onBrand">{x.body}</T>
                  </View>
                </Pressable>
              </Animated.View>
            );
          })}
        </ScrollView>
        <Animated.View style={[{ flexDirection: 'row', gap: space[2], marginTop: space[4] }, rise(a.act)]}>{light('Nice', close)}</Animated.View>
      </>,
    );
  }

  const c = list[0], x = describe(c);
  const share = () => Share.share({ message: c.kind === 'level' ? `Level ${c.level} in ${league?.name} 🎉` : `I earned ${x.title}, ${TIER_LABEL[x.tier!]} 🏅\n${x.body}\n${league?.name ?? ''}` });
  return shell(
    <View style={{ flex: 1 }}>
      <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={close} style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      <Animated.View pointerEvents="none" style={{ position: 'absolute', left: '50%', top: 170, width: 720, height: 720, marginLeft: -360, marginTop: -360,
        opacity: a.rays, transform: [{ scale: a.rays.interpolate({ inputRange: [0, 1], outputRange: [0.7, 1] }) }] }}>
        <Svg width={720} height={720}>{RAYS.map((d, i) => <Path key={i} d={d} fill={t.brandPress} />)}</Svg>
      </Animated.View>
      <View pointerEvents="box-none" style={{ alignItems: 'center', gap: space[4], marginTop: space[8] }}>
        <Animated.View style={{ opacity: a.medal, transform: [
          { scale: a.medal.interpolate({ inputRange: [0, 1], outputRange: [0.55, 1] }) },
          { rotate: a.medal.interpolate({ inputRange: [0, 1], outputRange: ['-14deg', '0deg'] }) }] }}>
          {c.kind === 'level' ? <LevelHex level={c.level} size={150} tone="light" /> : <Medal tier={x.tier!} icon={x.icon!} size={176} />}
        </Animated.View>
        <Animated.View style={[{ alignItems: 'center', gap: space[2], marginTop: space[4] }, rise(a.text)]}>
          <T v="title" c="onBrand" center>{c.kind === 'level' ? x.title : 'Badge unlocked'}</T>
          {c.kind === 'badge' ? <T v="heading" c="onBrand" center>{x.title}, {TIER_LABEL[x.tier!]}</T> : null}
          <T c="onBrand" center style={{ maxWidth: 300 }}>{x.body}</T>
        </Animated.View>
      </View>
      <Animated.View style={[{ flexDirection: 'row', gap: space[2], marginTop: 'auto' }, rise(a.act)]}>
        {light('Nice', close)}
        {dark(c.kind === 'level' ? 'See level' : 'See badge', () => router.replace(x.href as Href))}
      </Animated.View>
      <Animated.View style={[{ alignItems: 'center', marginTop: space[2] }, rise(a.act)]}>
        <Pressable accessibilityRole="button" onPress={share} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: space[4] }}>
          <T v="label" c="onBrand">Share</T>
        </Pressable>
      </Animated.View>
    </View>,
  );
}
