// G5.5 Weekly chest: fixed contents listed up front, never random. Opens when all three weekly quests are claimed.
// The lid lifts in 400 ms and the items rise one after another, ease in out; reduced motion shows them at once.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Coins, Gift, Package, X } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { chestState, openChest, type ChestView } from '@/lib/pass';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { motion, radius, space, useTheme } from '@/theme';
import { Button, Icon, IconButton, T } from '@/ui';

const ease = Easing.bezier(...motion.easing);

export default function Chest() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const { league } = useLeague();
  const [c, setC] = useState<ChestView | null>(null);
  const [got, setGot] = useState<{ coins: number; packId: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [a] = useState(() => ({ lid: new Animated.Value(0), items: [0, 1].map(() => new Animated.Value(0)) }));
  useFocusEffect(useCallback(() => { if (session && league) (async () => setC(await chestState(session.user, league.id)))(); }, [session, league]));

  const open = async () => {
    if (!session || !league) return;
    setBusy(true);
    try {
      const r = await openChest(session.user, league.id);
      setGot(r);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      const all = [a.lid, ...a.items];
      if (await AccessibilityInfo.isReduceMotionEnabled()) all.forEach((v) => v.setValue(1));
      else Animated.sequence([
        Animated.timing(a.lid, { toValue: 1, duration: 400, easing: ease, useNativeDriver: true }),
        Animated.stagger(90, a.items.map((v) => Animated.timing(v, { toValue: 1, duration: motion.base, easing: ease, useNativeDriver: true }))),
      ]).start();
    } catch { setC(await chestState(session.user, league.id)); }
    setBusy(false);
  };

  const rise = (v: Animated.Value) => ({ opacity: v, transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) }] });
  const item = (i: number, icon: typeof Coins, label: string) => (
    <Animated.View key={label} style={[{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: t.surface, borderRadius: radius.md, padding: space[4] }, got ? rise(a.items[i]) : null]}>
      <Icon as={icon} size={22} color={icon === Coins ? t.crown : t.text} />
      <T v="heading">{label}</T>
    </Animated.View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: t.bg, paddingTop: insets.top + space[2], paddingBottom: insets.bottom + space[4], paddingHorizontal: space[5] }}>
      <View style={{ alignItems: 'flex-end' }}><IconButton icon={X} label="Close" tone="ghost" onPress={() => router.back()} /></View>
      <View style={{ flex: 1, justifyContent: 'center', gap: space[4] }}>
        <View style={{ alignItems: 'center' }}>
          <Animated.View style={{ width: 128, height: 28, borderRadius: radius.xs, backgroundColor: c?.ready || got ? t.crown : t.surface3,
            transform: [{ translateY: a.lid.interpolate({ inputRange: [0, 1], outputRange: [0, -28] }) }, { rotate: a.lid.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '-12deg'] }) }] }} />
          <View style={{ width: 120, height: 84, borderRadius: radius.xs, marginTop: 4, backgroundColor: c?.ready || got ? t.crown : t.surface2, borderWidth: c?.ready || got ? 0 : 2, borderColor: t.lineStrong, alignItems: 'center', justifyContent: 'center' }}>
            <Icon as={Gift} size={36} color={c?.ready || got ? t.onCrown : t.text3} />
          </View>
        </View>
        <T v="title" center>{got ? 'Chest opened' : c?.opened ? 'Opened this week' : c?.ready ? 'Weekly chest ready' : 'Weekly chest'}</T>
        <T c="text2" center>{got ? 'Added to your wallet and your packs.' : c?.opened ? 'A new chest comes with next week’s quests.' : c?.ready ? 'You finished all three weekly quests.' : c ? `Claim all three weekly quests to open it. ${c.done} of ${c.total} so far.` : ''}</T>
        {c?.contents.length ? (
          <View style={{ gap: space[2] }}>
            {!got ? <T v="label" c="text2">Contains</T> : null}
            {item(0, Coins, c.contents[0])}
            {c.contents[1] ? item(1, Package, c.contents[1]) : null}
          </View>
        ) : null}
      </View>
      {got ? (
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          {got.packId ? <Button label="Open the pack" variant="secondary" style={{ flex: 1 }} onPress={() => router.replace(`/cards/open?id=${got.packId}` as Href)} /> : null}
          <Button label="Done" style={{ flex: 1 }} onPress={() => router.back()} />
        </View>
      ) : c?.ready ? <Button label="Open chest" loading={busy} onPress={open} />
        : <Button label="See quests" variant="secondary" onPress={() => router.replace('/quests' as Href)} />}
    </View>
  );
}
