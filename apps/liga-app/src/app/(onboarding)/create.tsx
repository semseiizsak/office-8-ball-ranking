import { router } from 'expo-router';
import { ArrowLeft, Check, Globe } from 'lucide-react-native';
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { deviceTimezone, TEMPLATES, type TemplateId } from '@/lib/invite';
import { SPORTS } from '@/lib/sports';
import { font, radius, space, useTheme } from '@/theme';
import { Button, Field, Icon, IconButton, Pill, Screen, T } from '@/ui';

// A6 + A7: team and first league in one screen, with A8.3 template and A7.2 time zone.
export default function Create() {
  const { t } = useTheme();
  const [team, setTeam] = useState('');
  const [league, setLeague] = useState('');
  const [sport, setSport] = useState('foosball');
  const [template, setTemplate] = useState<TemplateId>('office');
  const timezone = deviceTimezone();
  const ok = team.trim().length >= 2 && league.trim().length >= 2;
  return (
    <Screen edges={['top', 'bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ padding: space[6], gap: space[5] }} keyboardShouldPersistTaps="handled">
          <IconButton icon={ArrowLeft} label="Back" onPress={() => router.back()} />
          <T v="title">New league</T>
          <Field label="Team or company" placeholder="Acme Studio" value={team} onChangeText={setTeam} maxLength={40} />
          <Field label="League name" placeholder="Office foosball" value={league} onChangeText={setLeague} maxLength={40} />
          <T v="label" c="text2">Sport</T>
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {SPORTS.map((s) => {
              const on = s.id === sport;
              return (
                <Pressable key={s.id} onPress={() => setSport(s.id)} accessibilityRole="button" accessibilityState={{ selected: on }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, height: 44, paddingHorizontal: 14, borderRadius: radius.pill, backgroundColor: on ? t.primary : t.scheme === 'light' ? t.surface3 : t.surface2 }}>
                  <Icon as={s.icon} size={18} color={on ? t.onPrimary : t.text} />
                  <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? t.onPrimary : t.text }}>{s.label}</Text>
                </Pressable>
              );
            })}
          </View>
          <T v="caption" c="text3">The sport is only a label and an icon. Every match is a simple win or loss.</T>
          <View style={{ gap: 2 }}>
            <T v="label" c="text2">Pick a setup</T>
            <T v="caption" c="text3">A starting point. Switch any feature on or off later.</T>
          </View>
          {TEMPLATES.map((tp) => {
            const on = tp.id === template;
            return (
              <Pressable key={tp.id} onPress={() => setTemplate(tp.id)} accessibilityRole="radio" accessibilityState={{ selected: on }}
                style={{ padding: space[4], gap: 6, borderRadius: radius.md, backgroundColor: t.surface, borderWidth: 2, borderColor: on ? t.text : t.surface }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <T v="heading" style={{ flex: 1 }}>{tp.label}</T>
                  {tp.id === 'office' ? <Pill label="Recommended" tone="brand" /> : null}
                  {on ? <Icon as={Check} size={20} /> : null}
                </View>
                <T v="small" c="text2">{tp.body}</T>
                <T v="caption" c="text3">Turns on: {tp.features.join(', ')}</T>
              </Pressable>
            );
          })}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], minHeight: 44 }}>
            <Icon as={Globe} size={18} color={t.text2} />
            <View style={{ flex: 1 }}>
              <T v="label">Time zone: {timezone.split('/').pop()?.replace(/_/g, ' ')}</T>
              <T v="caption" c="text3">From your phone. Cup days and awards run on this clock.</T>
            </View>
          </View>
        </ScrollView>
        <View style={{ padding: space[6], paddingTop: 0 }}>
          <Button label="Continue" disabled={!ok}
            onPress={() => router.push({ pathname: '/profile', params: { mode: 'create', team: team.trim(), league: league.trim(), sport, template, timezone } })} />
        </View>
      </KeyboardAvoidingView>
    </Screen>
  );
}
