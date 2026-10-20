// G8.6 Trades: Incoming, Sent, History. Card for card only, coins never change hands, specials never move.
import { router, useFocusEffect, type Href } from 'expo-router';
import { ArrowLeftRight, Plus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { trades, type TradeView } from '@/lib/cards';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Empty, Icon, Pill, Screen, Seg, Skeleton, T } from '@/ui';
import { CollectCard, hoursLeft } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';

type Tab = 'incoming' | 'sent' | 'history';
type Data = Awaited<ReturnType<typeof trades>>;
const STATUS: Record<TradeView['status'], string> = { pending: 'Pending', accepted: 'Accepted', declined: 'Declined', expired: 'Expired', cancelled: 'Cancelled' };

export default function Trades() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [tab, setTab] = useState<Tab>('incoming');
  const [data, setData] = useState<Data | null>(null);
  useFocusEffect(useCallback(() => { if (session && league) (async () => setData(await trades(session.user, league.id)))(); }, [session, league]));

  const row = (x: TradeView) => (
    <Pressable key={x.id} accessibilityRole="button" onPress={() => router.push(`/cards/trade?id=${x.id}` as Href)}
      style={({ pressed }) => ({ backgroundColor: pressed ? t.surface3 : t.surface, borderRadius: radius.md, padding: space[4], gap: space[3] })}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <T v="heading" style={{ flex: 1 }} numberOfLines={1}>{x.mine ? `To ${x.toName}` : `From ${x.fromName}`}</T>
        <Pill label={x.status === 'pending' ? `${hoursLeft(x.at)} h left` : STATUS[x.status]} tone={x.status === 'accepted' ? 'win' : 'neutral'} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[2] }}>
        <View style={{ flexDirection: 'row', gap: 4, flex: 1 }}>{(x.mine ? x.giveCards : x.wantCards).map((c, i) => <CollectCard key={c.key + i} card={c} w={40} />)}</View>
        <Icon as={ArrowLeftRight} size={18} color={t.text3} />
        <View style={{ flexDirection: 'row', gap: 4, flex: 1, justifyContent: 'flex-end' }}>{(x.mine ? x.wantCards : x.giveCards).map((c, i) => <CollectCard key={c.key + i} card={c} w={40} />)}</View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <T v="caption" c="text3">You give</T>
        <T v="caption" c="text3">You get</T>
      </View>
    </Pressable>
  );

  const list = data ? data[tab] : null;
  return (
    <Screen>
      <Header title="Trades" right={<Button label="New" icon={Plus} size="sm" onPress={() => router.push('/cards/trade-new' as Href)} />} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 64 }}>
        <Seg options={[{ value: 'incoming', label: `Incoming${data?.incoming.length ? ` ${data.incoming.length}` : ''}` }, { value: 'sent', label: 'Sent' }, { value: 'history', label: 'History' }]} value={tab} onChange={setTab} />
        {!list ? [0, 1].map((i) => <Skeleton key={i} h={140} />) : list.length ? list.map(row) : (
          <Empty icon={ArrowLeftRight} title={tab === 'incoming' ? 'No offers right now' : tab === 'sent' ? 'Nothing sent' : 'No trades yet'}
            body="Swap spares for cards you need. Card for card, up to 3 a side, offers last 48 hours." action={<Button label="New trade" size="md" onPress={() => router.push('/cards/trade-new' as Href)} />} />
        )}
      </ScrollView>
    </Screen>
  );
}
