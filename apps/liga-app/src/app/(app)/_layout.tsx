import { Stack } from 'expo-router';

import { useTheme } from '@/theme';
import { InboxRuntime } from '@/ui/inbox-runtime';

export default function AppLayout() {
  const { t } = useTheme();
  return (
    <>
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.bg } }}>
      <Stack.Screen name="(tabs)" />
      <Stack.Screen name="log" options={{ presentation: 'modal' }} />
      <Stack.Screen name="challenge/new" options={{ presentation: 'modal' }} />
      <Stack.Screen name="switcher" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.5, 0.9], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: t.overlay } }} />
      <Stack.Screen name="settings" />
      <Stack.Screen name="push-prompt" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.75], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: t.overlay } }} />
      <Stack.Screen name="elo" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 0.95], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: t.overlay } }} />
      <Stack.Screen name="dormant" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.6, 0.95], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: t.overlay } }} />
      <Stack.Screen name="season/wrap/[n]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="awards/[id]" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="crown" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7, 0.95], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: t.overlay } }} />
      <Stack.Screen name="cup/rules" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7, 0.95], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: t.overlay } }} />
      <Stack.Screen name="cup/champion" options={{ presentation: 'fullScreenModal' }} />
      <Stack.Screen name="schedule/pick" options={{ presentation: 'modal' }} />
      <Stack.Screen name="badges/unlock" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="cards/open" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="chest" options={{ presentation: 'fullScreenModal', animation: 'fade' }} />
      <Stack.Screen name="badges/[id]" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.75, 0.95], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: t.overlay } }} />
      <Stack.Screen name="badges/shame" options={{ presentation: 'formSheet', sheetAllowedDetents: [0.7, 0.95], sheetGrabberVisible: true, sheetCornerRadius: 24, contentStyle: { backgroundColor: t.overlay } }} />
      <Stack.Screen name="player/[id]" />
      <Stack.Screen name="match/[id]" />
      <Stack.Screen name="share/[id]" options={{ presentation: 'modal' }} />
      <Stack.Screen name="profile-edit" options={{ presentation: 'modal' }} />
      <Stack.Screen name="guest-new" options={{ presentation: 'modal' }} />
    </Stack>
    <InboxRuntime />
    </>
  );
}
