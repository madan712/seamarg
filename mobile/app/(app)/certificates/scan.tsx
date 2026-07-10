// Native-only scan flow: capture a certificate with the camera (or pick from
// the library), choose which certificate it is, upload to the backend, and show
// the AI-extracted field suggestions returned by MiniMaxCertificateExtractor.
//
// The category/type here are entered manually. A follow-up can replace those two
// inputs with a picker backed by the certificate catalog (the same enum the web
// portal uses) once it's ported into src/features/certificates.
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { SessionExpiredError } from '@/api/client';
import { uploadCertificateFile } from '@/api/certificates';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { Screen } from '@/components/Screen';
import { Body, Eyebrow, ErrorText, Muted, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, radius, spacing, tracking, typography, withAlpha } from '@/theme';

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
    if (result.canceled || result.assets.length === 0) return null;
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
    const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 });
    const next = toAsset(result);
    if (next) {
      setAsset(next);
      setExtraction(null);
    }
  }

  async function upload() {
    if (!session || !asset) return;
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
      <View style={styles.header}>
        <Eyebrow dot>AI scan</Eyebrow>
        <Title>Scan a certificate</Title>
        <Serif>Photograph the certificate and we'll pre-fill the details for you to review.</Serif>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}

      {/* Step 1 — capture */}
      <StepLabel index={1} text="Capture the document" />
      {asset ? (
        <View>
          <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="cover" />
          <Pressable onPress={() => setAsset(null)} style={styles.clearBtn} accessibilityLabel="Remove photo">
            <Ionicons name="close" size={16} color={colors.text} />
          </Pressable>
        </View>
      ) : (
        <Pressable
          onPress={takePhoto}
          style={styles.dropzone}
          accessibilityRole="button"
          accessibilityLabel="Take a photo of the certificate"
        >
          <View style={styles.dropIcon}>
            <Ionicons name="camera-outline" size={28} color={colors.primaryLight} />
          </View>
          <Body style={styles.dropTitle}>Tap to take a photo</Body>
          <Muted>or choose from your library below</Muted>
        </Pressable>
      )}

      <View style={styles.buttonRow}>
        <View style={styles.flex}>
          <Button title={asset ? 'Retake' : 'Take photo'} icon="camera-outline" onPress={takePhoto} />
        </View>
        <View style={styles.flex}>
          <Button title="Library" variant="secondary" icon="images-outline" onPress={pickFromLibrary} />
        </View>
      </View>

      {/* Step 2 — classify */}
      <StepLabel index={2} text="Which certificate is it?" />
      <Card style={styles.formCard}>
        <Field label="Category (enum name)" value={category} onChangeText={setCategory} placeholder="GENERAL" />
        <Field
          label="Type slug"
          value={typeSlug}
          onChangeText={setTypeSlug}
          placeholder="stcw-basic-safety-training"
        />
      </Card>

      {/* Step 3 — extract */}
      <StepLabel index={3} text="Upload & auto-fill" />
      <Button title="Upload & extract" icon="sparkles-outline" onPress={upload} loading={busy} disabled={!asset} />

      {extraction ? (
        <Card variant="rail">
          <View style={styles.resultHead}>
            <Ionicons name="sparkles" size={16} color={colors.primaryLight} />
            <Body style={styles.resultTitle}>AI suggestions</Body>
          </View>
          {Object.keys(extraction).length === 0 ? (
            <Serif>No fields were extracted. Fill the details in manually.</Serif>
          ) : (
            Object.entries(extraction).map(([key, value], index) => (
              <View key={key} style={[styles.resultRow, index > 0 && styles.resultDivider]}>
                <Muted style={styles.key}>{key}</Muted>
                <Body>{value ?? '—'}</Body>
              </View>
            ))
          )}
        </Card>
      ) : null}
    </Screen>
  );
}

function StepLabel({ index, text }: { index: number; text: string }) {
  return (
    <View style={styles.step}>
      <View style={styles.stepBadge}>
        <Body style={styles.stepNum}>{index}</Body>
      </View>
      <Body style={styles.stepText}>{text}</Body>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xs },
  step: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  stepBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.primary, 0.18),
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepNum: { fontFamily: fonts.headingBold, fontSize: 12, color: colors.primaryLight },
  stepText: { fontFamily: fonts.bodySemiBold, fontSize: 14 },
  dropzone: {
    borderWidth: 1.5,
    borderColor: withAlpha(colors.primary, 0.35),
    borderStyle: 'dashed',
    borderRadius: radius.lg,
    paddingVertical: spacing.xl,
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: withAlpha(colors.primary, 0.05),
  },
  dropIcon: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: withAlpha(colors.primary, 0.14),
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.xs,
  },
  dropTitle: { fontFamily: fonts.bodySemiBold, fontSize: 15 },
  preview: {
    width: '100%',
    height: 260,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  clearBtn: {
    position: 'absolute',
    top: spacing.sm,
    right: spacing.sm,
    width: 32,
    height: 32,
    borderRadius: radius.pill,
    backgroundColor: colors.scrim,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  formCard: { gap: spacing.md },
  resultHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginBottom: spacing.xs },
  resultTitle: { fontFamily: fonts.bodySemiBold },
  resultRow: { paddingVertical: spacing.sm, gap: 2 },
  resultDivider: { borderTopWidth: 1, borderTopColor: colors.border },
  key: {
    fontFamily: fonts.headingMedium,
    fontSize: typography.label,
    letterSpacing: tracking.label,
    textTransform: 'uppercase',
  },
});
