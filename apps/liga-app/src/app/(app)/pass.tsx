// G3.2 Season pass and G3.2.1 Reward detail sheet. 30 tiers from season XP; the free row pays coins and packs,
// the Pro row is cosmetics only. Unclaimed free rewards are credited 7 days after the season ends, never lost.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, type Href } from 'expo-router';
import { Check, Coins, Lock, Ticket } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { PACK } from '@/lib/cards';
import { claimPass, passView, PRO_COUNT, rewardLabel, TIERS, type PassTile, type PassView, type Reward } from '@/lib/pass';
import { shortDate } from '@/lib/seasons';
import { equip, type Item } from '@/lib/shop';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Icon, Pill, Screen, Skeleton, T } from '@/ui';
import { CardBack, PackArt, Sheet } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';
import { openPaywall } from '@/ui/plan-kit';

type Pick = { tile: PassTile; row: 'free' | 'pro' };

export default function SeasonPass() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me } = useLeague();
  const [p, setP] = useState<PassView | null>(null);
  const [pick, setPick] = useState<Pick | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => { if (session && league) setP(await passView(session.user, league.id)); }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (p && !p.on) return <Screen><Header title="Season pass" /><Empty icon={Ticket} title="The season pass is off" body="An admin can turn on Seasons and Season pass in the league modules." action={<Button label="Back" size="md" variant="secondary" onPress={() => router.back()} />} /></Screen>;
  if (!p || !p.season) return <Screen><Header title="Season pass" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={120} /><Skeleton h={260} /></View></Screen>;
  if (p.guest) return <Screen><Header title="Season pass" /><Empty icon={Ticket} title="Guests don't collect" body="Claim your profile with an account to fill the pass." /></Screen>;
  const s = p.season;
  const unit = p.xpOn ? 'XP' : 'points';

  const claim = async (which: { tier: number; row: 'free' | 'pro' } | 'all') => {
    if (!session || !league) return;
    setBusy(which === 'all' ? 'all' : `${which.row}${which.tier}`);
    try { await claimPass(session.user, league.id, s.n, which); Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); setPick(null); await load(); }
    catch { Alert.alert('Couldn’t claim', 'Nothing was lost. Try again in a moment.'); }
    setBusy(null);
  };
  const wear = async (item: Item) => {
    if (!session || !league) return;
    await equip(session.user, league.id, item.kind, item.id);
    Haptics.selectionAsync();
    setPick(null);
  };

  const rewardIcon = (r: Reward, size: number, onDark: boolean) => r.kind === 'coins' ? <Icon as={Coins} size={size * 0.4} color={onDark ? t.onWin : t.crown} />
    : r.kind === 'pack' ? <PackArt kind={r.pack} w={size * 0.42} />
    : r.item.kind === 'back' ? <CardBack colour={r.item.colour} w={size * 0.4} />
    : r.item.kind === 'frame' ? <View style={{ width: size * 0.46, height: size * 0.46, borderRadius: size, borderWidth: 4, borderColor: r.item.colour }} />
    : <T v="caption" c={onDark ? 'onWin' : 'brand'} numberOfLines={1}>Title</T>;
  const tileBox = (tile: PassTile, row: 'free' | 'pro') => {
    const reward: Reward | null = row === 'free' ? tile.free : tile.pro ? { kind: 'item', item: tile.pro } : null;
    const size = 92;
    if (!reward) return <View key={row} style={{ width: size, height: size, borderRadius: radius.sm, backgroundColor: t.surface }} />;
    const claimed = row === 'free' ? tile.freeClaimed : tile.proClaimed;
    const ready = tile.reached && !claimed && (row === 'free' || p.pro);
    const locked = row === 'pro' && !p.pro;
    return (
      <Pressable key={row} accessibilityRole="button" accessibilityLabel={`Tier ${tile.tier}, ${row === 'pro' ? 'Pro, ' : ''}${rewardLabel(reward)}${claimed ? ', claimed' : ready ? ', ready to claim' : locked ? ', needs Liga Pro' : ''}`}
        onPress={() => (ready ? claim({ tier: tile.tier, row }) : setPick({ tile, row }))} onLongPress={() => setPick({ tile, row })}
        style={({ pressed }) => ({ width: size, height: size, borderRadius: radius.sm, backgroundColor: ready ? t.win : t.surface2, padding: 6, alignItems: 'center', justifyContent: 'space-between', transform: [{ scale: pressed ? 0.96 : 1 }] })}>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>{rewardIcon(reward, size, ready)}</View>
        <T v="caption" c={ready ? 'onWin' : 'text2'} numberOfLines={1}>{ready ? 'Tap to claim' : reward.kind === 'coins' ? `${reward.coins}` : rewardLabel(reward)}</T>
        {claimed ? <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: t.win, alignItems: 'center', justifyContent: 'center' }}><Icon as={Check} size={14} color={t.onWin} /></View> : null}
        {locked ? <View style={{ position: 'absolute', top: 4, right: 4, width: 22, height: 22, borderRadius: 11, backgroundColor: t.surface3, alignItems: 'center', justifyContent: 'center' }}><Icon as={Lock} size={12} /></View> : null}
      </Pressable>
    );
  };

  const into = p.tier >= TIERS ? p.perTier : p.points - p.tier * p.perTier;
  const sheet = pick ? (() => {
    const reward: Reward | null = pick.row === 'free' ? pick.tile.free : pick.tile.pro ? { kind: 'item', item: pick.tile.pro } : null;
    if (!reward) return null;
    const claimed = pick.row === 'free' ? pick.tile.freeClaimed : pick.tile.proClaimed;
    const locked = pick.row === 'pro' && !p.pro;
    return (
      <View style={{ alignItems: 'center', gap: space[3] }}>
        <View style={{ height: 140, alignItems: 'center', justifyContent: 'center' }}>
          {reward.kind === 'item' && reward.item.kind === 'frame' && me ? <Avatar name={me.display_name} colour={me.colour} jersey={me.jersey} size={96} frame={reward.item.colour} />
            : reward.kind === 'item' && reward.item.kind === 'back' ? <CardBack colour={reward.item.colour} w={96} />
            : reward.kind === 'item' ? <View style={{ height: 40, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: t.brand, justifyContent: 'center' }}><T v="heading" c="onBrand">{reward.item.name}</T></View>
            : reward.kind === 'pack' ? <PackArt kind={reward.pack} w={92} />
            : <T v="bigNumber">{fmt(reward.coins)}</T>}
        </View>
        <T v="section" center>{rewardLabel(reward)}</T>
        <T v="small" c="text2" center>Tier {pick.tile.tier}, {pick.row === 'pro' ? 'Pro' : 'free'}. {reward.kind === 'coins' ? 'Coins for the shop.' : reward.kind === 'pack' ? PACK[reward.pack].body + '.' : reward.item.kind === 'frame' ? 'A frame around your avatar.' : reward.item.kind === 'back' ? 'The back of your cards.' : 'A title next to your name.'}</T>
        {reward.kind === 'pack' ? <Button label="Drop rates" variant="ghost" size="md" onPress={() => { setPick(null); router.push(`/shop/pack?kind=${reward.pack}` as Href); }} /> : null}
        {claimed ? (reward.kind === 'item' ? <Button label="Equip" full onPress={() => wear(reward.item)} /> : <Pill label="Claimed" tone="win" icon={Check} />)
          : locked ? <Button label="Get Liga Pro" variant="brand" full onPress={() => { setPick(null); openPaywall('pass'); }} />
          : pick.tile.reached ? <Button label="Claim" full loading={busy === `${pick.row}${pick.tile.tier}`} onPress={() => claim({ tier: pick.tile.tier, row: pick.row })} />
          : <T v="label" c="text2">Reach tier {pick.tile.tier} to claim</T>}
      </View>
    );
  })() : null;

  return (
    <Screen>
      <Header title={`Season ${s.n} pass`} />
      <ScrollView contentContainerStyle={{ paddingVertical: space[4], gap: space[4], paddingBottom: 64 }}>
        <Card style={{ gap: space[2], marginHorizontal: space[4] }}>
          <T v="heading">Tier {p.tier} of {TIERS}{p.tier < TIERS ? `, ${fmt(into)} of ${fmt(p.perTier)} ${unit}` : ''}</T>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface3, overflow: 'hidden' }}>
            <View style={{ width: `${Math.min(100, (into / p.perTier) * 100)}%`, height: 8, borderRadius: 4, backgroundColor: t.win }} />
          </View>
          <T v="small" c="text2">{p.claimBy ? `Season ${s.n} has ended. Claim by ${shortDate(p.claimBy)}, after that we add what's left for you.` : s.end ? `Ends ${shortDate(s.end)}, ${p.daysLeft} ${p.daysLeft === 1 ? 'day' : 'days'} left` : 'Runs until an admin ends the season'}</T>
          <T v="caption" c="text3">Every match 20 {unit}, a win 10 more, an upset 15 more.</T>
        </Card>
        {p.ready ? <View style={{ paddingHorizontal: space[4] }}><Button label={`Claim all, ${p.ready} ready`} loading={busy === 'all'} onPress={() => claim('all')} /></View> : null}

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: space[4], gap: space[2] }}>
          <View style={{ justifyContent: 'space-around', paddingRight: space[1] }}>
            <View style={{ height: 92, justifyContent: 'center' }}><T v="label">Pro</T></View>
            <View style={{ height: 28 }} />
            <View style={{ height: 92, justifyContent: 'center' }}><T v="label">Free</T></View>
          </View>
          {p.tiles.map((tile) => (
            <View key={tile.tier} style={{ gap: 0, alignItems: 'center' }}>
              {tileBox(tile, 'pro')}
              <View style={{ height: 28, alignItems: 'center', justifyContent: 'center' }}>
                <View style={{ minWidth: 28, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: tile.reached ? t.win : t.surface3, alignItems: 'center', justifyContent: 'center' }}>
                  <T v="caption" c={tile.reached ? 'onWin' : 'text2'}>{tile.tier}</T>
                </View>
              </View>
              {tileBox(tile, 'free')}
            </View>
          ))}
        </ScrollView>

        {!p.pro ? (
          <Card style={{ gap: space[2], marginHorizontal: space[4] }}>
            <T v="heading">Liga Pro adds {PRO_COUNT} cosmetic rewards to this pass</T>
            <T v="small" c="text2">Frames, card backs and titles. Never coins or packs, so everyone plays on the same footing.</T>
            <Button label="See Liga Pro" variant="secondary" size="md" onPress={() => openPaywall('pass')} />
          </Card>
        ) : null}
      </ScrollView>
      <Sheet open={!!pick} onClose={() => setPick(null)}>{sheet}</Sheet>
    </Screen>
  );
}
