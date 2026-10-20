import * as Haptics from 'expo-haptics';
import { Pressable, Text, View } from 'react-native';

import { font, useTheme } from '@/theme';

// DS .tabs: underline tab row, 44 px targets, selected in text colour with a 2 px bar.
export function Tabs<V extends string>({ options, value, onChange }: { options: { value: V; label: string }[]; value: V; onChange: (v: V) => void }) {
  const { t } = useTheme();
  return (
    <View accessibilityRole="tablist" style={{ flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: t.line }}>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <Pressable key={o.value} accessibilityRole="tab" accessibilityState={{ selected: on }} onPress={() => { if (!on) { Haptics.selectionAsync(); onChange(o.value); } }}
            style={{ flex: 1, height: 44, alignItems: 'center', justifyContent: 'center' }}>
            <Text style={{ fontFamily: font.semibold, fontSize: 15, color: on ? t.text : t.text3 }}>{o.label}</Text>
            {on ? <View style={{ position: 'absolute', left: 12, right: 12, bottom: -1, height: 2, borderRadius: 2, backgroundColor: t.text }} /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}

// Small selectable chip for filters (R2.5.1, R2.3.1). Selected is solid primary, never a tint.
export function Chip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { t } = useTheme();
  return (
    <Pressable accessibilityRole="button" accessibilityState={{ selected: on }} onPress={() => { Haptics.selectionAsync(); onPress(); }} hitSlop={{ top: 4, bottom: 4 }}
      style={({ pressed }) => ({ height: 36, paddingHorizontal: 14, borderRadius: 999, justifyContent: 'center', backgroundColor: on ? t.primary : pressed ? t.surface3 : t.surface2 })}>
      <Text style={{ fontFamily: font.semibold, fontSize: 14, color: on ? t.onPrimary : t.text }}>{label}</Text>
    </Pressable>
  );
}
