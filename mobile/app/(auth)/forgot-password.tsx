import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Eyebrow, ErrorText, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { spacing } from '@/theme';

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
      <View style={styles.header}>
        <Eyebrow dot>Reset password</Eyebrow>
        <Title>Reset your password</Title>
        <Serif>
          {sent
            ? 'Enter the code we emailed you and choose a new password.'
            : "We'll email you a code to reset your password."}
        </Serif>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}

      {!sent ? (
        <>
          <Card style={styles.form}>
            <Field label="Email" value={email} onChangeText={setEmail} type="email" autoFocus />
          </Card>
          <Button title="Send reset code" icon="mail-outline" onPress={onRequest} loading={busy} />
        </>
      ) : (
        <>
          <Card style={styles.form}>
            <Field label="Email" value={email} onChangeText={setEmail} type="email" />
            <Field label="Reset code" value={code} onChangeText={setCode} type="number" />
            <Field label="New password" value={password} onChangeText={setPassword} secureTextEntry />
            <Field
              label="Confirm new password"
              value={confirmPassword}
              onChangeText={setConfirmPassword}
              secureTextEntry
            />
          </Card>
          <Button title="Set new password" icon="lock-closed-outline" onPress={onReset} loading={busy} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  form: { gap: spacing.md },
});
