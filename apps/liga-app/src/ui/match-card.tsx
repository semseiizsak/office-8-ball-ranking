import { router } from 'expo-router';
import { View } from 'react-native';

import type { MatchRow, Member } from '@/lib/types';
import { clock } from '@/lib/time';
import { signed, space } from '@/theme';
import { Avatar, Card, Pill, T } from '@/ui';

// M6 feed card: both sides, winner with a solid win pill, loser in secondary text (never faded).
// Confirmation module: pending and disputed show a grey delta, walkover and void show no rating change (M3, M15.3).
const STATUS = { pending: 'Pending', disputed: 'Disputed', no_show: 'No show reported', walkover: 'Walkover', void: 'Not counted' } as const;
export function MatchCard({ match, members, meId, onPress }: { match: MatchRow; members: Member[]; meId?: string; onPress?: () => void }) {
  const st = match.status, live = st === 'pending' || st === 'disputed';
  const byId = new Map(members.map((m) => [m.id, m]));
  const side = (s: 'a' | 'b') => match.match_players.filter((p) => p.side === s).map((p) => ({ ...p, m: byId.get(p.member_id) })); // m missing = former player (left or removed)
  const sideView = (s: 'a' | 'b') => {
    const ps = side(s);
    const won = match.winner === s;
    const delta = ps[0]?.delta ?? 0;
    const names = ps.map((p) => (!p.m ? 'Former player' : p.m.id === meId ? 'You' : p.m.display_name)).join(' and ');
    return (
      <View style={{ flex: 1, alignItems: 'center', gap: space[2] }}>
        <View style={{ flexDirection: 'row' }}>
          {ps.map((p, i) => (
            <View key={p.member_id} style={{ marginLeft: i ? -12 : 0 }}>
              {p.m ? <Avatar name={p.m.display_name} colour={p.m.colour} jersey={ps.length === 1 ? p.m.jersey : undefined} size={ps.length === 1 ? 52 : 44} />
                : <Avatar name="?" colour="ink" ring={false} size={ps.length === 1 ? 52 : 44} />}
            </View>
          ))}
        </View>
        <T v="label" c={won ? 'text' : 'text2'} numberOfLines={1} center>{names}</T>
        {won && !st ? <Pill label={`Won ${signed(delta)}`} tone="win" />
          : won ? <Pill label={st === 'walkover' ? 'Won, walkover' : live ? `Won ${signed(delta)}` : 'Won'} tone={st === 'walkover' ? 'win' : 'neutral'} />
          : <T v="label" c="text3">{st === 'walkover' ? 'No show' : !st || live ? signed(delta) : 'No change'}</T>}
      </View>
    );
  };
  const score = match.score_a != null && match.score_b != null;
  return (
    <Card onPress={onPress ?? (() => router.push(`/match/${match.id}`))} style={{ gap: space[3] }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: space[2] }}>
          <Pill label={match.format} />
          {st ? <Pill label={STATUS[st]} tone={st === 'disputed' ? 'warning' : 'neutral'} /> : null}
        </View>
        <T v="caption" c="text3">{clock(match.played_at)}</T>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
        {sideView('a')}
        <View style={{ width: 64, alignItems: 'center', paddingTop: 14 }}>
          {score ? <T v="number" style={{ fontSize: 22 }}>{match.score_a}:{match.score_b}</T> : <T v="label" c="text3">vs</T>}
        </View>
        {sideView('b')}
      </View>
      {st === 'walkover' ? <T v="caption" c="text3" center>No rating change for a walkover</T> : live ? <T v="caption" c="text3" center>{st === 'pending' ? 'Counts once confirmed' : 'Ratings wait until this is settled'}</T> : null}
    </Card>
  );
}
