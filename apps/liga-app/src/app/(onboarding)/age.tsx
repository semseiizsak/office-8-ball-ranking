// A4 How old are you? and A4.1 Liga is for 13 and over. Asked once per new account; only the age band is kept.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, View } from 'react-native';

import { setBirth } from '@/lib/account';
import { auth } from '@/lib/api';
import { useAuth } from '@/providers/auth';
import { font, radius, space, useTheme } from '@/theme';
import { Button, Screen, T } from '@/ui';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const THIS_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: 96 }, (_, i) => THIS_YEAR - 5 - i);

export default function Age() {
  const { t } = useTheme();
  const { blocked: was } = useLocalSearchParams<{ blocked?: string }>();
  const { session } = useAuth();
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [blocked, setBlocked] = useState(was === '1');

  const chip = (label: string, on: boolean, onPress: () => void, w?: number) => (
    <Pressable key={label} accessibilityRole="radio" accessibilityState={{ selected: on }} onPress={onPress}
      style={({ pressed }) => ({ width: w, flexGrow: w ? 0 : 1, flexBasis: w ? undefined : '22%', height: 44, borderRadius: radius.sm, alignItems: 'center', justifyContent: 'center',
        backgroundColor: on ? t.primary : pressed || t.scheme === 'light' ? t.surface3 : t.surface2 })}>
      <T style={{ fontFamily: font.semibold, color: on ? t.onPrimary : t.text }}>{label}</T>
    </Pressable>
  );

  const go = async () => {
    if (!session || month === null || year === null) return;
    setBusy(true);
    const band = await setBirth(session.user, year, month + 1);
    setBusy(false);
    if (band === 'under13') setBlocked(true);
    else if (router.canGoBack()) router.back(); else router.replace('/');
  };

  if (blocked) {
    return (
      <Screen edges={['top', 'bottom']}>
        <Stack.Screen options={{ gestureEnabled: false }} />
        <View style={{ flex: 1, padding: space[6], gap: space[4], justifyContent: 'center' }}>
          <T v="title">Liga is for 13 and over</T>
          <T c="text2">Ask a parent or coach to run the league. You can still play on the club tablet as a guest.</T>
        </View>
        <View style={{ padding: space[6] }}>
          <Button label="OK" onPress={() => auth.signOut()} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <Stack.Screen options={{ gestureEnabled: false }} />
      <ScrollView contentContainerStyle={{ padding: space[6], gap: space[5] }}>
        <View style={{ gap: space[2], marginTop: space[6] }}>
          <T v="title">When were you born?</T>
          <T c="text2">We only use this to set up Liga for your age.</T>
        </View>
        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Month</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
            {MONTHS.map((m, i) => chip(m, month === i, () => setMonth(i)))}
          </View>
        </View>
        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Year</T>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space[2] }}>
            {YEARS.map((y) => chip(String(y), year === y, () => setYear(y), 76))}
          </ScrollView>
        </View>
      </ScrollView>
      <View style={{ padding: space[6] }}>
        <Button label="Continue" loading={busy} disabled={month === null || year === null} onPress={go} />
      </View>
    </Screen>
  );
}
