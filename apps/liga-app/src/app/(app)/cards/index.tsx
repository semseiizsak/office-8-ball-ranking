// G8 Cards: unopened packs, shop row, album preview with the latest cards, spares, trades, season pass.
import { router, useFocusEffect, type Href } from 'expo-router';
import { ArrowLeftRight, BookOpen, Layers, Recycle, ShoppingBag, Ticket } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { cardsHub, PACK, PITY, type Hub } from '@/lib/cards';
import { isOn } from '@/lib/modules';
import { looks, type Looks } from '@/lib/shop';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { fmt, radius, space, useTheme } from '@/theme';
import { Avatar, Button, Card, Empty, Screen, Skeleton, T } from '@/ui';
import { CollectCard, PackArt } from '@/ui/cards-kit';
import { Group, Header, Row } from '@/ui/list-row';

export default function Cards() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me } = useLeague();
  const [h, setH] = useState<Hub | null>(null);
  const [look, setLook] = useState<Looks | null>(null);
  useFocusEffect(useCallback(() => {
    if (!session || !league) return;
    (async () => {
      const hub = await cardsHub(session.user, league.id);
      setH(hub);
      if (hub.memberId) setLook(await looks(league.id, hub.memberId));
    })();
  }, [session, league]));

  const on = isOn(league, 'cards') && isOn(league, 'coins');
  if (!on || (h && !h.on)) return <Screen><Header title="Cards" /><Empty icon={Layers} title="Cards are off in this league" body="An admin can turn on Coins and Collectible cards in the league modules." action={<Button label="Back" size="md" variant="secondary" onPress={() => router.back()} />} /></Screen>;
  if (!h) return <Screen><Header title="Cards" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={180} /><Skeleton h={220} /><Skeleton h={120} /></View></Screen>;
  if (h.guest) return <Screen><Header title="Cards" /><Empty icon={Layers} title="Guests don't collect cards" body="Claim your profile with an account to start a collection." /></Screen>;

  const first = h.packs[0];
  const shop = isOn(league, 'shop');
  const pass = isOn(league, 'pass') && isOn(league, 'seasons');

  return (
    <Screen>
      <Header title="Cards" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 64 }}>
        {me ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[1] }}>
            <Avatar name={me.display_name} colour={me.colour} jersey={me.jersey} size={48} frame={look?.frame ?? undefined} />
            <View style={{ flex: 1, gap: 2 }}>
              <T v="heading" numberOfLines={1}>{me.display_name}</T>
              <T v="small" c="text2" numberOfLines={1}>{look?.title ? `${look.title}, ` : ''}{fmt(h.balance)} coins</T>
            </View>
          </View>
        ) : null}

        {first ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`Open ${PACK[first.kind].name}`} onPress={() => router.push(`/cards/open?id=${first.id}` as Href)}
            style={({ pressed }) => ({ backgroundColor: t.brand, borderRadius: radius.md, padding: space[4], flexDirection: 'row', alignItems: 'center', gap: space[4], transform: [{ scale: pressed ? 0.98 : 1 }] })}>
            <PackArt kind={first.kind} w={76} />
            <View style={{ flex: 1, gap: space[1] }}>
              <T v="section" c="onBrand">{h.packs.length > 1 ? `${h.packs.length} packs to open` : `${PACK[first.kind].name} ready`}</T>
              <T v="small" c="onBrand">{first.reason}. {PACK[first.kind].body}.</T>
              <View style={{ alignSelf: 'flex-start', marginTop: space[1], height: 36, paddingHorizontal: 18, borderRadius: radius.pill, backgroundColor: '#FFFFFF', justifyContent: 'center' }}>
                <T v="label" c="#0A0A0A">Open</T>
              </View>
            </View>
          </Pressable>
        ) : (
          <Card style={{ gap: space[1] }}>
            <T v="heading">No packs waiting</T>
            <T v="small" c="text2">A free pack lands every week. Cups, the season pass and the weekly chest add more.</T>
          </Card>
        )}

        <View style={{ gap: space[2] }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: space[1] }}>
            <T v="heading">Season {h.set} album</T>
            <T v="label" c="text2">{h.got} of {h.total}</T>
          </View>
          <View style={{ height: 8, borderRadius: 4, backgroundColor: t.surface3, overflow: 'hidden' }}>
            <View style={{ width: `${h.total ? (h.got / h.total) * 100 : 0}%`, height: 8, borderRadius: 4, backgroundColor: t.win }} />
          </View>
          {h.recent.length ? (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2], paddingVertical: space[2], paddingRight: space[2] }}>
              {h.recent.map((c) => (
                <Pressable key={c.key} accessibilityRole="button" onPress={() => router.push(`/cards/card?key=${encodeURIComponent(c.key)}` as Href)}>
                  <CollectCard card={c} w={88} count={c.count} />
                </Pressable>
              ))}
            </ScrollView>
          ) : <T v="small" c="text2" style={{ paddingHorizontal: space[1] }}>Open your first pack to start the album.</T>}
          <Button label="Open album" icon={BookOpen} variant="secondary" size="md" onPress={() => router.push('/cards/album' as Href)} />
        </View>

        <Group>
          {shop ? <Row first icon={ShoppingBag} label="Shop" value={`${fmt(h.balance)} coins`} onPress={() => router.push('/shop' as Href)} /> : null}
          <Row first={!shop} icon={Recycle} label="Spares" value={h.spares ? `${h.spares}, worth ${fmt(h.spareValue)} coins` : 'None yet'} onPress={() => router.push('/cards/spares' as Href)} />
          <Row icon={ArrowLeftRight} label="Trades" value={h.incoming ? (h.incoming === 1 ? `1 offer from ${h.incomingFrom}` : `${h.incoming} offers`) : undefined} onPress={() => router.push('/cards/trades' as Href)} />
          {pass ? <Row icon={Ticket} label="Season pass" onPress={() => router.push('/pass' as Href)} /> : null}
        </Group>

        <T v="caption" c="text3" center>{h.pity} of {PITY} packs to a guaranteed Legendary.{'\n'}Packs are never sold for money.</T>
      </ScrollView>
    </Screen>
  );
}
