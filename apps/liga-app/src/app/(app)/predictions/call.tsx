// M13.2 Call the winner, full screen for calls opened from the Predictions hub (challenges, cup games, live)
import { router, useLocalSearchParams, type Href } from 'expo-router';
import { ScrollView } from 'react-native';

import type { Call } from '@/lib/predictions';
import { space } from '@/theme';
import { Button, Screen, T } from '@/ui';
import { Header } from '@/ui/list-row';
import { CallCard } from '@/ui/predict';

const HREF = { live: (id: string) => `/live/watch/${id}`, challenge: (id: string) => `/challenge/${id}`, cup: (id: string) => `/cup/game/${id}` } as const;

export default function CallScreen() {
  const { target, id } = useLocalSearchParams<{ target: Call['target']; id: string }>();
  const kind = HREF[target] ? target : 'challenge';
  return (
    <Screen>
      <Header title="Predictions" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[4], paddingBottom: 60 }}>
        <CallCard target={kind} id={id} />
        <T v="small" c="text2">Players in the match can’t tip. Right calls score Oracle points, more for an underdog. If it is not played, your coins come back.</T>
        <Button label={kind === 'live' ? 'Watch live' : kind === 'cup' ? 'Open cup game' : 'Open challenge'} variant="secondary" onPress={() => router.push(HREF[kind](id) as Href)} />
      </ScrollView>
    </Screen>
  );
}
