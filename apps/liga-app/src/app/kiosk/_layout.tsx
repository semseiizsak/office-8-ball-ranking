// X1 Kiosk route group: full screen, no back gesture, screen kept on, idle timer to the screensaver (X1.14).
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, Stack, useNavigation, usePathname } from 'expo-router';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { BackHandler, View } from 'react-native';

import { thisDevice, type Kiosk } from '@/lib/kiosk';
import { useTheme } from '@/theme';

// Screens with their own timing (or used on a phone) never jump to the screensaver.
const NO_SAVER = new Set(['/kiosk/saver', '/kiosk/setup', '/kiosk/claim', '/kiosk/play', '/kiosk/lock']);

export default function KioskLayout() {
  const { t } = useTheme();
  const path = usePathname();
  const navigation = useNavigation();
  const [dev, setDev] = useState<{ kiosk: Kiosk; active: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useLayoutEffect(() => { navigation.setOptions({ gestureEnabled: false, animation: 'fade' }); }, [navigation]);
  // Reads the device binding after every navigation, so settings changed in the admin menu apply right away.
  useEffect(() => { thisDevice().then(setDev); }, [path]);

  const active = !!dev?.active;
  const awake = active && dev!.kiosk.settings.keepAwake;
  useEffect(() => {
    if (!awake) return;
    activateKeepAwakeAsync('kiosk').catch(() => {});
    return () => { deactivateKeepAwake('kiosk').catch(() => {}); };
  }, [awake]);

  // Android back on the kiosk home does nothing; inside the kiosk it steps back as usual.
  useEffect(() => {
    if (!active) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => path === '/kiosk');
    return () => sub.remove();
  }, [active, path]);

  const after = dev?.kiosk.settings.saverAfter ?? 60;
  const poke = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    if (!active || NO_SAVER.has(path)) return;
    timer.current = setTimeout(() => (path === '/kiosk' ? router.push('/kiosk/saver') : router.replace('/kiosk/saver')), after * 1000);
  }, [active, path, after]);
  useEffect(() => { poke(); return () => { if (timer.current) clearTimeout(timer.current); }; }, [poke]);

  return (
    <View style={{ flex: 1, backgroundColor: t.bg }} onTouchStart={poke}>
      <Stack screenOptions={{ headerShown: false, gestureEnabled: false, animation: 'fade', contentStyle: { backgroundColor: t.bg } }}>
        <Stack.Screen name="lock" options={{ presentation: 'modal', gestureEnabled: true, animation: 'default' }} />
      </Stack>
    </View>
  );
}
