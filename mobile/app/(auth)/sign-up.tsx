import { Link, router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAuth } from '@/auth/AuthContext';
import { BrandMark } from '@/components/BrandMark';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Eyebrow, ErrorText, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, spacing, typography } from '@/theme';

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
      <View style={styles.header}>
        <BrandMark />
        <Eyebrow style={styles.eyebrow}>Seafarer Portal</Eyebrow>
        <Title>Create your account</Title>
        <Serif>Set up your seafarer profile to keep every document under one watch.</Serif>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}

      <Card style={styles.form}>
        <Field label="First name" value={firstName} onChangeText={setFirstName} />
        <Field label="Last name" value={lastName} onChangeText={setLastName} />
        <Field label="Email" value={email} onChangeText={setEmail} type="email" />
        <Field label="Mobile phone" value={phone} onChangeText={setPhone} type="phone" placeholder="+919892558621" />
        <Field label="Date of birth" value={birthdate} onChangeText={setBirthdate} type="date" />
        <Field label="Password" value={password} onChangeText={setPassword} secureTextEntry />
        <Field label="Confirm password" value={confirmPassword} onChangeText={setConfirmPassword} secureTextEntry />
      </Card>

      <Button title="Create account" icon="person-add-outline" onPress={onSubmit} loading={busy} />

      <View style={styles.links}>
        <Link href="/sign-in" style={styles.link}>
          <Text style={styles.linkText}>I already have an account</Text>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  eyebrow: { marginTop: spacing.xs },
  form: { gap: spacing.md },
  links: { marginTop: spacing.md, alignItems: 'center' },
  link: { paddingVertical: spacing.xs },
  linkText: { color: colors.primaryLight, fontFamily: fonts.bodyMedium, fontSize: typography.caption },
});
