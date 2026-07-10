// Central design tokens. Ports the web frontend's styles.css palette + type
// system (Oswald / Fraunces / IBM Plex Mono, maritime "deep navy + brass +
// paper" theme) into values RN StyleSheet can consume, then extends them into a
// small "bridge instrument" design system (elevation, gradients, status
// semantics, tint helper) used by the redesigned mobile UI. Keep components
// referencing these instead of hardcoding colors/spacing/fonts.

// Raw maritime palette — mirrors the :root custom properties in
// frontend/src/styles.css so the two clients read as one product.
export const palette = {
  deep: '#061620',
  deepAlt: '#04121b',
  navy: '#0b2436',
  navy2: '#123448',
  navy3: '#0e2c40',
  navy4: '#16405a',
  brass: '#c8952e',
  brassLight: '#e3b965',
  brassDeep: '#a5761f',
  signal: '#bd4630',
  signalLight: '#e08572',
  paper: '#f3eee1',
  paperDim: '#e4dcc8',
  mist: '#6e93a2',
  mistLight: '#9fc4d4',
  sea: '#7fb59a',
  seaLight: '#a7d0bd',
  line: 'rgba(243, 238, 225, 0.14)',
  lineStrong: 'rgba(243, 238, 225, 0.22)',
} as const;

// Semantic tokens. Names kept stable so existing screens keep compiling; the
// values now map onto the maritime palette above.
export const colors = {
  background: palette.deep,
  backgroundAlt: palette.deepAlt,
  surface: palette.navy3,
  surfaceMuted: palette.navy2,
  surfaceRaised: palette.navy,
  surfaceHigh: palette.navy4,
  border: palette.line,
  borderStrong: palette.lineStrong,
  primary: palette.brass,
  primaryLight: palette.brassLight,
  primaryDeep: palette.brassDeep,
  primaryText: palette.deep,
  accent: palette.brassLight,
  text: palette.paper,
  textDim: palette.paperDim,
  textMuted: palette.mistLight,
  textFaint: palette.mist,
  danger: palette.signal,
  dangerLight: palette.signalLight,
  success: palette.sea,
  successLight: palette.seaLight,
  warning: palette.brassLight,
  info: palette.mistLight,
  scrim: 'rgba(4, 12, 20, 0.72)',
} as const;

// Status semantics for compliance/expiry surfaces (documents, certificates,
// enrollments). One tone name -> a colour + tint + label treatment.
export const status = {
  valid: { color: palette.sea, tint: 'rgba(127, 181, 154, 0.16)' },
  expiring: { color: palette.brassLight, tint: 'rgba(200, 149, 46, 0.18)' },
  expired: { color: palette.signalLight, tint: 'rgba(189, 70, 48, 0.22)' },
  missing: { color: palette.mist, tint: 'rgba(110, 147, 162, 0.16)' },
  neutral: { color: palette.paperDim, tint: 'rgba(243, 238, 225, 0.08)' },
} as const;

// Gradient stop arrays (consumed by the SVG-backed GradientSurface component so
// we get depth without pulling in expo-linear-gradient's native module).
export const gradients = {
  hero: ['#123448', '#0b2436', '#061620'],
  brass: ['#e3b965', '#c8952e', '#a5761f'],
  card: ['#123448', '#0e2c40'],
  night: ['#0b2436', '#04121b'],
  sea: ['#16405a', '#0b2436'],
} as const;

// Font families. These strings must match the keys registered with useFonts in
// app/_layout.tsx. Oswald = headings/labels (uppercase), Fraunces = editorial
// serif body, IBM Plex Mono = default UI/mono text.
export const fonts = {
  heading: 'Oswald_600SemiBold',
  headingBold: 'Oswald_700Bold',
  headingMedium: 'Oswald_500Medium',
  serif: 'Fraunces_400Regular',
  serifMedium: 'Fraunces_500Medium',
  serifItalic: 'Fraunces_400Regular_Italic',
  body: 'IBMPlexMono_400Regular',
  bodyMedium: 'IBMPlexMono_500Medium',
  bodySemiBold: 'IBMPlexMono_600SemiBold',
} as const;

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
  xxl: 32,
  pill: 999,
} as const;

export const typography = {
  display: 40,
  title: 30,
  heading: 20,
  subheading: 16,
  body: 15,
  label: 12,
  caption: 13,
} as const;

// Letter-spacing values (RN uses absolute px, not em). Tuned to echo the web's
// uppercase Oswald tracking.
export const tracking = {
  tight: 0.4,
  label: 1.4,
  eyebrow: 2.6,
} as const;

// Minimum sizes for accessible touch targets (WCAG 2.5.5 / Apple HIG 44pt).
export const sizes = {
  minTouch: 44,
  icon: 40,
  iconLg: 48,
  tabBar: 68,
  fab: 60,
  // Bottom clearance for scroll content on tab screens: enough to sit clear of
  // the Scan FAB that overhangs the tab bar (~28pt) with a small margin. The
  // tab bar itself owns the safe-area inset, so the scene must NOT re-add it.
  tabContentBottom: 40,
} as const;

// Elevation presets. Dark UIs read depth mostly through a soft black drop
// plus a raised surface colour; the `glow` variant is used for the brass FAB.
export const elevation = {
  sm: {
    shadowColor: '#000',
    shadowOpacity: 0.28,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  md: {
    shadowColor: '#000',
    shadowOpacity: 0.34,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  glow: {
    shadowColor: palette.brass,
    shadowOpacity: 0.5,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 10,
  },
} as const;

// Applies an alpha channel to a hex colour (`#rrggbb` -> `rgba(...)`). Used for
// on-the-fly tints where a token doesn't already exist.
export function withAlpha(hex: string, alpha: number): string {
  const clean = hex.replace('#', '');
  const value =
    clean.length === 3
      ? clean
          .split('')
          .map((c) => c + c)
          .join('')
      : clean;
  const r = parseInt(value.slice(0, 2), 16);
  const g = parseInt(value.slice(2, 4), 16);
  const b = parseInt(value.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
