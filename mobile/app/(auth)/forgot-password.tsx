import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { normalizeError } from '@/lib/errors';
import { colors, spacing, typography } from '@/theme';

// Two-step flow in one screen: request a reset code, then submit the code plus
// a new password. `sent` toggles between the two steps.
export default function ForgotPassword() {
  const { forgotPassword, resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onRequest() {
    if (!email.trim()) {
      setError('Enter your email.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await forgotPassword(email);
      setSent(true);
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  async function onReset() {
    if (!code.trim() || !password) {
      setError('Enter the code and a new password.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await resetPassword(email, code, password);
      router.replace({ pathname: '/sign-in', params: { email: email.trim().toLowerCase() } });
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Reset your password</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Field label="Email" value={email} onChangeText={setEmail} type="email" autoFocus />

      {!sent ? (
        <Button title="Send reset code" onPress={onRequest} loading={busy} />
      ) : (
        <>
          <Field label="Reset code" value={code} onChangeText={setCode} type="number" />
          <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry />
          <Field
            label="Confirm new password"
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            secureTextEntry
          />
          <Button title="Set new password" onPress={onReset} loading={busy} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: typography.title, fontWeight: '700', marginBottom: spacing.sm },
  error: { color: colors.danger, fontSize: typography.body },
});
