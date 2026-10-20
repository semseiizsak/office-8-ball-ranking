// M16.4 Match log: every change to one match, oldest first.
import { useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { matchLog } from '@/lib/confirm';
import type { Audit } from '@/lib/confirm-engine';
import { clock, dayLabel } from '@/lib/time';
import { space, useTheme } from '@/theme';
import { Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

export default function MatchLog() {
  const { t } = useTheme();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [rows, setRows] = useState<Audit[] | null>(null);
  const load = useCallback(async () => { setRows(await matchLog(id)); }, [id]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  return (
    <Screen>
      <Header title="Match log" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: 0, paddingBottom: 60 }}>
        {!rows ? <Skeleton h={120} /> : !rows.length ? <T c="text2">Logged before the match log started. No changes since.</T> : rows.map((a, i) => (
          <View key={a.id} style={{ flexDirection: 'row', gap: space[3] }}>
            <View style={{ alignItems: 'center', width: 12 }}>
              <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: i === rows.length - 1 ? t.text : t.lineStrong, marginTop: 4 }} />
              {i < rows.length - 1 ? <View style={{ width: 2, flex: 1, backgroundColor: t.line }} /> : null}
            </View>
            <View style={{ flex: 1, paddingBottom: space[4], gap: 2 }}>
              <T v="label">{a.text}</T>
              <T v="caption" c="text3">{dayLabel(a.at)}, {clock(a.at)}</T>
            </View>
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
