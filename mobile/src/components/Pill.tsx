// Small status badge mirroring the website's .pill styles (Oswald, tinted
// background per tone). Used for certificate/document/enrollment status chips.
// Tones ok/warn/due/neutral are kept for existing callers (enrollmentTone,
// statusTone); valid/expiring/expired/missing/info map onto the same palette
// with clearer maritime-compliance naming.
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radius, status, tracking } from '@/theme';

type Tone =
  | 'ok'
  | 'warn'
  | 'due'
  | 'neutral'
  | 'valid'
  | 'expiring'
  | 'expired'
  | 'missing'
  | 'info';

const TONES: Record<Tone, { bg: string; color: string }> = {
  ok: { bg: status.valid.tint, color: colors.successLight },
  valid: { bg: status.valid.tint, color: colors.successLight },
  warn: { bg: status.expiring.tint, color: colors.primaryLight },
  expiring: { bg: status.expiring.tint, color: colors.primaryLight },
  due: { bg: status.expired.tint, color: colors.dangerLight },
  expired: { bg: status.expired.tint, color: colors.dangerLight },
  missing: { bg: status.missing.tint, color: colors.textMuted },
  info: { bg: 'rgba(159, 196, 212, 0.16)', color: colors.info },
  neutral: { bg: status.neutral.tint, color: colors.textDim },
};

export function Pill({ label, tone = 'neutral', dot = false }: { label: string; tone?: Tone; dot?: boolean }) {
  const spec = TONES[tone];
  return (
    <View style={[styles.pill, { backgroundColor: spec.bg }]}>
      {dot ? <View style={[styles.dot, { backgroundColor: spec.color }]} /> : null}
      <Text style={[styles.text, { color: spec.color }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: radius.pill,
    paddingHorizontal: 11,
    paddingVertical: 5,
    alignSelf: 'flex-start',
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  text: {
    fontFamily: fonts.headingMedium,
    fontSize: 11,
    letterSpacing: tracking.tight,
    textTransform: 'uppercase',
  },
});
