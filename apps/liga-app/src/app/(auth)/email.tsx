import { router, useLocalSearchParams } from 'expo-router';
import { ArrowLeft, Mail } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, View } from 'react-native';

import { auth } from '@/lib/api';
import { space } from '@/theme';
import { Button, Field, IconButton, Screen, T } from '@/ui';

// A2.3 email sign in (code by email) with the A3 consent line. Apple and Google come with the dev build.
// With `join` set (from an invite link, N4.3) the screen says which league you are joining.
export default function EmailSignIn() {
  const { join } = useLocalSearchParams<{ join?: string }>();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const valid = /^\S+@\S+\.\S+$/.test(email.trim());

  const send = async () => {
    setBusy(true); setError(undefined);
    try { await auth.sendCode(email.trim().toLowerCase()); } catch { setBusy(false); setError('We could not send the code. Check the address and try again.'); return; }
    setBusy(false);
    router.push({ pathname: '/verify', params: { email: email.trim().toLowerCase() } });
  };

  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, padding: space[6], gap: space[6] }}>
        <IconButton icon={ArrowLeft} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />
        <View style={{ gap: space[2] }}>
          <T v="title">{join ? 'Sign in to join' : 'Your email'}</T>
          <T c="text2">{join ? `You are one step from ${join}. New here? Signing in creates your account.` : 'New here? Signing in creates your account.'}</T>
        </View>
        <Field label="Email" placeholder="you@company.com" keyboardType="email-address" autoCapitalize="none" autoComplete="email" autoFocus
          textContentType="emailAddress" value={email} onChangeText={setEmail} error={error} onSubmitEditing={() => valid && send()} />
        <View style={{ flex: 1 }} />
        <View style={{ gap: space[4] }}>
          <Button label="Email me a code" icon={Mail} onPress={send} loading={busy} disabled={!valid} />
          <T v="caption" c="text3" center>We email you a 6 digit code. No password needed.{'\n'}By continuing you agree to the Terms and Privacy Policy.</T>
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
