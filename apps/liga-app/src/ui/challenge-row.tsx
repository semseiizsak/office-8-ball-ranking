import { router } from 'expo-router';
import { Clock } from 'lucide-react-native';
import { View } from 'react-native';

import { stakesFor, timeLeft, whenLabel, type Challenge } from '@/lib/challenges';
import type { Member } from '@/lib/types';
import { signed, space } from '@/theme';
import { Avatar, Card, Pill, T } from '@/ui';

// Status line and pill for one challenge, from my side (M7.4 rows, M9 states).
export function challengeStatus(c: Challenge, meId: string | undefined, names: (id: string) => string) {
  const mine = c.from === meId;
  const other = names(mine ? c.to : c.from);
  switch (c.status) {
    case 'pending': return mine
      ? { title: `You challenged ${other}`, pill: { label: `Waiting, ${timeLeft(c.expires_at)}`, tone: 'neutral' as const } }
      : { title: `${other} challenged you`, pill: { label: timeLeft(c.expires_at), tone: 'warning' as const, icon: Clock } };
    case 'accepted': return { title: `You vs ${other}`, pill: { label: c.scheduled_at ? whenLabel(c.scheduled_at) : 'Accepted', tone: 'win' as const } };
    case 'declined': return { title: mine ? `${other} passed this time` : `You passed on ${other}`, pill: { label: 'Declined', tone: 'neutral' as const } };
    case 'expired': return { title: c.after_accept ? `You vs ${other}, not played` : mine ? `${other} did not reply` : `Challenge from ${other}`, pill: { label: 'Expired', tone: 'neutral' as const } };
    case 'cancelled': return { title: c.cancelled_by === meId ? `You cancelled vs ${other}` : `${other} cancelled`, pill: { label: 'Cancelled', tone: 'neutral' as const } };
    case 'played': return { title: `You vs ${other}`, pill: { label: 'Played', tone: 'neutral' as const } };
  }
}

export function ChallengeRow({ c, members, meId }: { c: Challenge; members: Member[]; meId?: string }) {
  const byId = new Map(members.map((m) => [m.id, m]));
  const other = byId.get(c.from === meId ? c.to : c.from);
  const s = challengeStatus(c, meId, (id) => byId.get(id)?.display_name ?? 'Someone');
  const st = stakesFor(c, meId);
  return (
    <Card onPress={() => router.push(`/challenge/${c.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingVertical: space[3] }}>
      {other ? <Avatar name={other.display_name} colour={other.colour} jersey={other.jersey} size={44} /> : null}
      <View style={{ flex: 1, gap: 4 }}>
        <T v="label" numberOfLines={1}>{s.title}</T>
        <T v="caption" c="text3">Win {signed(st.win)}, lose {signed(st.lose)}</T>
      </View>
      <Pill label={s.pill.label} tone={s.pill.tone} icon={'icon' in s.pill ? s.pill.icon : undefined} />
    </Card>
  );
}
