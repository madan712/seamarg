import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Eyebrow, ErrorText, NoticeText, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { spacing } from '@/theme';

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
      <View style={styles.header}>
        <Eyebrow dot>Verify email</Eyebrow>
        <Title>Verify your email</Title>
        <Serif>Enter the code Cognito emailed you to activate your account.</Serif>
      </View>

      {notice ? <NoticeText>{notice}</NoticeText> : null}
      {error ? <ErrorText>{error}</ErrorText> : null}

      <Field label="Email" value={email} onChangeText={setEmail} type="email" />
      <Field label="Verification code" value={code} onChangeText={setCode} type="number" autoFocus />

      <Button title="Confirm" onPress={onConfirm} loading={busy} />
      <Button title="Resend code" onPress={onResend} variant="secondary" />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.sm },
});
