// M15.1 Report a no show
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, ScrollView, View } from 'react-native';

import { noShow } from '@/lib/confirm';
import { NO_SHOW_HOURS } from '@/lib/confirm-engine';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Screen, T } from '@/ui';
import { Header } from '@/ui/list-row';

export default function ReportNoShow() {
  const { t } = useTheme();
  const { opponent } = useLocalSearchParams<{ opponent?: string }>();
  const { session } = useAuth();
  const { league, members, me, refresh } = useLeague();
  const [pick, setPick] = useState<string | null>(opponent ?? null);
  const [busy, setBusy] = useState(false);
  if (!league || !session || !me) return null;
  const opp = members.find((m) => m.id === pick);

  const report = async () => {
    if (!pick) return;
    setBusy(true);
    try {
      const id = await noShow(session.user, league.id, pick);
      await refresh();
      router.replace(`/confirm/${id}`);
    } catch { Alert.alert('That did not work', 'Try again in a moment.'); }
    setBusy(false);
  };

  return (
    <Screen>
      <Header title="No show" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <T v="heading">{opp ? `${opp.display_name} didn't show up?` : 'Who didn’t show up?'}</T>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
          {members.filter((m) => m.id !== me.id && !m.guest).map((m) => {
            const on = m.id === pick;
            return (
              <Pressable key={m.id} accessibilityRole="button" accessibilityLabel={m.display_name} accessibilityState={{ selected: on }} onPress={() => setPick(m.id)}
                style={({ pressed }) => ({ width: '23%', alignItems: 'center', gap: 6, paddingVertical: space[3], borderRadius: radius.sm,
                  backgroundColor: on ? t.primary : pressed ? t.surface3 : t.surface })}>
                <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={44} />
                <T v="caption" c={on ? 'onPrimary' : 'text'} numberOfLines={1}>{m.display_name}</T>
              </Pressable>
            );
          })}
        </View>
        <T c="text2">{opp ? opp.display_name : 'They'} {opp ? 'has' : 'have'} {NO_SHOW_HOURS} h to reply. No reply means a walkover, with no rating change.</T>
        <View style={{ gap: space[2] }}>
          <Button label="Report" onPress={report} loading={busy} disabled={!pick} />
          <Button label="Cancel" variant="ghost" onPress={() => router.back()} />
        </View>
      </ScrollView>
    </Screen>
  );
}
