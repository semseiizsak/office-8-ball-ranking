// A0.1 and B9.4 Update required (blocking), B9.3 update banner, B9.5 maintenance banner and outage screen.
// Driven by the local remote config stub (src/lib/remote-config.ts), flipped from the Billing test panel.
import { Download, Wrench, X } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { bannerVisible, setConfig, useRemoteConfig } from '@/lib/remote-config';
import { radius, space, useTheme } from '@/theme';
import { Button, Icon, IconButton, T } from '@/ui';

const storeNote = () => Alert.alert('App Store', 'In the store build this opens Liga in the App Store or Google Play.');

export function SystemGate() {
  const { t } = useTheme();
  const insets = useSafeAreaInsets();
  const c = useRemoteConfig();
  const [hideMaint, setHideMaint] = useState(false);
  const [retrying, setRetrying] = useState(false);

  const full = (icon: typeof Download, title: string, body: string, actions: ReactNode) => (
    <View style={[StyleSheet.absoluteFill, { backgroundColor: t.bg, paddingTop: insets.top, paddingBottom: insets.bottom + space[4], paddingHorizontal: space[6], zIndex: 100 }]}>
      <View style={{ flex: 1, justifyContent: 'center', gap: space[4] }}>
        <View style={{ width: 72, height: 72, borderRadius: radius.md, backgroundColor: t.brand, alignItems: 'center', justifyContent: 'center' }}>
          <Icon as={icon} size={32} color={t.onBrand} />
        </View>
        <T v="title">{title}</T>
        <T c="text2">{body}</T>
      </View>
      <View style={{ gap: space[2] }}>{actions}</View>
    </View>
  );

  if (c.update === 'required') {
    return full(Download, 'Time to update', "This version of Liga can't sync anymore. Update to keep logging matches. Your data is safe.", (
      <>
        {c.storeHasUpdate ? null : <T v="small" c="text2" center>The update is on its way to the App Store. Try again in an hour.</T>}
        <Button label="Update" variant="brand" disabled={!c.storeHasUpdate} onPress={storeNote} />
        <Button label="Test build: dismiss" variant="ghost" size="md" onPress={() => setConfig({ update: 'none' })} />
      </>
    ));
  }
  if (c.maintenance === 'outage') {
    const retry = async () => { setRetrying(true); await new Promise((r) => setTimeout(r, 900)); setRetrying(false); };
    return full(Wrench, 'Something went wrong', "It's on our side and we're on it. Your matches are safe on this phone.", (
      <>
        <Button label="Try again" variant="primary" loading={retrying} onPress={retry} />
        <Button label="Test build: end outage" variant="ghost" size="md" onPress={() => setConfig({ maintenance: 'none' })} />
      </>
    ));
  }

  const banner = (icon: typeof Download, text: string, action: { label: string; onPress: () => void } | null, close: () => void) => (
    <View key={text} style={{ flexDirection: 'row', alignItems: 'center', gap: space[2], backgroundColor: t.overlay, borderWidth: 1, borderColor: t.line, borderRadius: radius.md, paddingLeft: space[4], paddingVertical: space[1], paddingRight: space[1] }}>
      <Icon as={icon} size={18} />
      <T v="small" style={{ flex: 1 }}>{text}</T>
      {action ? <Button label={action.label} size="sm" variant="primary" onPress={action.onPress} /> : null}
      <IconButton icon={X} label="Dismiss" tone="ghost" onPress={close} />
    </View>
  );
  const maint = c.maintenance === 'planned' && !hideMaint;
  const upd = bannerVisible(c);
  if (!maint && !upd) return null;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: insets.top + space[1], left: space[3], right: space[3], gap: space[2], zIndex: 50 }}>
      {maint ? banner(Wrench, `Liga is under maintenance until ${c.maintenanceUntil}. Matches you log now sync later.`, { label: 'Status', onPress: () => Alert.alert('Status page', 'In the store build this opens status.liga.app.') }, () => setHideMaint(true)) : null}
      {upd ? banner(Download, 'A new version of Liga is ready.', { label: 'Update', onPress: storeNote }, () => setConfig({ bannerHiddenAt: new Date().toISOString() })) : null}
    </View>
  );
}
