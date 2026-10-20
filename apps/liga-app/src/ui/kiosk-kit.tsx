// Shared pieces for the kiosk screens (X1): size switch, QR on paper, PIN pad, big header.
import * as Haptics from 'expo-haptics';
import { Delete, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Animated, Easing, Pressable, Text, useWindowDimensions, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { font, motion, radius, space, themes, useTheme } from '@/theme';
import { Icon, IconButton, T } from '@/ui';

const paper = themes.light;

// Tablet: shortest side 600+. Wide: landscape tablet, two columns. A phone gets the same screens, smaller.
export function useKioskSize() {
  const { width, height } = useWindowDimensions();
  const tablet = Math.min(width, height) >= 600;
  const wide = width >= 900 || (width > height && width >= 700);
  return { width, height, tablet, wide, pad: tablet ? space[8] : space[4], gap: tablet ? space[5] : space[4], target: tablet ? 64 : 52 };
}

// Larger Inter for names and lines read from two metres (Sora stays for headings only).
export const bigText = (size: number) => ({ fontSize: size, lineHeight: Math.round(size * 1.25) });

export function KioskQR({ value, size }: { value: string; size: number }) {
  return (
    <View style={{ backgroundColor: paper.surface, padding: Math.max(10, Math.round(size / 14)), borderRadius: radius.md }}>
      <QRCode value={value} size={size} color={paper.text} backgroundColor={paper.surface} ecl="M" />
    </View>
  );
}

export function KioskTop({ title, sub, onClose, right }: { title: string; sub?: string; onClose?: () => void; right?: ReactNode }) {
  const { tablet, pad } = useKioskSize();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: space[3], paddingHorizontal: pad, paddingVertical: space[3] }}>
      <View style={{ flex: 1, gap: 4 }}>
        <T v={tablet ? 'display' : 'title'} numberOfLines={2}>{title}</T>
        {sub ? <T v={tablet ? 'heading' : 'body'} c="text2">{sub}</T> : null}
      </View>
      {right}
      {onClose ? <IconButton icon={X} label="Close" onPress={onClose} /> : null}
    </View>
  );
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'cancel', '0', 'del'] as const;

// DS #sy-kiosk PIN pad: dots, big keys, auto submit on the last digit, 360 ms shake when wrong.
export function PinPad({ length, title, sub, error, onSubmit, onCancel }: {
  length: number; title: string; sub?: string; error?: string | null; onSubmit: (pin: string) => Promise<boolean>; onCancel?: () => void;
}) {
  const { t } = useTheme();
  const { tablet, height } = useKioskSize();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));
  const key = Math.min(tablet ? 96 : 72, Math.floor((height - 320) / 4.6));

  const wrong = () => {
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    const step = (to: number) => Animated.timing(shake, { toValue: to, duration: 60, easing: Easing.bezier(...motion.easing), useNativeDriver: true });
    Animated.sequence([step(12), step(-12), step(10), step(-10), step(6), step(0)]).start();
  };
  const press = async (k: (typeof KEYS)[number]) => {
    if (busy) return;
    if (k === 'cancel') return onCancel?.();
    Haptics.selectionAsync();
    if (k === 'del') return setPin((p) => p.slice(0, -1));
    const next = (pin + k).slice(0, length);
    setPin(next);
    if (next.length < length) return;
    setBusy(true);
    const ok = await onSubmit(next);
    setBusy(false);
    if (!ok) { wrong(); setPin(''); }
  };

  const keyView = (k: (typeof KEYS)[number]) => {
    if (k === 'cancel' && !onCancel) return <View key={k} style={{ width: key, height: key }} />;
    const label = k === 'cancel' ? 'Cancel' : k === 'del' ? 'Delete' : k;
    return (
      <Pressable key={k} accessibilityRole="button" accessibilityLabel={label} onPress={() => press(k)}
        style={({ pressed }) => ({ width: key, height: key, borderRadius: key / 2, alignItems: 'center', justifyContent: 'center',
          backgroundColor: k === 'cancel' || k === 'del' ? 'transparent' : pressed ? t.surface3 : t.surface2 })}>
        {k === 'del' ? <Icon as={Delete} size={28} /> : (
          <Text style={{ fontFamily: k === 'cancel' ? font.semibold : font.bold, fontSize: k === 'cancel' ? 16 : key * 0.36, color: t.text }}>{label}</Text>
        )}
      </Pressable>
    );
  };

  return (
    <View style={{ alignItems: 'center', gap: space[4] }}>
      <T v={tablet ? 'title' : 'section'} center>{title}</T>
      {sub ? <T v="body" c="text2" center>{sub}</T> : null}
      <Animated.View style={{ flexDirection: 'row', gap: space[3], height: 24, alignItems: 'center', transform: [{ translateX: shake }] }}>
        {Array.from({ length }, (_, i) => (
          <View key={i} style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: i < pin.length ? t.text : 'transparent', borderWidth: 2, borderColor: i < pin.length ? t.text : t.lineStrong }} />
        ))}
      </Animated.View>
      <View style={{ minHeight: 20 }}>{error ? <T v="small" c="text2" center>{error}</T> : null}</View>
      <View style={{ width: key * 3 + space[4] * 2, flexDirection: 'row', flexWrap: 'wrap', gap: space[4] }}>{KEYS.map(keyView)}</View>
    </View>
  );
}
