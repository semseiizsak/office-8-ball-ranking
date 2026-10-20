// R1.5 Wall of shame sheet: the rule, who is on it, Cheer up, Offer a rematch, the league record, admin threshold.
import { router, useFocusEffect } from 'expo-router';
import { PartyPopper, Swords } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { cheer, setShameLimit, shameWall, SHAME_STEPS } from '@/lib/badges';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Empty, Seg, Skeleton, T } from '@/ui';
import { ClownAvatar, sinceLabel } from '@/ui/badges-kit';
import { goChallenge } from '@/ui/player-menu';

type Wall = Awaited<ReturnType<typeof shameWall>>;

export default function Shame() {
  const { t } = useTheme();
  const { league, members, me } = useLeague();
  const { session } = useAuth();
  const [w, setW] = useState<Wall | undefined>(undefined);
  const admin = me?.role === 'owner' || me?.role === 'admin';

  const load = useCallback(async () => { if (league) setW(await shameWall(league.id, session?.user.id)); }, [league, session?.user.id]);
  useFocusEffect(useCallback(() => { load(); }, [load, members])); // eslint-disable-line react-hooks/exhaustive-deps

  if (w === undefined) return <View style={{ padding: space[5], gap: space[3] }}><Skeleton h={60} /><Skeleton h={120} /></View>;
  if (!w) return <Empty icon={PartyPopper} title="Wall of shame is off" body="An admin can turn it on in the league modules." />;

  const byId = new Map(members.map((m) => [m.id, m]));
  const mine = w.rows.find((r) => r.id === me?.id);
  const rows = [...(mine ? [mine] : []), ...w.rows.filter((r) => r !== mine)];
  const challenges = isOn(league, 'challenges');

  return (
    <ScrollView contentContainerStyle={{ padding: space[5], gap: space[4], paddingBottom: 48 }}>
      <View style={{ gap: space[2] }}>
        <T v="title">Wall of shame</T>
        <T c="text2">{w.limit} losses in a row puts you on the wall. One win and the clown is gone.</T>
      </View>

      {!rows.length ? <Empty icon={PartyPopper} title="No one is on the wall" body="Everyone has a win in their last few matches." /> : null}
      {rows.map((r) => {
        const m = byId.get(r.id);
        if (!m) return null;
        const own = r.id === me?.id;
        const cheered = w.cheered.has(r.id);
        return (
          <View key={r.id} style={{ backgroundColor: own ? t.surface2 : t.surface, borderRadius: radius.md, padding: space[3], gap: space[3] }}>
            {own ? <View style={{ position: 'absolute', left: 0, top: 12, bottom: 12, width: 3, borderRadius: 2, backgroundColor: t.brand }} /> : null}
            <Pressable accessibilityRole="button" onPress={() => router.push(`/player/${r.id}`)} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <ClownAvatar m={m} />
              <View style={{ flex: 1 }}>
                <T v="heading" numberOfLines={1}>{own ? 'You' : m.display_name}</T>
                <T v="caption" c="text3">{r.losses} losses in a row, {sinceLabel(r.since)}</T>
              </View>
            </Pressable>
            {own ? (
              <>
                <T v="small" c="text2">You are on the wall. Next win clears it.</T>
                <Button label="Log match" size="md" onPress={() => router.push('/log')} />
              </>
            ) : me ? (
              <View style={{ flexDirection: 'row', gap: space[2] }}>
                <Button label={cheered ? 'Cheered' : 'Cheer up'} size="sm" variant="secondary" disabled={cheered} style={{ flex: 1 }}
                  onPress={async () => { if (session && league) { await cheer(session.user, league.id, r.id); load(); } }} />
                {challenges && r.beatBy === me.id ? <Button label="Offer a rematch" icon={Swords} size="sm" variant="secondary" style={{ flex: 1 }} onPress={() => goChallenge(r.id)} /> : null}
              </View>
            ) : null}
          </View>
        );
      })}

      {w.record ? <T v="small" c="text2">Longest stay: {w.record.name}, {w.record.n} in a row.</T> : null}

      {admin && session && league ? (
        <View style={{ gap: space[2], marginTop: space[2] }}>
          <T v="label">Losses in a row to get on the wall</T>
          <Seg value={String(w.limit)} options={SHAME_STEPS.map((n) => ({ value: String(n), label: String(n) }))}
            onChange={async (v) => { await setShameLimit(session.user, league.id, Number(v)); load(); }} />
        </View>
      ) : null}
    </ScrollView>
  );
}
