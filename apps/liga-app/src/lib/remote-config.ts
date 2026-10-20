// Local stand-in for the remote config row (A0.1, B9.3, B9.4, B9.5). The billing test panel flips these.
// Kept outside the league store so it survives sign out and Reset test data.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type RemoteConfig = {
  update: 'none' | 'recommended' | 'required';
  storeHasUpdate: boolean; // false: the update is still on its way to the store
  maintenance: 'none' | 'planned' | 'outage';
  maintenanceUntil: string; // shown as "until 06:00"
  bannerHiddenAt?: string | null; // update banner dismissed (7 days)
};
const KEY = 'liga.remoteConfig';
export const DEFAULT_CONFIG: RemoteConfig = { update: 'none', storeHasUpdate: true, maintenance: 'none', maintenanceUntil: '06:00', bannerHiddenAt: null };

let current: RemoteConfig = DEFAULT_CONFIG;
let loaded = false;
const listeners = new Set<(c: RemoteConfig) => void>();

export async function loadConfig() {
  if (!loaded) {
    const raw = await AsyncStorage.getItem(KEY);
    current = raw ? { ...DEFAULT_CONFIG, ...(JSON.parse(raw) as Partial<RemoteConfig>) } : DEFAULT_CONFIG;
    loaded = true;
  }
  return current;
}
export async function setConfig(p: Partial<RemoteConfig>) {
  current = { ...(await loadConfig()), ...p };
  await AsyncStorage.setItem(KEY, JSON.stringify(current));
  listeners.forEach((l) => l(current));
}
export function useRemoteConfig() {
  const [c, setC] = useState(current);
  useEffect(() => {
    listeners.add(setC);
    loadConfig().then(setC);
    return () => { listeners.delete(setC); };
  }, []);
  return c;
}
export const bannerVisible = (c: RemoteConfig, now = Date.now()) =>
  c.update === 'recommended' && (!c.bannerHiddenAt || now - Date.parse(c.bannerHiddenAt) > 7 * 86400000);
