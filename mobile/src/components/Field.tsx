import {
  Pressable,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
  type KeyboardTypeOptions,
} from 'react-native';

import type { FieldType } from '@/features/profile/sections';
import { colors, fonts, palette, radius, spacing, tracking, typography } from '@/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  type?: FieldType;
  placeholder?: string;
  options?: string[];
  autoFocus?: boolean;
  secureTextEntry?: boolean;
};

// Maps a field type to text-input behavior. Booleans render a Switch instead
// (handled below), so they never reach this map.
const keyboardByType: Partial<Record<FieldType, KeyboardTypeOptions>> = {
  email: 'email-address',
  phone: 'phone-pad',
  number: 'numeric',
};

export function Field({
  label,
  value,
  onChangeText,
  type = 'text',
  placeholder,
  options,
  autoFocus,
  secureTextEntry,
}: Props) {
  if (type === 'boolean') {
    const on = value === 'true';
    return (
      <View style={[styles.wrap, styles.switchRow]}>
        <Text style={styles.label}>{label}</Text>
        <Switch
          value={on}
          onValueChange={(next) => onChangeText(next ? 'true' : 'false')}
          trackColor={{ true: colors.primary, false: colors.surfaceMuted }}
          thumbColor={colors.text}
          ios_backgroundColor={colors.surfaceMuted}
        />
      </View>
    );
  }

  // Dropdowns render as a wrap of tappable chips. Tapping the selected chip
  // again clears it (the field is optional, matching the web's empty option).
  if (type === 'select') {
    return (
      <View style={styles.wrap}>
        <Text style={styles.label}>{label}</Text>
        <View style={styles.chips}>
          {(options ?? []).map((option) => {
            const selected = value === option;
            return (
              <Pressable
                key={option}
                onPress={() => onChangeText(selected ? '' : option)}
                style={[styles.chip, selected && styles.chipSelected]}
              >
                <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{option}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? (type === 'date' ? 'YYYY-MM-DD' : undefined)}
        placeholderTextColor={colors.textFaint}
        keyboardType={keyboardByType[type]}
        autoCapitalize={type === 'email' || secureTextEntry ? 'none' : 'sentences'}
        autoCorrect={type !== 'email' && !secureTextEntry}
        secureTextEntry={secureTextEntry}
        autoFocus={autoFocus}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.xs,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  label: {
    color: colors.textMuted,
    fontFamily: fonts.headingMedium,
    fontSize: typography.label,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
  },
  input: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    color: colors.text,
    fontFamily: fonts.body,
    fontSize: typography.body,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  chipSelected: {
    backgroundColor: colors.primary,
    borderColor: colors.primary,
  },
  chipText: {
    color: colors.textDim,
    fontFamily: fonts.body,
    fontSize: typography.caption,
  },
  chipTextSelected: {
    color: palette.deep,
    fontFamily: fonts.bodyMedium,
  },
});
