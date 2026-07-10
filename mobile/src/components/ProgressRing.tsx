// Circular progress gauge — the dashboard/profile "compass" that shows how
// complete something is (e.g. profile completeness, documents held). Drawn with
// react-native-svg: a faint track ring plus a brass progress arc, with the
// percentage centred inside. Purely presentational.
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

import { colors, fonts, gradients, tracking } from '@/theme';

type Props = {
  // 0..1 progress.
  progress: number;
  size?: number;
  strokeWidth?: number;
  // Big centred value (defaults to the rounded percentage).
  label?: string;
  // Small caption under the value.
  caption?: string;
};

export function ProgressRing({
  progress,
  size = 108,
  strokeWidth = 10,
  label,
  caption,
}: Props) {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dash = circumference * clamped;
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size}>
        <Defs>
          <LinearGradient id="ring" x1="0" y1="0" x2="1" y2="1">
            <Stop offset="0" stopColor={gradients.brass[0]} />
            <Stop offset="1" stopColor={gradients.brass[2]} />
          </LinearGradient>
        </Defs>
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={colors.borderStrong}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke="url(#ring)"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circumference - dash}`}
          // Start the arc at 12 o'clock.
          transform={`rotate(-90 ${center} ${center})`}
          fill="none"
        />
      </Svg>
      <View style={styles.center} pointerEvents="none">
        <Text style={styles.value}>{label ?? `${Math.round(clamped * 100)}%`}</Text>
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
  },
  value: {
    fontFamily: fonts.headingBold,
    fontSize: 24,
    color: colors.text,
    letterSpacing: tracking.tight,
  },
  caption: {
    fontFamily: fonts.headingMedium,
    fontSize: 9,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
    color: colors.textFaint,
    marginTop: 2,
  },
});
