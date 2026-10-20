// G8.6.2 Trade offer: both sides of the swap, time left, Accept, Decline, Counter; the sender can cancel.
import * as Haptics from 'expo-haptics';
import { router, useFocusEffect, useLocalSearchParams, type Href } from 'expo-router';
import { ArrowLeftRight } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { answerTrade, getTrade, type CardView, type TradeView } from '@/lib/cards';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { space } from '@/theme';
import { Button, Card, Empty, Pill, Screen, Skeleton, T } from '@/ui';
import { CollectCard, hoursLeft } from '@/ui/cards-kit';
import { Header } from '@/ui/list-row';

export default function TradeOffer() {
  const { session } = useAuth();
  const { league } = useLeague();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [x, setX] = useState<TradeView | null | undefined>(undefined);
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => { if (session && league && id) setX(await getTrade(session.user, league.id, id)); }, [session, league, id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (x === undefined) return <Screen><Header title="Trade" /><View style={{ padding: space[4] }}><Skeleton h={320} /></View></Screen>;
  if (!x) return <Screen><Header title="Trade" /><Empty icon={ArrowLeftRight} title="This offer is gone" body="It was answered or withdrawn." /></Screen>;

  const act = async (a: 'accept' | 'decline' | 'cancel') => {
    if (!session || !league) return;
    setBusy(a);
    try { await answerTrade(session.user, league.id, x.id, a); if (a === 'accept') Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success); }
    catch (e) { Alert.alert('Couldn’t finish the trade', e instanceof Error && e.message.length > 12 ? e.message : 'Nothing changed. Try again in a moment.'); }
    setBusy(null);
    load();
  };
  const side = (title: string, cards: CardView[]) => (
    <Card style={{ gap: space[2] }}>
      <T v="label" c="text2">{title}</T>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
        {cards.length ? cards.map((c, i) => <CollectCard key={c.key + i} card={c} w={92} />) : <T v="small" c="text2">Nothing, it’s a gift</T>}
      </View>
    </Card>
  );
  const names = (cards: CardView[]) => cards.map((c) => `${c.name} ${c.label}`).join(', ') || 'nothing';
  const pending = x.status === 'pending';

  return (
    <Screen>
      <Header title="Trade" right={<Pill label={pending ? `${hoursLeft(x.at)} h left` : x.status[0].toUpperCase() + x.status.slice(1)} tone={x.status === 'accepted' ? 'win' : 'neutral'} />} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 64 }}>
        <T v="heading">{x.mine ? `You offered ${x.toName} ${names(x.giveCards)} for ${names(x.wantCards)}` : `${x.fromName} offers ${names(x.giveCards)} for your ${names(x.wantCards)}`}</T>
        {x.note ? <T c="text2">“{x.note}”</T> : null}
        {side(x.mine ? 'You give' : 'You get', x.giveCards)}
        {side(x.mine ? 'You get' : 'You give', x.wantCards)}
        {x.problem && pending ? <T v="small" c="text2">{x.problem}. The offer can’t go through as it is.</T> : null}
        {x.reason && !pending ? <T v="small" c="text2">{x.reason}.</T> : null}
        {pending && !x.mine ? (
          <View style={{ gap: space[2] }}>
            <View style={{ flexDirection: 'row', gap: space[2] }}>
              <Button label="Decline" variant="secondary" style={{ flex: 1 }} loading={busy === 'decline'} onPress={() => act('decline')} />
              <Button label="Accept" style={{ flex: 1 }} loading={busy === 'accept'} disabled={!!x.problem} onPress={() => act('accept')} />
            </View>
            <Button label="Counter" variant="ghost" size="md" onPress={() => router.replace(`/cards/trade-new?to=${x.from}${x.wantCards[0] ? `&give=${encodeURIComponent(x.want[0])}` : ''}${x.give[0] ? `&want=${encodeURIComponent(x.give[0])}` : ''}` as Href)} />
          </View>
        ) : null}
        {pending && x.mine ? <Button label="Withdraw offer" variant="secondary" loading={busy === 'cancel'} onPress={() => act('cancel')} /> : null}
      </ScrollView>
    </Screen>
  );
}
