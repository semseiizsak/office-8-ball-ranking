// B1.7.4 Account deleted. Close signs out and lands on the welcome screen.
import { Stack, useLocalSearchParams } from 'expo-router';
import { ScrollView, View } from 'react-native';

import { finishDeletion } from '@/lib/account';
import { space } from '@/theme';
import { Button, Card, Screen, T } from '@/ui';

export default function Deleted() {
  const { handed, paying } = useLocalSearchParams<{ handed?: string; paying?: string }>();
  const names = handed ? (JSON.parse(handed) as string[]) : [];
  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ flexGrow: 1, padding: space[6], gap: space[4] }}>
        <View style={{ flex: 1, justifyContent: 'center', gap: space[3] }}>
          <T v="title">Account deleted</T>
          <T c="text2">Thanks for playing. You&apos;re always welcome back with a new account.</T>
        </View>
        {paying ? <Card><T>Cancel your plan in your app store. Billing runs through your app store, not through Liga.</T></Card> : null}
        {names.length ? <Card><T>Your leagues play on. {names.join(', ')}.</T></Card> : null}
        <Button label="Close" onPress={finishDeletion} />
      </ScrollView>
    </Screen>
  );
}
