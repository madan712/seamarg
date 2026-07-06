import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { normalizeError } from '@/lib/errors';
import { colors, spacing, typography } from '@/theme';

export default function SignUp() {
  const { signUp } = useAuth();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function onSubmit() {
    if (!email.trim() || !password) {
      setError('Email and password are required.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    if (phone && !/^\+[1-9]\d{6,14}$/.test(phone)) {
      setError('Enter your mobile phone in international format, e.g. +919892558621.');
      return;
    }

    setBusy(true);
    setError('');
    try {
      const { confirmed } = await signUp(email, password, { firstName, lastName, phone, birthdate });
      if (confirmed) {
        router.replace('/dashboard');
      } else {
        router.replace({ pathname: '/confirm', params: { email: email.trim().toLowerCase() } });
      }
    } catch (err) {
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Create your account</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Field label="First name" value={firstName} onChangeText={setFirstName} />
      <Field label="Last name" value={lastName} onChangeText={setLastName} />
      <Field label="Email" value={email} onChangeText={setEmail} type="email" />
      <Field label="Mobile phone" value={phone} onChangeText={setPhone} type="phone" placeholder="+919892558621" />
      <Field label="Date of birth" value={birthdate} onChangeText={setBirthdate} type="date" />
      <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
      <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />

      <Button title="Create account" onPress={onSubmit} loading={busy} />

      <View style={styles.links}>
        <Link href="/sign-in" style={styles.link}>
          I already have an account
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: typography.title, fontWeight: '700', marginBottom: spacing.sm },
  error: { color: colors.danger, fontSize: typography.body },
  links: { marginTop: spacing.md, alignItems: 'center' },
  link: { color: colors.primary, fontSize: typography.body },
});
