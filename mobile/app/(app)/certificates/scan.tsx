// Native-only scan flow: capture a certificate with the camera (or pick from
// the library), choose which certificate it is, upload to the backend, and show
// the AI-extracted field suggestions returned by MiniMaxCertificateExtractor.
//
// The category/type here are entered manually. A follow-up can replace those two
// inputs with a picker backed by the certificate catalog (the same enum the web
// portal uses) once it's ported into src/features/certificates.
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import { uploadCertificateFile } from '@/api/certificates';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { normalizeError } from '@/lib/errors';
import { colors, radius, spacing, typography } from '@/theme';

type Asset = { uri: string; name: string; type: string };

export default function ScanCertificate() {
  const { session, signOut } = useAuth();
  const [asset, setAsset] = useState<Asset | null>(null);
  const [category, setCategory] = useState('GENERAL');
  const [typeSlug, setTypeSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [extraction, setExtraction] = useState<Record<string, string | null> | null>(null);

  function toAsset(result: ImagePicker.ImagePickerResult): Asset | null {
    if (result.canceled || result.assets.length === 0) {
      return null;
    }
    const picked = result.assets[0];
    const name = picked.fileName ?? `certificate-${picked.assetId ?? 'scan'}.jpg`;
    return { uri: picked.uri, name, type: picked.mimeType ?? 'image/jpeg' };
  }

  async function takePhoto() {
    setError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to scan a certificate.');
      return;
    }
    const result = await ImagePicker.launchCameraAsync({ quality: 0.7 });
    const next = toAsset(result);
    if (next) {
      setAsset(next);
      setExtraction(null);
    }
  }

  async function pickFromLibrary() {
    setError('');
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.7,
    });
    const next = toAsset(result);
    if (next) {
      setAsset(next);
      setExtraction(null);
    }
  }

  async function upload() {
    if (!session || !asset) {
      return;
    }
    if (!category.trim() || !typeSlug.trim()) {
      setError('Enter the certificate category and type slug.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await uploadCertificateFile(session, category.trim(), typeSlug.trim(), asset);
      setExtraction(result.extraction ?? {});
    } catch (err) {
      if (err instanceof SessionExpiredError) {
        signOut();
        return;
      }
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen>
      <Text style={styles.title}>Scan a certificate</Text>
      <Text style={styles.subtitle}>
        Photograph the certificate and we'll pre-fill the details for you to review.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.buttonRow}>
        <View style={styles.flex}>
          <Button title="Take photo" onPress={takePhoto} />
        </View>
        <View style={styles.flex}>
          <Button title="From library" variant="secondary" onPress={pickFromLibrary} />
        </View>
      </View>

      {asset ? <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="contain" /> : null}

      <Field label="Category (enum name)" value={category} onChangeText={setCategory} placeholder="GENERAL" />
      <Field
        label="Type slug"
        value={typeSlug}
        onChangeText={setTypeSlug}
        placeholder="stcw-basic-safety-training"
      />

      <Button title="Upload & extract" onPress={upload} loading={busy} disabled={!asset} />

      {extraction ? (
        <View style={styles.results}>
          <Text style={styles.section}>AI suggestions</Text>
          {Object.keys(extraction).length === 0 ? (
            <Text style={styles.subtitle}>No fields were extracted. Fill the details in manually.</Text>
          ) : (
            Object.entries(extraction).map(([key, value]) => (
              <View key={key} style={styles.resultRow}>
                <Text style={styles.key}>{key}</Text>
                <Text style={styles.value}>{value ?? '—'}</Text>
              </View>
            ))
          )}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { color: colors.text, fontSize: typography.title, fontWeight: '700' },
  subtitle: { color: colors.textMuted, fontSize: typography.body },
  error: { color: colors.danger, fontSize: typography.body },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  preview: {
    width: '100%',
    height: 240,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  results: { gap: spacing.sm, marginTop: spacing.sm },
  section: { color: colors.text, fontSize: typography.heading, fontWeight: '600' },
  resultRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.md,
    gap: 2,
  },
  key: { color: colors.textMuted, fontSize: typography.caption, fontWeight: '600' },
  value: { color: colors.text, fontSize: typography.body },
});
