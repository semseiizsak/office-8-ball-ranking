// X1.15 Kiosk admin menu behind the 6 digit admin PIN, X1.16 Exit kiosk (exit or unpair)
import Constants from 'expo-constants';
import { router } from 'expo-router';
import { HelpCircle, LogOut, Moon, RefreshCw, Unlink } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, ScrollView, Switch, View } from 'react-native';

import { db } from '@/lib/api';
import { checkAdminPin, SAVER_CHOICES, saverLabel, setActive, thisDevice, unpairKiosk, updateKiosk, type Kiosk, type KioskSettings } from '@/lib/kiosk';
import { space, useTheme } from '@/theme';
import { Screen, Seg, T } from '@/ui';
import { KioskTop, PinPad, useKioskSize } from '@/ui/kiosk-kit';
import { Group, Row } from '@/ui/list-row';

export default function KioskAdmin() {
  const { t, mode, setMode } = useTheme();
  const { pad } = useKioskSize();
  const [k, setK] = useState<Kiosk | null>(null);
  const [league, setLeague] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const touched = useRef(0);
  const close = useCallback(() => (router.canGoBack() ? router.back() : router.replace('/kiosk')), []);

  useEffect(() => {
    thisDevice().then(async (d) => {
      if (!d) return close();
      setK(d.kiosk);
      setLeague((await db()).leagues.find((l) => l.id === d.kiosk.league_id)?.name ?? '');
    });
  }, [close]);
  // The menu closes itself after 60 s without a touch.
  useEffect(() => {
    if (!open) return;
    touched.current = Date.now();
    const id = setInterval(() => { if (Date.now() - touched.current > 60_000) close(); }, 5000);
    return () => clearInterval(id);
  }, [open, close]);

  if (!k) return <Screen edges={['top', 'bottom']}>{null}</Screen>;

  const submit = async (pin: string) => {
    const r = await checkAdminPin(k, pin);
    if (r.ok) { setError(null); setOpen(true); return true; }
    setError(r.locked ? `Too many tries. Try again in ${Math.max(1, Math.ceil(r.waitMs / 60000))} min.` : 'That PIN is not right.');
    return false;
  };
  const set = async (p: Partial<KioskSettings>) => setK(await updateKiosk(k.id, { settings: p }));
  const leave = async () => { await setActive(false); router.dismissTo('/'); };
  const unpair = async () => { await unpairKiosk(k); router.dismissTo('/'); };
  const exit = () => Alert.alert('Exit kiosk mode?', `The tablet stays paired. Open the kiosk from League settings to come back.\nIf Guided Access is on, triple click the top button to end it.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Unpair', style: 'destructive', onPress: () => Alert.alert(`Unpair ${k.name}?`, `This tablet forgets ${league}.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Unpair', style: 'destructive', onPress: unpair }]) },
    { text: 'Exit', onPress: leave },
  ]);

  if (!open) return (
    <Screen edges={['top', 'bottom']}>
      <KioskTop title="Kiosk menu" onClose={close} />
      <View style={{ flex: 1, justifyContent: 'center', padding: pad }}>
        <PinPad length={6} title="Enter the admin PIN" sub="The PIN set when this kiosk was made." error={error} onSubmit={submit} onCancel={close} />
      </View>
    </Screen>
  );

  const sw = (label: string, value: boolean, onChange: (v: boolean) => void, first = false) => (
    <Row first={first} label={label} right={<Switch accessibilityLabel={label} value={value} onValueChange={onChange} trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF" />} />
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flex: 1 }} onTouchStart={() => { touched.current = Date.now(); }}>
      <KioskTop title="Kiosk menu" sub={`${k.name}, ${league}, set up by ${k.paired_by_name}`} onClose={close} />
      <ScrollView contentContainerStyle={{ padding: pad, gap: space[5], maxWidth: 720, width: '100%', alignSelf: 'center' }}>
        <Group>
          <Row first icon={RefreshCw} label="Refresh now" onPress={() => router.dismissTo('/kiosk')} />
          <Row icon={HelpCircle} label="How to lock this tablet" onPress={() => router.push('/kiosk/lock')} />
        </Group>
        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Screensaver after</T>
          <Seg options={SAVER_CHOICES.map((s) => ({ value: String(s), label: saverLabel(s) }))} value={String(k.settings.saverAfter)} onChange={(v) => set({ saverAfter: Number(v) })} />
        </View>
        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Theme</T>
          <Seg options={[{ value: 'system', label: 'Auto' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} value={mode} onChange={setMode} />
        </View>
        <Group title="Rules">
          {sw('Allow guests', k.settings.allowGuests, (v) => set({ allowGuests: v }), true)}
          {sw('Keep the screen on', k.settings.keepAwake, (v) => set({ keepAwake: v }))}
          <Row icon={Moon} label="Brightness" value="Set it in Control Center" />
        </Group>
        <Group footer={`Liga ${Constants.expoConfig?.version ?? ''}`}>
          <Row first icon={LogOut} label="Exit kiosk" onPress={exit} />
          <Row icon={Unlink} label="Unpair this tablet" danger onPress={() => Alert.alert(`Unpair ${k.name}?`, `This tablet forgets ${league}.`, [{ text: 'Cancel', style: 'cancel' }, { text: 'Unpair', style: 'destructive', onPress: unpair }])} />
        </Group>
      </ScrollView>
      </View>
    </Screen>
  );
}
