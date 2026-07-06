import { StyleSheet, Switch, Text, TextInput, View, type KeyboardTypeOptions } from 'react-native';

import type { FieldType } from '@/features/profile/sections';
import { colors, radius, spacing, typography } from '@/theme';

type Props = {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  type?: FieldType;
  placeholder?: string;
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
  autoFocus,
  secureTextEntry,
}: Props) {
  if (type === 'boolean') {
    const on = value === 'true';
    return (
      <View style={[styles.wrap, styles.switchRow]}>
        <Text style={styles.label}>{label}</Text>
        <Switch value={on} onValueChange={(next) => onChangeText(next ? 'true' : 'false')} />
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
        placeholderTextColor={colors.textMuted}
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
    fontSize: typography.caption,
    fontWeight: '600',
  },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    color: colors.text,
    fontSize: typography.body,
  },
});
