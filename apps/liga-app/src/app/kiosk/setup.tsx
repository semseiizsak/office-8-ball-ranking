// X1.1 Set up a kiosk (on the admin's device; X1.2 pairing a second tablet needs the backend), X1.17 this device's kiosk
import { router, useFocusEffect } from 'expo-router';
import { Tablet } from 'lucide-react-native';
import { useCallback, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, Switch, View } from 'react-native';

import { isAdmin } from '@/lib/admin';
import { KIOSK_DEFAULTS, SAVER_CHOICES, saverLabel, setActive, setupKiosk, thisDevice, unpairKiosk, validPin, type Kiosk } from '@/lib/kiosk';
import { setModules } from '@/lib/module-settings';
import { isOn } from '@/lib/modules';
import { useAuth } from '@/providers/auth';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Button, Card, Empty, Field, Icon, Screen, Seg, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';

export default function KioskSetup() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, me, reloadLeagues } = useLeague();
  const [current, setCurrent] = useState<{ kiosk: Kiosk; active: boolean } | null>(null);
  const [name, setName] = useState('Table 1');
  const [guests, setGuests] = useState(KIOSK_DEFAULTS.allowGuests);
  const [awake, setAwake] = useState(KIOSK_DEFAULTS.keepAwake);
  const [saver, setSaver] = useState(String(KIOSK_DEFAULTS.saverAfter));
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [busy, setBusy] = useState(false);

  useFocusEffect(useCallback(() => { thisDevice().then(setCurrent); }, []));

  if (!league || !session) return null;
  const user = session.user;
  const mismatch = pin2.length === 6 && pin !== pin2;
  const ok = validPin(pin) && pin === pin2 && name.trim().length > 0;
  const fail = () => Alert.alert('That did not work', 'Nothing was changed. Try again in a moment.');

  const turnOn = async () => {
    setBusy(true);
    try { await setModules(user, league.id, { kiosk: true }); await reloadLeagues(league.id); } catch { fail(); }
    setBusy(false);
  };
  const start = async () => {
    setBusy(true);
    try {
      await setupKiosk(user, league.id, { name, pin, settings: { allowGuests: guests, keepAwake: awake, saverAfter: Number(saver) } });
      setBusy(false);
      router.replace('/kiosk');
      router.push({ pathname: '/kiosk/lock', params: { first: '1' } });
    } catch { setBusy(false); fail(); }
  };
  const open = async () => { await setActive(true); router.replace('/kiosk'); };
  const unpair = (k: Kiosk) => Alert.alert(`Unpair ${k.name}?`, 'This device forgets the kiosk. Matches stay in the league.', [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Unpair', style: 'destructive', onPress: async () => { await unpairKiosk(k); setCurrent(null); } },
  ]);

  const toggle = (label: string, value: boolean, set: (v: boolean) => void, first = false) => (
    <Row first={first} label={label} right={<Switch accessibilityLabel={label} value={value} onValueChange={set} trackColor={{ true: t.win, false: t.surface3 }} thumbColor="#FFFFFF" />} />
  );

  const body = () => {
    if (!isAdmin(me)) return <Empty icon={Tablet} title="Admins set up kiosks" body="Ask an owner or admin to turn a tablet into a kiosk for this league." />;
    if (league.archived_at) return <Empty icon={Tablet} title={`${league.name} is archived`} body="Restore the league to use a kiosk again." />;
    if (!isOn(league, 'kiosk')) return (
      <Card style={{ gap: space[3] }}>
        <T v="heading">Kiosk mode is off</T>
        <T v="small" c="text2">Turn it on for {league.name} to put a shared tablet by the table.</T>
        <Button label="Turn on Kiosk mode" size="md" onPress={turnOn} loading={busy} />
      </Card>
    );
    return (
      <View style={{ gap: space[5] }}>
        {current ? (
          <Card style={{ gap: space[3] }}>
            <T v="heading">This device is {current.kiosk.name}</T>
            <T v="small" c="text2">Kiosk for {current.kiosk.league_id === league.id ? league.name : 'another league'}, set up by {current.kiosk.paired_by_name}.</T>
            <Button label="Open the kiosk" size="md" onPress={open} />
            <Button label="Unpair this device" size="md" variant="ghost" onPress={() => unpair(current.kiosk)} />
          </Card>
        ) : null}
        <View style={{ gap: space[2] }}>
          {['Players tap their face', 'They play', 'They tap who won'].map((s, i) => (
            <View key={s} style={{ flexDirection: 'row', alignItems: 'center', gap: space[3] }}>
              <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: t.surface2, alignItems: 'center', justifyContent: 'center' }}><T v="label">{i + 1}</T></View>
              <T v="body">{s}</T>
            </View>
          ))}
        </View>
        <Field label="Kiosk name" value={name} onChangeText={setName} maxLength={24} />
        <Group title="Rules">
          {toggle('Allow guests', guests, setGuests, true)}
          {toggle('Keep the screen on', awake, setAwake)}
        </Group>
        <View style={{ gap: space[2] }}>
          <T v="label" c="text2">Screensaver after</T>
          <Seg options={SAVER_CHOICES.map((s) => ({ value: String(s), label: saverLabel(s) }))} value={saver} onChange={setSaver} />
        </View>
        <Field label="Admin PIN for leaving the kiosk, 6 digits" value={pin} onChangeText={(x) => setPin(x.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={6} />
        <Field label="Repeat the PIN" value={pin2} onChangeText={(x) => setPin2(x.replace(/\D/g, ''))} keyboardType="number-pad" secureTextEntry maxLength={6}
          error={mismatch ? 'The two PINs are not the same yet' : undefined} />
        <T v="caption" c="text3">Anyone who knows this PIN can open the kiosk menu and leave the kiosk.</T>
        <Button label={current ? 'Set up again' : 'Start the kiosk'} onPress={start} loading={busy} disabled={!ok} />
        <View style={{ flexDirection: 'row', gap: space[3], padding: space[4], borderRadius: radius.md, backgroundColor: t.surface }}>
          <Icon as={Tablet} size={20} color={t.text2} />
          <T v="small" c="text2" style={{ flex: 1 }}>In this test build the kiosk runs on this device. Pairing another tablet with a QR code comes with the server.</T>
        </View>
      </View>
    );
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Set up a kiosk" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60, maxWidth: 640, width: '100%', alignSelf: 'center' }} keyboardShouldPersistTaps="handled">
          <T v="body" c="text2">A shared tablet by the table. Players tap their face, play, tap who won.</T>
          {body()}
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
