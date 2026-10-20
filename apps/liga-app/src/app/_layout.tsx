import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold, useFonts } from '@expo-google-fonts/inter';
import { Sora_800ExtraBold } from '@expo-google-fonts/sora';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import { Pressable, Text, useColorScheme, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { usePendingInvite } from '@/lib/invite';
import { AuthProvider, useAuth } from '@/providers/auth';
import { LeagueProvider, useLeague } from '@/providers/league';
import { ThemeContext, themes } from '@/theme';
import { SystemGate } from '@/ui/system-gate';

SplashScreen.preventAutoHideAsync();

// B9.5 shared error screen: any crash in a screen lands here instead of a white page.
export function ErrorBoundary({ retry }: { error: Error; retry: () => Promise<void> }) {
  return (
    <View style={{ flex: 1, backgroundColor: themes.dark.bg, justifyContent: 'center', padding: 24, gap: 12 }}>
      <Text style={{ fontFamily: 'System', fontSize: 22, fontWeight: '800', color: '#fff' }}>Something went wrong</Text>
      <Text style={{ fontSize: 15, color: themes.dark.text2 }}>Your matches are safe on this phone. Try again, and if it keeps happening, reset test data in Settings.</Text>
      <Pressable onPress={retry} style={{ marginTop: 8, height: 52, borderRadius: 999, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
        <Text style={{ fontSize: 16, fontWeight: '700', color: '#0A0A0A' }}>Try again</Text>
      </Pressable>
    </View>
  );
}

type Mode = 'system' | 'dark' | 'light';

export default function RootLayout() {
  const [loaded] = useFonts({ Sora_800ExtraBold, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold, Inter_800ExtraBold });
  const system = useColorScheme();
  const [mode, setModeState] = useState<Mode>('system');
  useEffect(() => { AsyncStorage.getItem('liga.theme').then((m) => m && setModeState(m as Mode)); }, []);
  const setMode = (m: Mode) => { setModeState(m); AsyncStorage.setItem('liga.theme', m); };
  const t = themes[mode === 'system' ? (system === 'light' ? 'light' : 'dark') : mode];
  const nav = useMemo(() => {
    const base = t.scheme === 'light' ? DefaultTheme : DarkTheme;
    return { ...base, colors: { ...base.colors, background: t.bg, card: t.bg, text: t.text, border: t.line, primary: t.brand } };
  }, [t]);

  if (!loaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: t.bg }}>
      <ThemeContext.Provider value={{ t, mode, setMode }}>
        <ThemeProvider value={nav}>
          <StatusBar style={t.scheme === 'light' ? 'dark' : 'light'} />
          <AuthProvider>
            <LeagueProvider>
              <RootNav />
            </LeagueProvider>
          </AuthProvider>
        </ThemeProvider>
      </ThemeContext.Provider>
    </GestureHandlerRootView>
  );
}

function RootNav() {
  const { session, ready } = useAuth();
  const league = useLeague();
  usePendingInvite(); // N4.3: an invite link opened before sign in continues here
  const booting = !ready || (session && !league.ready);
  useEffect(() => { if (!booting) SplashScreen.hideAsync(); }, [booting]);
  if (booting) return null;
  const signedIn = !!session;
  const hasLeague = league.leagues.length > 0;
  return (
    <>
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn && hasLeague}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(onboarding)" options={{ presentation: hasLeague ? 'modal' : 'card' }} />
      </Stack.Protected>
    </Stack>
    <SystemGate />{/* A0.1, B9.3 to B9.5 from remote config */}
    </>
  );
}
