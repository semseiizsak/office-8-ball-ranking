// K11.3 Muted members list with Unmute; mutes end by themselves when the time is up
import { router, useFocusEffect, type Href } from 'expo-router';
import { VolumeX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { mutedMembers, unmute, untilLabel } from '@/lib/moderation';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Row = Awaited<ReturnType<typeof mutedMembers>>[number];

export default function Muted() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league } = useLeague();
  const [rows, setRows] = useState<Row[] | null>(null);

  const load = useCallback(async () => {
    if (!session || !league) return;
    try { setRows(await mutedMembers(session.user, league.id)); } catch { setRows([]); }
  }, [session, league]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const off = async (r: Row) => {
    try { await unmute(session!.user, r.id); load(); } catch (e) { Alert.alert("Couldn't unmute", e instanceof Error ? e.message : 'Try again.'); }
  };

  const row = (r: Row) => (
    <View key={r.id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: t.surface }}>
      {r.member ? <Avatar name={r.member.display_name} colour={r.member.colour} jersey={r.member.jersey} size={40} /> : null}
      <View style={{ flex: 1, gap: 2 }}>
        <T v="heading" numberOfLines={1}>{r.member?.display_name ?? 'Former player'}</T>
        <T v="caption" c="text3" numberOfLines={2}>Muted {untilLabel(r.until)} by {r.byName}{r.scope === 'chat_photos' ? ', photos too' : ''}{r.reason ? `. ${r.reason}` : ''}</T>
      </View>
      {r.canUnmute ? <Button label="Unmute" size="md" variant="secondary" onPress={() => off(r)} /> : null}
    </View>
  );

  return (
    <Screen>
      <Header title="Muted members" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[2], paddingBottom: 60 }}>
        {!rows ? <Skeleton h={72} /> : rows.length ? rows.map(row) : (
          <Empty icon={VolumeX} title="Nobody is muted" body="A mute is a short break from chat and comments. They can still play." />
        )}
        <Button label="Mute someone" variant="secondary" style={{ marginTop: space[3] }} onPress={() => router.push('/league/moderation/mute' as Href)} />
      </ScrollView>
    </Screen>
  );
}
