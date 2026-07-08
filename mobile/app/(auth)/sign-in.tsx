import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Eyebrow, ErrorText, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, spacing, typography } from '@/theme';

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
      <View style={styles.header}>
        <Eyebrow dot>Seamarg · Seafarer Portal</Eyebrow>
        <Title>Welcome back</Title>
        <Serif>Sign in to manage your profile, documents and certificates.</Serif>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Field label="Email" value={email} onChangeText={setEmail} type="email" autoFocus />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />

      <Button title="Sign in" onPress={onSubmit} loading={busy} />

      <View style={styles.links}>
        <Link href="/forgot-password" style={styles.link}>
          <Text style={styles.linkText}>Forgot password?</Text>
        </Link>
        <Link href="/sign-up" style={styles.link}>
          <Text style={styles.linkText}>Create an account</Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  links: { marginTop: spacing.md, gap: spacing.md, alignItems: 'center' },
  link: { paddingVertical: spacing.xs },
  linkText: { color: colors.primaryLight, fontFamily: fonts.bodyMedium, fontSize: typography.caption },
});
