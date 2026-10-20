// G8.3 Card detail: the full card with stats, flip to the back, how many you own, how many players own it.
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowLeftRight, Recycle, RotateCcw, Share2 } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, ScrollView, Share, useWindowDimensions, View } from 'react-native';

import { cardDetail } from '@/lib/cards';
import { looks } from '@/lib/shop';
import { useLeague } from '@/providers/league';
import { motion, radius, space, useTheme } from '@/theme';
import { Button, Pill, Screen, Skeleton, T } from '@/ui';
import { CardBack, CollectCard } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';

type Data = Awaited<ReturnType<typeof cardDetail>>;
const ease = Easing.bezier(...motion.easing);

export default function CardDetail() {
  const { t } = useTheme();
  const { width } = useWindowDimensions();
  const { league, me } = useLeague();
  const { key, member } = useLocalSearchParams<{ key: string; member?: string }>();
  const [data, setData] = useState<Data | null>(null);
  const [back, setBack] = useState('#5B3DF5');
  const [flipped, setFlipped] = useState(false);
  const [spin] = useState(() => new Animated.Value(0));
  const owner = member ?? me?.id ?? null;

  useFocusEffect(useCallback(() => {
    if (!league || !key) return;
    (async () => {
      setData(await cardDetail(league.id, key, owner));
      if (owner) setBack((await looks(league.id, owner)).back);
    })();
  }, [league, key, owner]));

  const flip = async () => {
    const to = flipped ? 0 : 1;
    setFlipped(!flipped);
    if (await AccessibilityInfo.isReduceMotionEnabled()) { spin.setValue(to); return; }
    Animated.timing(spin, { toValue: to, duration: motion.slow, easing: ease, useNativeDriver: true }).start();
  };

  if (!data) return <Screen><Header title="Card" /><View style={{ padding: space[4], alignItems: 'center' }}><Skeleton h={420} w={300} /></View></Screen>;
  const c = data.card;
  const w = Math.min(300, width - space[4] * 4);
  const mine = owner === me?.id;
  const got = c.count > 0;
  const front = spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['0deg', '90deg', '90deg'] });
  const rear = spin.interpolate({ inputRange: [0, 0.5, 1], outputRange: ['-90deg', '-90deg', '0deg'] });

  return (
    <Screen>
      <Header title={c.name} right={got ? <Pill label={c.label} tone={c.special ? 'crown' : 'neutral'} /> : undefined} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], alignItems: 'center', paddingBottom: 64 }}>
        <Pressable accessibilityRole="button" accessibilityLabel={flipped ? 'Show the front' : 'Flip the card'} onPress={flip} disabled={!got}>
          <View style={{ width: w, height: Math.round(w * 1.4) }}>
            <Animated.View style={{ position: 'absolute', backfaceVisibility: 'hidden', transform: [{ perspective: 900 }, { rotateY: front }] }}>
              {got ? <CollectCard card={c} w={w} full /> : (
                <View style={{ width: w, height: Math.round(w * 1.4), borderRadius: Math.round(w * 0.13), backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center', gap: space[2] }}>
                  <View style={{ width: w * 0.42, height: w * 0.42, borderRadius: w, backgroundColor: t.surface3 }} />
                  <T v="heading" c="text2">Not collected yet</T>
                </View>
              )}
            </Animated.View>
            <Animated.View style={{ position: 'absolute', backfaceVisibility: 'hidden', transform: [{ perspective: 900 }, { rotateY: rear }] }}>
              <CardBack colour={back} w={w} />
              <View style={{ position: 'absolute', left: 0, right: 0, bottom: space[5], alignItems: 'center' }}>
                <View style={{ backgroundColor: '#0A0A0A', borderRadius: radius.sm, paddingHorizontal: space[3], paddingVertical: space[2], alignItems: 'center' }}>
                  <T v="label" c="#FFFFFF">{c.set ? `Season ${c.set}` : 'Special edition'}{c.serial ? `, printed ${c.serial}` : ''}</T>
                  <T v="caption" c="#ADADAD">{c.oneOfOne ? '1 of 1' : c.note ?? 'Liga collectible'}</T>
                </View>
              </View>
            </Animated.View>
          </View>
        </Pressable>

        <View style={{ alignItems: 'center', gap: 4 }}>
          <T v="heading">{mine ? (got ? `You own ${c.count}` : 'Not in your album yet') : `They own ${c.count}`}</T>
          <T v="small" c="text2">Owned by {data.owners} {data.owners === 1 ? 'player' : 'players'}</T>
          {!c.tradeable ? <View style={{ marginTop: space[1] }}><Pill label={c.special ? 'Not tradeable, never sold' : '1 of 1, not tradeable'} /></View> : null}
          {c.gone ? <T v="small" c="text2">This player left the league.</T> : null}
        </View>

        <View style={{ alignSelf: 'stretch', gap: space[2] }}>
          {got ? <Button label={flipped ? 'Show the front' : 'Flip'} icon={RotateCcw} variant="secondary" size="md" onPress={flip} /> : null}
          {mine && got && c.tradeable ? <Button label="Add to trade" icon={ArrowLeftRight} variant="secondary" size="md" onPress={() => router.push(`/cards/trade-new?give=${encodeURIComponent(c.key)}` as Href)} /> : null}
          {!mine && got && c.tradeable ? <Button label="Ask for this" icon={ArrowLeftRight} variant="secondary" size="md" onPress={() => router.push(`/cards/trade-new?to=${owner}&want=${encodeURIComponent(c.key)}` as Href)} /> : null}
          {mine && data.spare > 0 && c.redeem ? <Button label={`Redeem a spare for ${c.redeem}`} icon={Recycle} variant="secondary" size="md" onPress={() => router.push('/cards/spares' as Href)} /> : null}
          {got ? <Button label="Share" icon={Share2} variant="ghost" size="md" onPress={() => Share.share({ message: `${c.name}, ${c.label}, rated ${c.ovr}. From our Liga album.` })} /> : null}
        </View>
      </ScrollView>
    </Screen>
  );
}
