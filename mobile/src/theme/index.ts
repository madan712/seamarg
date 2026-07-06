// Central design tokens. Ports the intent of the web frontend's styles.css into
// values RN StyleSheet can consume. Keep components referencing these instead
// of hardcoding colors/spacing.

export const colors = {
  background: '#0b1f33',
  surface: '#12293f',
  surfaceMuted: '#1b3752',
  border: '#25405c',
  primary: '#2f80ed',
  primaryText: '#ffffff',
  text: '#f4f8fb',
  textMuted: '#9fb3c8',
  danger: '#e05252',
  success: '#3fb984',
  warning: '#e0a52f',
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 6,
  md: 10,
  lg: 16,
} as const;

export const typography = {
  title: 28,
  heading: 20,
  body: 16,
  caption: 13,
} as const;
