import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { normalizeError } from '@/lib/errors';
import { colors, spacing, typography } from '@/theme';

export default function SignIn() {
  const { signIn } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError('Enter your email and password.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await signIn(email, password);
      router.replace('/dashboard');
    } catch (err) {
      const normalized = normalizeError(err);
      if (normalized.name === 'UserNotConfirmedException') {
        router.push({ pathname: '/confirm', params: { email: email.trim().toLowerCase() } });
        return;
      }
      setError(normalized.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Welcome back</Text>
      <Text style={styles.subtitle}>Sign in to your Seamarg seafarer portal.</Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Field label="Email" value={email} onChangeText={setEmail} type="email" autoFocus />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />

      <Button title="Sign in" onPress={onSubmit} loading={busy} />

      <View style={styles.links}>
        <Link href="/forgot-password" style={styles.link}>
          Forgot password?
        </Link>
        <Link href="/sign-up" style={styles.link}>
          Create an account
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: typography.title, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: typography.body, marginBottom: spacing.sm },
  error: { color: colors.danger, fontSize: typography.body },
  links: { marginTop: spacing.md, gap: spacing.sm, alignItems: 'center' },
  link: { color: colors.primary, fontSize: typography.body },
});
