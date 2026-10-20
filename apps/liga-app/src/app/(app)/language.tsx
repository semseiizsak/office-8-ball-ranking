// B2.2 Language and region (placeholder: English only in the test build)
import { Check, Languages } from 'lucide-react-native';
import { ScrollView } from 'react-native';

import { space } from '@/theme';
import { Icon, Screen, T } from '@/ui';
import { Group, Header, Row } from '@/ui/list-row';

export default function Language() {
  return (
    <Screen>
      <Header title="Language" />
      <ScrollView contentContainerStyle={{ padding: space[4], gap: space[5], paddingBottom: 60 }}>
        <Group title="App language" footer="More languages are coming later, Magyar first. Your phone's language setting will pick it up.">
          <Row first icon={Languages} label="English" right={<Icon as={Check} size={20} />} />
        </Group>
        <T v="small" c="text3">League names and chat stay as people wrote them.</T>
      </ScrollView>
    </Screen>
  );
}
