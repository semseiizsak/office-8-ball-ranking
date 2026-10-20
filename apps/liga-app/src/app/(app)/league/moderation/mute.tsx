// K11.3 Mute member: a timed break from chat and comments, without removing anyone
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { VolumeX } from 'lucide-react-native';
import { useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, Pressable, ScrollView, View } from 'react-native';

import { canMute, MUTE_FOR, muteMember, type MuteScope } from '@/lib/moderation';
import { useAuth } from '@/providers/auth';
import type { Member } from '@/lib/types';
import { useLeague } from '@/providers/league';
import { radius, space, useTheme } from '@/theme';
import { Avatar, Button, Empty, Field, Screen, Seg, T } from '@/ui';
import { Header } from '@/ui/list-row';

type Span = (typeof MUTE_FOR)[number]['label'];

export default function MuteScreen() {
  const { t } = useTheme();
  const { session } = useAuth();
  const { league, members, me } = useLeague();
  const params = useLocalSearchParams<{ member?: string }>();
  const [picked, setPicked] = useState<string | null>(params.member ?? null);
  const [span, setSpan] = useState<Span>('24 hours');
  const [scope, setScope] = useState<MuteScope>('chat');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!league || !session) return null;
  const target = members.find((m) => m.id === picked) ?? null;
  const options = members.filter((m) => canMute(me, m) && !m.guest); // guests have no account, so nothing to mute

  const pickRow = (m: Member) => (
    <Pressable key={m.id} accessibilityRole="button" onPress={() => setPicked(m.id)}
      style={({ pressed }) => ({ minHeight: 60, flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: space[4], borderRadius: radius.md, backgroundColor: pressed ? t.surface3 : t.surface })}>
      <Avatar name={m.display_name} colour={m.colour} jersey={m.jersey} size={40} />
      <T v="heading" style={{ flex: 1 }} numberOfLines={1}>{m.display_name}</T>
    </Pressable>
  );

  if (!target) {
    return (
      <Screen>
        <Header title="Mute someone" />
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[2], paddingBottom: 60 }}>
          {options.length ? options.map(pickRow) : <Empty icon={VolumeX} title="Nobody to mute" body="Admins can mute players. Only the owner can mute an admin." />}
        </ScrollView>
      </Screen>
    );
  }

  const first = target.display_name.split(' ')[0];
  const spanChip = (label: Span) => {
    const on = label === span;
    return (
      <Pressable key={label} accessibilityRole="radio" accessibilityState={{ checked: on }} onPress={() => setSpan(label)}
        style={{ width: '48%', flexGrow: 1, height: 44, borderRadius: radius.pill, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? t.primary : t.surface2 }}>
        <T v="label" c={on ? 'onPrimary' : 'text'}>{label}</T>
      </Pressable>
    );
  };
  const go = async () => {
    setBusy(true);
    try {
      await muteMember(session.user, league.id, target.id, { hours: MUTE_FOR.find((x) => x.label === span)!.hours, scope, reason });
      if (router.canGoBack()) router.back(); else router.replace('/league/moderation/muted' as Href);
    } catch (e) { Alert.alert("Couldn't mute", e instanceof Error ? e.message : 'Try again.'); }
    setBusy(false);
  };

  return (
    <Screen>
      <Header title="Mute" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }} keyboardShouldPersistTaps="handled">
          <T v="section">Mute {first} in {league.name}</T>
          <View style={{ gap: space[2] }}>
            <T v="label" c="text2">For how long</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>{MUTE_FOR.map((x) => spanChip(x.label))}</View>
          </View>
          <View style={{ gap: space[2] }}>
            <T v="label" c="text2">What it covers</T>
            <Seg value={scope} onChange={setScope} options={[{ value: 'chat', label: 'Chat and comments' }, { value: 'chat_photos', label: 'Also photos' }]} />
          </View>
          <Field label="Reason, only for the moderation log" value={reason} onChangeText={setReason} maxLength={300} placeholder="Optional" />
          <T c="text2">{first} can still play, log matches and react.</T>
          <Button label="Mute" onPress={go} loading={busy} disabled={target.id === me?.id} />
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
