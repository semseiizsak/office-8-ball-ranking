// R9.3 Dormant rules: why players move below the ladder, that it is not a penalty, and my own countdown. Form sheet.
import { router } from 'expo-router';
import { Plus, Swords } from 'lucide-react-native';
import { ScrollView, View } from 'react-native';

import { isOn } from '@/lib/modules';
import { DORMANT_DAYS, PROVISIONAL } from '@/lib/stats';
import { daysSince } from '@/lib/time';
import { useLeague } from '@/providers/league';
import { space, useTheme } from '@/theme';
import { Button, Card, T } from '@/ui';
import { goChallenge } from '@/ui/player-menu';

export default function DormantRules() {
  const { t } = useTheme();
  const { me, members, league } = useLeague();
  const played = me ? me.wins + me.losses : 0;
  const days = me ? daysSince(me.last_played_at) : Infinity;
  const own = !me || played < PROVISIONAL || days === Infinity ? null
    : days >= DORMANT_DAYS ? `You played ${days} days ago. One match brings you back.`
      : `You played ${days === 0 ? 'today' : days === 1 ? 'yesterday' : `${days} days ago`}. ${DORMANT_DAYS - days} ${DORMANT_DAYS - days === 1 ? 'day' : 'days'} left.`;
  const rival = members.filter((m) => m.id !== me?.id && m.wins + m.losses > 0).sort((a, b) => Math.abs(a.rating - (me?.rating ?? 0)) - Math.abs(b.rating - (me?.rating ?? 0)))[0];

  const card = (title: string, body: string) => (
    <Card key={title} style={{ gap: 4, backgroundColor: t.surface }}>
      <T v="heading">{title}</T>
      <T v="small" c="text2">{body}</T>
    </Card>
  );

  return (
    <ScrollView contentContainerStyle={{ padding: space[5], gap: space[4], paddingBottom: 48 }}>
      <T v="title">Dormant</T>
      {card(`No match in ${DORMANT_DAYS} days moves you to Dormant.`, 'Your rating stays the same. You are just listed below the ladder until your next match.')}
      {card('Play any match to come back.', 'Your old spot depends on your rating, so nothing is lost while you are away.')}
      {own ? <Card style={{ backgroundColor: days >= DORMANT_DAYS - 3 ? t.warning : t.surface2 }}><T v="label" c={days >= DORMANT_DAYS - 3 ? '#0A0A0A' : 'text'}>{own}</T></Card> : null}
      <View style={{ flexDirection: 'row', gap: space[2] }}>
        <Button label="Log match" icon={Plus} size="md" style={{ flex: 1 }} onPress={() => { router.back(); router.push('/log'); }} />
        {rival && isOn(league, 'challenges') ? <Button label="Challenge someone" icon={Swords} size="md" variant="secondary" style={{ flex: 1 }} onPress={() => { router.back(); goChallenge(rival.id); }} /> : null}
      </View>
    </ScrollView>
  );
}
