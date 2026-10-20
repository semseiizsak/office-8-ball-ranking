// Liga design tokens for React Native, mirrored from liga-ds/tokens.css.
import { createContext, useContext } from 'react';

const brand = '#5B3DF5';

export const playerColours = {
  yellow: '#F2B705', blue: '#1F3FA3', red: '#C8102E', purple: '#4B2A7B',
  orange: '#E8601C', green: '#146B3A', maroon: '#7A1F2B', ink: '#0A0A0A',
} as const;
export type PlayerColour = keyof typeof playerColours;

const dark = {
  scheme: 'dark' as 'dark' | 'light',
  bg: '#0A0A0A', surface: '#141414', surface2: '#222222', surface3: '#2C2C2C', overlay: '#171717',
  line: '#262626', lineStrong: '#3A3A3A',
  text: '#FFFFFF', text2: '#ADADAD', text3: '#7A7A7A',
  primary: '#FFFFFF', onPrimary: '#0A0A0A',
  brand, brandPress: '#4A2FD6', onBrand: '#FFFFFF',
  win: '#0EA650', onWin: '#FFFFFF', loss: '#3A3A3A', onLoss: '#FFFFFF',
  live: '#E5383B', crown: '#F2B705', onCrown: '#0A0A0A',
  warning: '#F5A524', error: '#E5383B', info: '#2F6FEB',
  scrim: 'rgba(0,0,0,0.64)', tabbar: 'rgba(23,23,23,0.94)',
  pct: { yellow: '#F2B705', blue: '#7D97F0', red: '#FF6B7D', purple: '#B394E6', orange: '#F59A63', green: '#5FCB8C', maroon: '#E0808C', ink: '#FFFFFF' } as Record<PlayerColour, string>,
};

const light: typeof dark = {
  ...dark,
  scheme: 'light',
  bg: '#F5F5F5', surface: '#FFFFFF', surface2: '#F5F5F5', surface3: '#EAEAEA', overlay: '#FFFFFF',
  line: '#EAEAEA', lineStrong: '#D6D6D6',
  text: '#111111', text2: '#555450', text3: '#8A8984',
  primary: '#111111', onPrimary: '#FFFFFF',
  loss: '#D9D9D9', onLoss: '#111111',
  scrim: 'rgba(0,0,0,0.4)', tabbar: 'rgba(255,255,255,0.94)',
  pct: { yellow: '#8A6A00', blue: '#1F3FA3', red: '#C8102E', purple: '#4B2A7B', orange: '#B4460F', green: '#146B3A', maroon: '#7A1F2B', ink: '#111111' },
};

export const themes = { dark, light };
export type Theme = typeof dark;

export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48 } as const;
export const radius = { xs: 8, sm: 12, md: 16, lg: 24, pill: 999 } as const;

export const font = {
  display: 'Sora_800ExtraBold',
  regular: 'Inter_400Regular',
  medium: 'Inter_500Medium',
  semibold: 'Inter_600SemiBold',
  bold: 'Inter_700Bold',
  heavy: 'Inter_800ExtraBold',
} as const;

// Sora display styles are always uppercase with tight tracking (never wide).
export const type = {
  hero: { fontFamily: font.display, fontSize: 64, lineHeight: 64, textTransform: 'uppercase' as const, letterSpacing: -1.5 },
  display: { fontFamily: font.display, fontSize: 40, lineHeight: 42, textTransform: 'uppercase' as const, letterSpacing: -1 },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 30, textTransform: 'uppercase' as const, letterSpacing: -0.6 },
  section: { fontFamily: font.display, fontSize: 20, lineHeight: 22, textTransform: 'uppercase' as const, letterSpacing: -0.3 },
  bigNumber: { fontFamily: font.heavy, fontSize: 48, lineHeight: 50, fontVariant: ['tabular-nums' as const] },
  number: { fontFamily: font.bold, fontSize: 20, lineHeight: 24, fontVariant: ['tabular-nums' as const] },
  heading: { fontFamily: font.semibold, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: font.regular, fontSize: 15, lineHeight: 21 },
  small: { fontFamily: font.regular, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: font.semibold, fontSize: 13, lineHeight: 16 },
  caption: { fontFamily: font.medium, fontSize: 12, lineHeight: 16 },
};

// Motion: ease in out, no bounce.
export const motion = { press: 120, fast: 180, base: 280, slow: 400, scene: 1200, easing: [0.65, 0, 0.35, 1] as const };

export const ThemeContext = createContext<{ t: Theme; mode: 'system' | 'dark' | 'light'; setMode: (m: 'system' | 'dark' | 'light') => void }>({
  t: dark, mode: 'system', setMode: () => {},
});
export const useTheme = () => useContext(ThemeContext);

export const fmt = (n: number) => String(Math.abs(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
export const signed = (n: number) => (n > 0 ? '+' : n < 0 ? '−' : '') + fmt(n);
