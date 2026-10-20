// B5.11 Talk to us: Business leads above 150 players or with invoices and SSO. No purchase links (App Store 3.1.3).
import { router } from 'expo-router';
import { Check } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';

import { sendLead } from '@/lib/billing';
import { useAuth } from '@/providers/auth';
import { space, useTheme } from '@/theme';
import { Button, Empty, Field, Screen, T } from '@/ui';
import { Header } from '@/ui/list-row';

const NEEDS = ['Invoices', 'Single sign on', 'Admin console'];

export default function Contact() {
  const { t } = useTheme();
  const { session } = useAuth();
  const [company, setCompany] = useState('');
  const [email, setEmail] = useState(session?.user.email ?? '');
  const [players, setPlayers] = useState('');
  const [needs, setNeeds] = useState<string[]>([]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [tried, setTried] = useState(false);
  const emailOk = /^\S+@\S+\.\S+$/.test(email.trim());
  const ok = company.trim().length >= 2 && emailOk;

  const send = async () => {
    setTried(true);
    if (!ok || !session) return;
    setBusy(true);
    try { await sendLead(session.user, { company: company.trim(), email: email.trim(), players: Number(players) || 0, needs, message: message.trim() }); setDone(true); } catch { /* stays on the form */ }
    setBusy(false);
  };

  if (done) return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Talk to us" />
      <Empty icon={Check} title="Thanks, we'll be in touch" body="We reply within 1 working day." action={<Button label="Done" onPress={() => router.back()} />} />
    </Screen>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <Header title="Talk to us" />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
          <T c="text2">For crews above 150 players, or companies that need invoices and single sign on.</T>
          <Field label="Company" value={company} onChangeText={setCompany} placeholder="Acme Studio" maxLength={60} error={tried && company.trim().length < 2 ? 'Add your company name.' : undefined} />
          <Field label="Work email" value={email} onChangeText={setEmail} keyboardType="email-address" autoCapitalize="none" autoComplete="email" error={tried && !emailOk ? 'Check the email address.' : undefined} />
          <Field label="Players, roughly" value={players} onChangeText={(v) => setPlayers(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder="200" maxLength={5} />
          <View style={{ gap: space[2] }}>
            <T v="label" c="text2">Need invoices or SSO?</T>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space[2] }}>
              {NEEDS.map((n) => {
                const on = needs.includes(n);
                return <Button key={n} label={n} size="sm" variant={on ? 'primary' : 'secondary'} onPress={() => setNeeds(on ? needs.filter((x) => x !== n) : [...needs, n])} />;
              })}
            </View>
          </View>
          <Field label="Message" value={message} onChangeText={setMessage} multiline placeholder="Tell us about your crew" maxLength={600}
            style={{ height: 120, paddingTop: 14, textAlignVertical: 'top', backgroundColor: t.surface2 }} />
          <Button label="Send" variant="brand" loading={busy} onPress={send} />
          <T v="small" c="text2" center>We reply within 1 working day.</T>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}
