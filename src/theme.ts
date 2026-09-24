import { createContext, createElement, useContext, type ReactNode } from 'react';
import type { CategoryName } from './types';

export type ThemeMode = 'light' | 'dark';
export const THEME_PREFERENCE_KEY = 'subtrack.appearance.mode.v1';

export const lightColors = {
  rose: '#315B7C', peach: '#476D8E', apricot: '#EAF0F5', cream: '#FFFFFF',
  slate: '#60758A', ink: '#192633', muted: '#5E6C7A', surface: '#F5F7FA',
  white: '#FFFFFF', success: '#287353', danger: '#AC4050', line: '#DEE5EC',
  card: '#FFFFFF', hero: '#27445F', heroText: '#FFFFFF', heroMuted: '#DCE6EF',
  button: '#315B7C', buttonText: '#FFFFFF', menu: '#F5F7FA',
};

export type ThemeColors = typeof lightColors;

export const darkColors: ThemeColors = {
  rose: '#A5C7E5', peach: '#83A8C8', apricot: '#273644', cream: '#101820',
  slate: '#A2B5C7', ink: '#F4F7FA', muted: '#B7C3CE', surface: '#172330',
  white: '#1E2C3A', success: '#84D8AE', danger: '#F1A3AD', line: '#334454',
  card: '#1B2937', hero: '#28425B', heroText: '#FFFFFF', heroMuted: '#DCE6EF',
  button: '#436F94', buttonText: '#FFFFFF', menu: '#1C2B3A',
};

export const categories: CategoryName[] = [
  'Entertainment', 'Music', 'Productivity', 'Utilities', 'Health', 'Education', 'Other',
];

export function getCategoryMeta(colors: ThemeColors): Record<CategoryName, { color: string; icon: string }> {
  return {
    Entertainment: { color: colors.rose, icon: 'movie-open-outline' },
    Music: { color: colors.slate, icon: 'music-note' },
    Productivity: { color: colors.peach, icon: 'briefcase-outline' },
    Utilities: { color: colors.muted, icon: 'flash-outline' },
    Health: { color: colors.rose, icon: 'heart-pulse' },
    Education: { color: colors.slate, icon: 'school-outline' },
    Other: { color: colors.peach, icon: 'shape-outline' },
  };
}

export function getShadows(mode: ThemeMode) {
  return {
    card: {
      shadowColor: '#06111B',
      shadowOffset: { width: 0, height: 5 },
      shadowOpacity: mode === 'dark' ? 0.18 : 0.06,
      shadowRadius: 13,
      elevation: mode === 'dark' ? 1 : 2,
    },
  };
}

type ThemeContextValue = {
  mode: ThemeMode;
  colors: ThemeColors;
  shadows: ReturnType<typeof getShadows>;
};

const ThemeContext = createContext<ThemeContextValue>({
  mode: 'light', colors: lightColors, shadows: getShadows('light'),
});

export function ThemeProvider({ value, children }: { value: ThemeContextValue; children: ReactNode }) {
  return createElement(ThemeContext.Provider, { value }, children);
}

export function useTheme() {
  return useContext(ThemeContext);
}
