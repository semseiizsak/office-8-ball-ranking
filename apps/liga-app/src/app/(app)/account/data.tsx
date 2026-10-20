// B1.6 Download your data: every record about you as one JSON file, handed to the share sheet (Files, Mail).
import { useFocusEffect } from 'expo-router';
import { FileJson } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, Share, View } from 'react-native';

import { deletionSummary, exportMyData, lastExport } from '@/lib/account';
import { longDate } from '@/lib/plans';
import { useAuth } from '@/providers/auth';
import { space, useTheme } from '@/theme';
import { Button, Card, Icon, Screen, T } from '@/ui';
import { Header } from '@/ui/list-row';

export default function DownloadData() {
  const { t } = useTheme();
  const { session } = useAuth();
  const [sum, setSum] = useState<Awaited<ReturnType<typeof deletionSummary>> | null>(null);
  const [last, setLast] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!session) return;
    setSum(await deletionSummary(session.user.id));
    setLast(await lastExport(session.user.id));
  }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  const prepare = async () => {
    if (!session) return;
    setBusy(true); setError(null);
    try {
      const r = await exportMyData(session.user);
      setLast(r.at);
      await Share.share({ title: 'Liga data', message: r.json }).catch(() => {}); // no share sheet (web): the file is still made
    } catch { setError("We couldn't prepare your file. Try again in a moment."); }
    setBusy(false);
  };

  const parts = sum ? [
    'Profile and players', `${sum.matches} ${sum.matches === 1 ? 'match' : 'matches'}`, 'challenges',
    ...(sum.coins ? ['coin history'] : []), ...(sum.cards ? ['cards'] : []), 'badges', 'chat messages you wrote',
  ] : [];

  return (
    <Screen>
      <Header title="Your data" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <T v="title">Download your data</T>
        <Card style={{ gap: space[2] }}>
          <T v="heading">What&apos;s in it</T>
          <T c="text2">{parts.length ? parts.join(', ') + '.' : 'Loading'}</T>
        </Card>
        <Card style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Icon as={FileJson} color={t.text} />
          <View style={{ flex: 1 }}>
            <T v="heading">JSON</T>
            <T v="small" c="text2">Every field, readable by most tools.</T>
          </View>
        </Card>
        <Button label="Prepare my file" variant="brand" loading={busy} onPress={prepare} />
        {error ? <T v="small" c="error">{error}</T> : null}
        {last ? <T v="small" c="text2" center>Last file made on {longDate(last)}.</T> : null}
        <T v="caption" c="text3" center>In this test build everything is on this phone, so your file is ready right away.</T>
      </ScrollView>
    </Screen>
  );
}
