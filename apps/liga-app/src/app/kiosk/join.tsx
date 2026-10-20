// X1.12 Join on your phone: a full screen invite QR. Closes on a tap or after 60 s.
import { router } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { joinLink, kioskHome, thisDevice, type KioskHome } from '@/lib/kiosk';
import { prettyCode } from '@/lib/invite';
import { radius, space, useTheme } from '@/theme';
import { Button, Screen, T } from '@/ui';
import { bigText, KioskQR, KioskTop, useKioskSize } from '@/ui/kiosk-kit';

const STEPS = ['Scan with your camera', 'Sign in with your email', 'Pick your number and colour'];

export default function KioskJoin() {
  const { t } = useTheme();
  const { tablet, wide, width, height, pad } = useKioskSize();
  const [home, setHome] = useState<KioskHome | null>(null);
  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/kiosk')), []);

  useEffect(() => { thisDevice().then(async (d) => { if (d) setHome(await kioskHome(d.kiosk)); else close(); }); }, [close]);
  useEffect(() => { const id = setTimeout(close, 60_000); return () => clearTimeout(id); }, [close]);

  if (!home) return <Screen edges={['top', 'bottom']}>{null}</Screen>;
  const size = Math.min(600, Math.floor((wide ? height - 220 : width - pad * 2 - 40)), tablet ? 600 : 260);

  const steps = () => (
    <View style={{ gap: space[3] }}>
      {STEPS.map((s, i) => (
        <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
          <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}><T v="heading">{i + 1}</T></View>
          <T v="heading" style={tablet ? bigText(22) : undefined}>{s}</T>
        </View>
      ))}
    </View>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <KioskTop title={`Join ${home.league.name}`} sub="Scan with your camera. No typing needed." onClose={close} />
      <ScrollView contentContainerStyle={{ padding: pad, gap: space[6], flexDirection: wide ? 'row' : 'column', alignItems: 'center', justifyContent: 'center', flexGrow: 1 }}>
        {home.code ? <KioskQR value={joinLink(home.code)} size={size} /> : (
          <View style={{ padding: space[6], borderRadius: radius.md, backgroundColor: t.surface }}><T v="heading" center>The invite code expired. Ask an admin for a new one.</T></View>
        )}
        <View style={{ gap: space[5], maxWidth: 520 }}>
          {steps()}
          {home.code ? <T v="body" c="text2">Or enter the code {prettyCode(home.code)} in Liga, Join a league.</T> : null}
          <Button label="Done" variant="secondary" onPress={close} />
        </View>
      </ScrollView>
    </Screen>
  );
}
