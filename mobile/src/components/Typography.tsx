// Shared text primitives that encode the website's type system so screens don't
// re-declare font families / tracking everywhere. Mirrors styles.css:
//   Oswald  -> headings + uppercase labels (h1..h4, .eyebrow, pills)
//   Fraunces-> editorial serif body copy (descriptions, prose)
//   IBM Plex Mono -> default UI/body text
import type { ReactNode } from 'react';
import { StyleSheet, Text, View, type StyleProp, type TextStyle } from 'react-native';

import { colors, fonts, spacing, tracking, typography } from '@/theme';

type TextProps = {
  children: ReactNode;
  style?: StyleProp<TextStyle>;
  numberOfLines?: number;
};

// Small tracked uppercase kicker, optionally with the website's signal dot.
export function Eyebrow({
  children,
  style,
  dot = false,
}: TextProps & { dot?: boolean }) {
  if (dot) {
    return (
      <View style={styles.eyebrowRow}>
        <View style={styles.dot} />
        <Text style={[styles.eyebrow, style]}>{children}</Text>
      </View>
    );
  }
  return <Text style={[styles.eyebrow, style]}>{children}</Text>;
}

// Page-level heading (Oswald, uppercase).
export function Title({ children, style, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles.title, style]}>
      {children}
    </Text>
  );
}

// Section / card heading (Oswald, uppercase, smaller than Title).
export function Heading({ children, style, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles.heading, style]}>
      {children}
    </Text>
  );
}

// Editorial serif copy (Fraunces) for descriptions and prose.
export function Serif({ children, style, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles.serif, style]}>
      {children}
    </Text>
  );
}

// Default mono body text.
export function Body({ children, style, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles.body, style]}>
      {children}
    </Text>
  );
}

// Muted mono text for metadata / captions.
export function Muted({ children, style, numberOfLines }: TextProps) {
  return (
    <Text numberOfLines={numberOfLines} style={[styles.muted, style]}>
      {children}
    </Text>
  );
}

export function ErrorText({ children, style }: TextProps) {
  return <Text style={[styles.error, style]}>{children}</Text>;
}

export function NoticeText({ children, style }: TextProps) {
  return <Text style={[styles.notice, style]}>{children}</Text>;
}

const styles = StyleSheet.create({
  eyebrowRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  eyebrow: {
    fontFamily: fonts.headingMedium,
    fontSize: typography.label,
    letterSpacing: tracking.eyebrow,
    textTransform: 'uppercase',
    color: colors.textFaint,
  },
  title: {
    fontFamily: fonts.headingBold,
    fontSize: typography.title,
    letterSpacing: tracking.tight,
    textTransform: 'uppercase',
    color: colors.text,
  },
  heading: {
    fontFamily: fonts.heading,
    fontSize: typography.heading,
    letterSpacing: tracking.tight,
    textTransform: 'uppercase',
    color: colors.text,
  },
  serif: {
    fontFamily: fonts.serif,
    fontSize: typography.subheading,
    lineHeight: 24,
    color: colors.textMuted,
  },
  body: {
    fontFamily: fonts.body,
    fontSize: typography.body,
    lineHeight: 22,
    color: colors.text,
  },
  muted: {
    fontFamily: fonts.body,
    fontSize: typography.caption,
    lineHeight: 20,
    color: colors.textFaint,
  },
  error: {
    fontFamily: fonts.bodyMedium,
    fontSize: typography.body,
    color: colors.danger,
  },
  notice: {
    fontFamily: fonts.bodyMedium,
    fontSize: typography.body,
    color: colors.success,
  },
});
