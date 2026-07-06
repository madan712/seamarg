import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { normalizeError } from '@/lib/errors';
import { colors, spacing, typography } from '@/theme';

export default function Confirm() {
  const params = useLocalSearchParams<{ email?: string }>();
  const { confirmEmail, resendCode } = useAuth();
  const [email, setEmail] = useState(params.email ?? '');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');

  async function onConfirm() {
    if (!email.trim() || !code.trim()) {
      setError('Enter your email and the verification code.');
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      await confirmEmail(email, code);
      router.replace({ pathname: '/sign-in', params: { email: email.trim().toLowerCase() } });
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setError('');
    try {
      await resendCode(email);
      setNotice('A new verification code has been sent.');
    } catch (err) {
      setError(normalizeError(err).message);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Verify your email</Text>
      <Text style={styles.subtitle}>Enter the code Cognito emailed you.</Text>

      {notice ? <Text style={styles.notice}>{notice}</Text> : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Field label="Email" value={email} onChangeText={setEmail} type="email" />
      <Field label="Verification code" value={code} onChangeText={setCode} type="number" autoFocus />

      <Button title="Confirm" onPress={onConfirm} loading={busy} />
      <Button title="Resend code" onPress={onResend} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: typography.title, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: typography.body, marginBottom: spacing.sm },
  notice: { color: colors.success, fontSize: typography.body },
  error: { color: colors.danger, fontSize: typography.body },
});
