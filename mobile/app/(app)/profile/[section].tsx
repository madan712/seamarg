// Generic profile-section editor. Reads the section definition from
// features/profile/sections.ts, fetches current values, renders a field per
// FieldDef, and PUTs the whole section on save.
import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import { fetchProfile, saveProfileSection } from '@/api/profile';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { getSection } from '@/features/profile/sections';
import { normalizeError } from '@/lib/errors';
import { colors, spacing, typography } from '@/theme';

export default function ProfileSectionScreen() {
  const { section: slug } = useLocalSearchParams<{ section: string }>();
  const { session, signOut } = useAuth();
  const section = useMemo(() => (slug ? getSection(slug) : undefined), [slug]);

  const [values, setValues] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!session || !section) {
      setLoading(false);
      return;
    }
    let active = true;
    fetchProfile(session)
      .then((all) => {
        if (!active) return;
        const stored = all?.[section.slug] ?? {};
        const next: Record<string, string> = {};
        for (const field of section.fields) {
          const raw = stored[field.name];
          next[field.name] = raw == null ? '' : String(raw);
        }
        setValues(next);
      })
      .catch((err) => {
        if (!active) return;
        if (err instanceof SessionExpiredError) {
          signOut();
          return;
        }
        setError(normalizeError(err).message);
      })
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [session, section, signOut]);

  async function onSave() {
    if (!session || !section) {
      return;
    }
    setSaving(true);
    setNotice('');
    setError('');

    // Convert string field state back into the payload shape the backend
    // expects (booleans/numbers), leaving text as-is.
    const payload: Record<string, unknown> = {};
    for (const field of section.fields) {
      const value = values[field.name] ?? '';
      if (field.type === 'boolean') {
        payload[field.name] = value === 'true';
      } else if (field.type === 'number') {
        payload[field.name] = value;
      } else {
        payload[field.name] = value;
      }
    }

    try {
      await saveProfileSection(session, section.slug, payload);
      setNotice('Saved.');
      router.back();
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        signOut();
        return;
      }
      setError(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  }

  if (!section) {
    return (
      <Screen>
        <Text style={styles.error}>Unknown profile section.</Text>
      </Screen>
    );
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: section.title }} />
      {section.description ? <Text style={styles.subtitle}>{section.description}</Text> : null}
      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {loading ? (
        <ActivityIndicator color={colors.primary} />
      ) : section.fields.length === 0 ? (
        <Text style={styles.subtitle}>
          This section is not editable in the mobile app yet. Add its fields in
          src/features/profile/sections.ts.
        </Text>
      ) : (
        <>
          {section.fields.map((field) => (
            <Field
              key={field.name}
              label={field.label}
              value={values[field.name] ?? ''}
              onChangeText={(text) => setValues((prev) => ({ ...prev, [field.name]: text }))}
              type={field.type}
              placeholder={field.placeholder}
            />
          ))}
          <Button title="Save" onPress={onSave} loading={saving} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  subtitle: { color: colors.textMuted, fontSize: typography.body },
  notice: { color: colors.success, fontSize: typography.body },
  error: { color: colors.danger, fontSize: typography.body },
});
