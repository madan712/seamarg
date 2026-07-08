// Central design tokens. Ports the web frontend's styles.css palette + type
// system (Oswald / Fraunces / IBM Plex Mono, maritime "deep navy + brass +
// paper" theme) into values RN StyleSheet can consume. Keep components
// referencing these instead of hardcoding colors/spacing/fonts.

// Raw maritime palette — mirrors the :root custom properties in
// frontend/src/styles.css so the two clients read as one product.
export const palette = {
  deep: '#061620',
  navy: '#0b2436',
  navy2: '#123448',
  navy3: '#0e2c40',
  brass: '#c8952e',
  brassLight: '#e3b965',
  signal: '#bd4630',
  paper: '#f3eee1',
  paperDim: '#e4dcc8',
  mist: '#6e93a2',
  mistLight: '#9fc4d4',
  line: 'rgba(243, 238, 225, 0.14)',
  lineStrong: 'rgba(243, 238, 225, 0.22)',
} as const;

// Semantic tokens. Names kept stable so existing screens keep compiling; the
// values now map onto the maritime palette above.
export const colors = {
  background: palette.deep,
  surface: palette.navy3,
  surfaceMuted: palette.navy2,
  surfaceRaised: palette.navy,
  border: palette.line,
  borderStrong: palette.lineStrong,
  primary: palette.brass,
  primaryLight: palette.brassLight,
  primaryText: palette.deep,
  accent: palette.brassLight,
  text: palette.paper,
  textDim: palette.paperDim,
  textMuted: palette.mistLight,
  textFaint: palette.mist,
  danger: palette.signal,
  success: '#7fb59a',
  warning: palette.brassLight,
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
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const typography = {
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
