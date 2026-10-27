import { Platform } from 'react-native';

export const colors = {
  background: '#0A0A0A',
  surface: '#121212',
  surfaceElevated: '#181818',
  surfacePressed: '#222222',
  outline: '#262626',
  textPrimary: '#F5F5F5',
  textSecondary: '#888888',
  textDisabled: '#444444',
  scrim: '#000000',
  // Active pill badges & high-contrast monochrome highlights
  pillBackground: '#161616',
  pillBorder: '#2E2E2E',
  cardBorder: '#222222',
  activeBorder: '#F5F5F5',
  accentKeep: '#10B981',
  accentDelete: '#EF4444',
  accentCompress: '#3B82F6',
  dangerSurface: '#1A1414',
  rescueSurface: '#141A16',
} as const;

export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
  gutter: 16,
} as const;

export const touchTargets = {
  min: 48,
  minIconTarget: 48,
  hitSlop8: { top: 8, bottom: 8, left: 8, right: 8 },
  hitSlop12: { top: 12, bottom: 12, left: 12, right: 12 },
} as const;

export const radii = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 9999,
  full: 9999,
} as const;

export const opacities = {
  scrim: 0.75,
  sheetScrim: 0.6,
  disabled: 0.38,
  subtle: 0.5,
  cardBackgroundCard2: 0.95,
  cardBackgroundCard3: 0.9,
} as const;

export const typography = {
  titleLarge: {
    fontSize: 24,
    lineHeight: 30,
    fontWeight: '700' as const,
    color: colors.textPrimary,
  },
  titleMedium: {
    fontSize: 18,
    lineHeight: 24,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  titleSmall: {
    fontSize: 16,
    lineHeight: 22,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  bodyLarge: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: '400' as const,
    color: colors.textPrimary,
  },
  bodyMedium: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  bodySmall: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '400' as const,
    color: colors.textSecondary,
  },
  labelLarge: {
    fontSize: 14,
    lineHeight: 18,
    fontWeight: '600' as const,
    color: colors.textPrimary,
  },
  labelMedium: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: '600' as const,
    color: colors.textSecondary,
  },
  labelBadge: {
    fontSize: 11,
    lineHeight: 14,
    fontWeight: '700' as const,
    letterSpacing: 0.8,
    textTransform: 'uppercase' as const,
    color: colors.textPrimary,
  },
  mono: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 16,
    color: colors.textSecondary,
  },
} as const;

export const theme = {
  colors,
  spacing,
  touchTargets,
  radii,
  opacities,
  typography,
} as const;

export type Theme = typeof theme;
