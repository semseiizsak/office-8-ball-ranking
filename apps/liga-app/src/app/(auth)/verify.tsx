import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';

import { auth } from '@/lib/api';
import { font, radius, space, useTheme } from '@/theme';
import { Button, IconButton, Screen, T } from '@/ui';

// A3.1: 6 digit code entry with resend timer.
export default function Verify() {
  const { t } = useTheme();
  const { email } = useLocalSearchParams<{ email: string }>();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const [wait, setWait] = useState(60);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => {
    const id = setInterval(() => setWait((w) => (w > 0 ? w - 1 : 0)), 1000);
    return () => clearInterval(id);
  }, []);

  const verify = async (token: string) => {
    setBusy(true); setError(undefined);
    try { await auth.verify(email, token); } catch { setError('That code did not work. Check the latest email and try again.'); setCode(''); }
    setBusy(false);
    // On success the auth guard moves us on.
  };

  const resend = async () => {
    setWait(60);
    await auth.sendCode(email);
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: space[6], gap: space[6] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
        <View style={{ gap: space[2] }}>
          <T v="title">Check your email</T>
          <T c="text2">We sent a code to {email}</T>
          <T v="caption" c="text3">Test build: any 6 digits sign you in.</T>
        </View>
        <Pressable onPress={() => input.current?.focus()} style={{ flexDirection: 'row', gap: 8 }}>
          {Array.from({ length: 6 }).map((_, i) => {
            const on = i === code.length;
            return (
              <View key={i} style={{ flex: 1, height: 60, borderRadius: radius.sm, backgroundColor: t.scheme === 'light' ? t.surface3 : t.surface2, alignItems: 'center', justifyContent: 'center',
                borderWidth: 2, borderColor: error ? t.error : on ? t.text : 'transparent' }}>
                <T v="number" style={{ fontSize: 26, fontFamily: font.heavy }}>{code[i] ?? ''}</T>
              </View>
            );
          })}
        </Pressable>
        <TextInput ref={input} value={code} autoFocus keyboardType="number-pad" textContentType="oneTimeCode" autoComplete="one-time-code" maxLength={6}
          onChangeText={(v) => { const d = v.replace(/\D/g, ''); setCode(d); if (d.length === 6) verify(d); }}
          style={{ position: 'absolute', opacity: 0, height: 1, width: 1 }} />
        {error ? <T v="small" c="error">{error}</T> : null}
        <View style={{ flex: 1 }} />
        <Button label="Verify" onPress={() => verify(code)} loading={busy} disabled={code.length !== 6} />
        <Button label={wait ? `Resend code in ${wait}s` : 'Resend code'} variant="ghost" disabled={wait > 0} onPress={resend} />
      </KeyboardAvoidingView>
    </Screen>
  );
}
