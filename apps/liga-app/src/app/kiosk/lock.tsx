// X1.3 Lock the tablet: Guided Access on iPad, app pinning on Android. A lock that cannot be ended needs MDM.
import { router, useLocalSearchParams } from 'expo-router';
import { Info } from 'lucide-react-native';
import { Linking, ScrollView, View } from 'react-native';

import { radius, space, useTheme } from '@/theme';
import { Button, Icon, Screen, T } from '@/ui';
import { KioskTop } from '@/ui/kiosk-kit';

const IPAD = [
  'Open Settings, Accessibility, Guided Access, and turn it on.',
  'Tap Passcode Settings and set a Guided Access passcode.',
  'Come back to Liga, triple click the top button and tap Start.',
];
const ANDROID = [
  'Open Settings, Security, App pinning, and turn it on.',
  'Come back to Liga and open Overview, the square button or a swipe up and hold.',
  'Tap the Liga icon at the top of the card and tap Pin.',
];

export default function LockHelp() {
  const { t } = useTheme();
  const { first } = useLocalSearchParams<{ first?: string }>();
  const done = () => (router.canGoBack() ? router.back() : router.replace('/kiosk'));

  const steps = (title: string, list: string[]) => (
    <View style={{ gap: space[3], backgroundColor: t.surface, borderRadius: radius.md, padding: space[5] }}>
      <T v="section">{title}</T>
      {list.map((s, i) => (
        <View key={s} style={{ flexDirection: 'row', gap: space[3], alignItems: 'flex-start' }}>
          <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}><T v="label">{i + 1}</T></View>
          <T v="body" style={{ flex: 1, paddingTop: 5 }}>{s}</T>
        </View>
      ))}
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']} style={{ backgroundColor: t.overlay }}>
      <KioskTop title="Lock this tablet" sub="So nobody leaves Liga by accident." onClose={first ? undefined : done} />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        {steps('iPad, Guided Access', IPAD)}
        <T v="small" c="text2">To end Guided Access, triple click the top button and enter its passcode. Then use the kiosk menu to leave the kiosk.</T>
        {steps('Android, App pinning', ANDROID)}
        <View style={{ flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: t.surface2 }}>
          <Icon as={Info} size={20} color={t.text2} />
          <T v="small" c="text2" style={{ flex: 1 }}>
            Guided Access and app pinning can be ended by anyone with the passcode. A lock that stays on needs a managed tablet (MDM): Autonomous Single App Mode on iPad, Lock task mode on Android. Your IT can set that up.
          </T>
        </View>
        <T v="small" c="text2">Liga keeps the screen on while the kiosk runs. Turn that off in the kiosk menu if the tablet is not plugged in.</T>
        <View style={{ gap: space[3], marginTop: space[2] }}>
          <Button label="Open Settings" variant="secondary" onPress={() => Linking.openSettings()} />
          <Button label={first ? 'Done, start the kiosk' : 'Done'} onPress={done} />
        </View>
      </ScrollView>
    </Screen>
  );
}
