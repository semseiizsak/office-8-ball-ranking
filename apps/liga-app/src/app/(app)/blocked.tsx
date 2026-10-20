import { useFocusEffect } from 'expo-router';
import { UserX } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, View } from 'react-native';

import { block, listBlocks, unblock } from '@/lib/chat';
import { useAuth } from '@/providers/auth';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

type B = Awaited<ReturnType<typeof listBlocks>>[number];

// K10.2 and B1.5.1 Blocked members: who you blocked, where, and unblock with undo.
export default function Blocked() {
  const { t } = useTheme();
  const { session } = useAuth();
  const [list, setList] = useState<B[] | null>(null);
  const load = useCallback(async () => { if (session) setList(await listBlocks(session.user)); }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const off = (b: B) => Alert.alert(`Unblock ${b.name}?`, "You'll see their messages again.", [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Unblock', onPress: async () => {
      await unblock(session!.user, b.member_id); load();
      Alert.alert(`${b.name} is unblocked`, undefined, [{ text: 'Undo', onPress: async () => { await block(session!.user, b.member_id); load(); } }, { text: 'OK' }]);
    } },
  ]);

  return (
    <Screen>
      <Header title="Blocked members" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[3], paddingBottom: 60 }}>
        <T c="text2">You won&apos;t see their messages or comments. You can still play them in leagues, and they are not told.</T>
        {list === null ? <Skeleton h={64} /> : !list.length ? <Empty icon={UserX} title="You haven't blocked anyone." body="Block someone from the message menu in the league chat." /> : null}
        {list?.map((b) => (
          <View key={b.member_id} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], backgroundColor: t.surface, borderRadius: radius.md, padding: space[3] }}>
            <Avatar name={b.name} colour="ink" size={44} ring={false} />
            <View style={{ flex: 1 }}>
              <T v="heading" numberOfLines={1}>{b.name}</T>
              <T v="caption" c="text3" numberOfLines={1}>{b.league}{'\n'}Blocked on {new Date(b.at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}</T>
            </View>
            <Button label="Unblock" size="sm" variant="secondary" onPress={() => off(b)} />
          </View>
        ))}
      </ScrollView>
    </Screen>
  );
}
