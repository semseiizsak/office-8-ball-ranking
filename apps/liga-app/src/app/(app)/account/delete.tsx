// B1.7 Delete account, step B1.7.1 What happens. In app and complete, per App Store 5.1.1(v).
import { router, useFocusEffect } from 'expo-router';
import { Download, Minus } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { deletionSummary } from '@/lib/account';
import { useAuth } from '@/providers/auth';
import { space, useTheme } from '@/theme';
import { Button, Card, Icon, Screen, Skeleton, T } from '@/ui';
import { Header } from '@/ui/list-row';

export default function DeleteAccount() {
  const { t } = useTheme();
  const { session } = useAuth();
  const [sum, setSum] = useState<Awaited<ReturnType<typeof deletionSummary>> | null>(null);
  const load = useCallback(async () => { if (session) setSum(await deletionSummary(session.user.id)); }, [session]);
  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (!sum) return <Screen><Header title="Delete account" /><View style={{ padding: space[4], gap: space[3] }}><Skeleton h={200} /><Skeleton h={80} /></View></Screen>;

  const m = `${sum.matches} ${sum.matches === 1 ? 'match' : 'matches'}`;
  const items = [
    'Profile and photo are removed',
    sum.matches ? `Your ${m} stay as Former player, so ladders keep their history` : 'You have no matches yet, so no ladder keeps your name',
    ...(sum.coins || sum.cards ? ['Coins, cards and badges are gone'] : ['Badges are gone']),
    'Chat messages are removed',
    ...sum.owned.map((o) => `${o.league} needs a new owner`),
  ];
  const line = (text: string) => (
    <View key={text} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
      <View style={{ paddingTop: 2 }}><Icon as={Minus} size={18} color={t.text2} /></View>
      <T style={{ flex: 1 }}>{text}</T>
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Delete account" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 }}>
        <T v="title">Here&apos;s what happens</T>
        <View style={{ gap: space[3] }}>{items.map(line)}</View>

        {sum.paying.map((p) => (
          <Card key={p.teamId} style={{ gap: space[3] }}>
            <T v="heading">You pay for {p.team}&apos;s {p.plan} plan</T>
            <T v="small" c="text2">Deleting your account does not stop App Store billing. Cancel it first.</T>
            <Button label="Manage in App Store" size="md" variant="secondary" onPress={() => router.push('/plans/manage')} />
          </Card>
        ))}

        <Card onPress={() => router.push('/account/data')} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <Icon as={Download} />
          <View style={{ flex: 1 }}>
            <T v="heading">Download your data first</T>
            <T v="small" c="text2">{sum.matches ? m : 'Your profile'} and everything else as a JSON file</T>
          </View>
        </Card>
        <Button label="Questions? Contact support" variant="ghost" size="md" onPress={() => router.push('/feedback')} />

        <Button label="Keep my account" variant="primary" onPress={() => router.back()} />
        <Button label="Continue" variant="secondary" onPress={() => router.push(sum.owned.length ? '/account/handover' : '/account/confirm')} />
      </ScrollView>
    </Screen>
  );
}
