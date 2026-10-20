// A15.2 Claim from the tablet: a guest scans this to take their player to their own phone (the existing claim flow, A15.1).
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, View } from 'react-native';

import { claimLink, claimState, kioskHome, thisDevice } from '@/lib/kiosk';
import type { Member } from '@/lib/types';
import { space } from '@/theme';
import { Avatar, Button, Screen, T } from '@/ui';
import { KioskQR, KioskTop, useKioskSize } from '@/ui/kiosk-kit';

const VALID = 10 * 60_000;

export default function ClaimQR() {
  const { m = '' } = useLocalSearchParams<{ m: string }>();
  const { tablet, width, height, pad } = useKioskSize();
  const [state, setState] = useState<{ member: Member; claimed: boolean; code: string | null } | null>(null);
  const [until, setUntil] = useState(() => Date.now() + VALID);
  const [now, setNow] = useState(() => Date.now());
  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/kiosk')), []);

  const load = useCallback(async () => {
    const dev = await thisDevice();
    const s = await claimState(m);
    if (!dev || !s) return close();
    setState({ ...s, code: (await kioskHome(dev.kiosk)).code });
  }, [m, close]);
  // Loaders only set state after an await.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  // A fresh code every 10 minutes, and a check whether the player was taken over meanwhile.
  useEffect(() => {
    if (now < until) return;
    const id = setTimeout(() => { setUntil(Date.now() + VALID); load(); }, 0);
    return () => clearTimeout(id);
  }, [now, until, load]);

  if (!state) return <Screen edges={['top', 'bottom']}>{null}</Screen>;
  const { member, claimed, code } = state;
  const left = Math.max(0, until - now), min = Math.floor(left / 60000), sec = Math.floor((left % 60000) / 1000);
  const size = Math.min(tablet ? 420 : 240, Math.min(width, height) - pad * 2 - 80);

  return (
    <Screen edges={['top', 'bottom']}>
      <KioskTop title={claimed ? `${member.display_name} is on a phone` : `Take ${member.display_name} to your phone`} onClose={close} />
      <ScrollView contentContainerStyle={{ padding: pad, gap: space[5], alignItems: 'center' }}>
        <Avatar name={member.display_name} colour={member.colour} jersey={member.jersey} size={tablet ? 96 : 64} />
        {claimed || !code ? (
          <T v="body" c="text2" center>{claimed ? `${member.display_name} already plays from their own phone.` : 'The invite code expired. Ask an admin for a new one.'}</T>
        ) : (
          <View style={{ alignItems: 'center', gap: space[4] }}>
            <KioskQR value={claimLink(code, member.id)} size={size} />
            <T v={tablet ? 'title' : 'section'} center>Scan to take {member.display_name} to your phone</T>
            <T v="body" c="text2" center>Your matches and rating come with you.</T>
            <T v="caption" c="text3" center>New code in {min}:{String(sec).padStart(2, '0')}</T>
          </View>
        )}
        <Button label="Done" onPress={close} style={{ minWidth: 240 }} />
      </ScrollView>
    </Screen>
  );
}
