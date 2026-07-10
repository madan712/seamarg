// Add-a-certificate wizard (native). A guided four-step flow that replaces the
// old free-text category/type inputs:
//   1. Category  — pick from the shared catalog (no slugs/enum names)
//   2. Type      — pick the specific certificate in that category
//   3. Capture   — camera / photo library / PDF, then upload for AI extraction
//   4. Review    — edit the AI-prefilled fields and Save (PUT), so the entry
//                  actually persists to the Sea Wallet.
//
// The category/type slugs come from @shared/certificates (the same source the
// web frontend uses), and the backend endpoints take the category *slug*.
import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import * as ImagePicker from 'expo-image-picker';
import { Redirect, Stack, router } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import {
  CERTIFICATE_CATEGORIES,
  CERTIFICATE_EXTRA_FIELDS,
  COMMON_CERTIFICATE_FIELDS,
  certificateCatalog,
  type CertificateCategory,
  type CertificateType,
} from '@shared/certificates';

import { SessionExpiredError } from '@/api/client';
import {
  fetchCertificateEntries,
  saveCertificateEntry,
  uploadCertificateFile,
  type CertificateEntries,
  type CertificateFileMeta,
} from '@/api/certificates';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { Field } from '@/components/Field';
import { IconBadge } from '@/components/IconBadge';
import { ListRow } from '@/components/ListRow';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { Body, Eyebrow, ErrorText, Muted, NoticeText, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, radius, spacing, withAlpha } from '@/theme';

type IconName = keyof typeof Ionicons.glyphMap;
type Step = 'category' | 'type' | 'capture' | 'review';
type Asset = { uri: string; name: string; type: string; isImage: boolean };

// Maps the catalog's neutral icon tokens to Ionicons.
const CATEGORY_ICONS: Record<CertificateCategory['icon'], IconName> = {
  shield: 'shield-checkmark-outline',
  certificate: 'ribbon-outline',
  medical: 'medkit-outline',
  tanker: 'boat-outline',
  offshore: 'flame-outline',
  flag: 'flag-outline',
};

const STEP_TITLES: Record<Step, string> = {
  category: 'Choose a category',
  type: 'Choose the certificate',
  capture: 'Add the document',
  review: 'Review & save',
};

export default function AddCertificate() {
  const { session, signOut } = useAuth();
  const [step, setStep] = useState<Step>('category');
  const [category, setCategory] = useState<CertificateCategory | null>(null);
  const [type, setType] = useState<CertificateType | null>(null);
  const [asset, setAsset] = useState<Asset | null>(null);
  const [fileMeta, setFileMeta] = useState<CertificateFileMeta | null>(null);
  const [values, setValues] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  // Existing saved entries, so the picker can flag what's already on file.
  const [entries, setEntries] = useState<CertificateEntries>({});

  useEffect(() => {
    if (!session) return;
    let active = true;
    fetchCertificateEntries(session)
      .then((data) => active && setEntries(data ?? {}))
      .catch(() => {
        // Non-blocking: badges just won't show if this fails.
      });
    return () => {
      active = false;
    };
  }, [session]);

  const extraFields = useMemo(
    () => (category ? (CERTIFICATE_EXTRA_FIELDS[category.slug] ?? []) : []),
    [category],
  );

  // The saved fields for one (category, type), or undefined if none yet.
  function savedEntry(categorySlug: string, typeSlug: string): Record<string, unknown> | undefined {
    return entries[categorySlug]?.[typeSlug] as Record<string, unknown> | undefined;
  }

  function handleSessionError(err: unknown): boolean {
    if (err instanceof SessionExpiredError) {
      signOut();
      return true;
    }
    return false;
  }

  function selectCategory(next: CertificateCategory) {
    setCategory(next);
    setType(null);
    setError('');
    setStep('type');
  }

  function selectType(next: CertificateType) {
    setType(next);
    setError('');
    setStep('capture');
  }

  function toImageAsset(result: ImagePicker.ImagePickerResult): Asset | null {
    if (result.canceled || result.assets.length === 0) return null;
    const picked = result.assets[0];
    const name = picked.fileName ?? `certificate-${picked.assetId ?? 'scan'}.jpg`;
    return { uri: picked.uri, name, type: picked.mimeType ?? 'image/jpeg', isImage: true };
  }

  async function takePhoto() {
    setError('');
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      setError('Camera permission is required to scan a certificate.');
      return;
    }
    const next = toImageAsset(await ImagePicker.launchCameraAsync({ quality: 0.7 }));
    if (next) {
      setAsset(next);
      setNotice('');
    }
  }

  async function pickImage() {
    setError('');
    const next = toImageAsset(
      await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.7 }),
    );
    if (next) {
      setAsset(next);
      setNotice('');
    }
  }

  async function pickPdf() {
    setError('');
    const result = await DocumentPicker.getDocumentAsync({
      type: 'application/pdf',
      copyToCacheDirectory: true,
    });
    if (result.canceled || result.assets.length === 0) return;
    const picked = result.assets[0];
    setAsset({
      uri: picked.uri,
      name: picked.name ?? 'certificate.pdf',
      type: picked.mimeType ?? 'application/pdf',
      isImage: false,
    });
    setNotice('');
  }

  // Prefill the review form: an already-saved value wins, else the AI
  // suggestion, else blank (mirrors the web's `savedValue || suggestion`).
  function prefill(extraction: Record<string, string | null> | null) {
    const saved = category && type ? savedEntry(category.slug, type.slug) : undefined;
    const next: Record<string, string> = {};
    for (const field of [...COMMON_CERTIFICATE_FIELDS, ...extraFields]) {
      const savedValue = saved?.[field.key];
      if (savedValue != null && String(savedValue).trim().length > 0) {
        next[field.key] = String(savedValue);
        continue;
      }
      const suggestion = extraction?.[field.key];
      next[field.key] = typeof suggestion === 'string' ? suggestion : '';
    }
    setValues(next);
  }

  async function uploadAndExtract() {
    if (!session || !category || !type || !asset) return;
    setBusy(true);
    setError('');
    try {
      const result = await uploadCertificateFile(session, category.slug, type.slug, asset);
      setFileMeta(result.file ?? null);
      prefill(result.extraction ?? {});
      setNotice(
        asset.isImage
          ? 'Scan read. Review the details below, then save.'
          : 'File attached. Enter the details below, then save.',
      );
      setStep('review');
    } catch (err) {
      if (handleSessionError(err)) return;
      setError(normalizeError(err).message);
    } finally {
      setBusy(false);
    }
  }

  function enterManually() {
    // Keep any file already attached to an existing entry so saving doesn't drop it.
    const saved = category && type ? savedEntry(category.slug, type.slug) : undefined;
    const existingFile =
      saved?.file && typeof saved.file === 'object' ? (saved.file as CertificateFileMeta) : null;
    setFileMeta(existingFile);
    setNotice('');
    prefill(null);
    setStep('review');
  }

  async function save() {
    if (!session || !category || !type) return;
    // Required fields (common + any category extras) must be filled.
    const required = [
      ...COMMON_CERTIFICATE_FIELDS.filter((f) => f.required),
      ...extraFields.filter((f) => f.required),
    ];
    const missing = required.find((f) => !(values[f.key] ?? '').trim());
    if (missing) {
      setError(`${missing.label} is required.`);
      return;
    }
    const expiry = (values.expiryDate ?? '').trim();
    if (expiry && expiry < todayIso()) {
      setError('Expiry date cannot be in the past; expired certificates are not accepted.');
      return;
    }

    setSaving(true);
    setError('');
    const payload: Record<string, unknown> = { ...values };
    if (fileMeta) payload.file = fileMeta;

    try {
      await saveCertificateEntry(session, category.slug, type.slug, payload);
      router.back();
    } catch (err) {
      if (handleSessionError(err)) return;
      setError(normalizeError(err).message);
    } finally {
      setSaving(false);
    }
  }

  // Reachable outside the (app) auth guard (it's a root-level modal), so guard here.
  if (!session) {
    return <Redirect href="/sign-in" />;
  }

  return (
    <Screen>
      <Stack.Screen options={{ title: 'Add certificate' }} />

      <Stepper step={step} />
      <View style={styles.head}>
        <Eyebrow dot>Step {STEP_INDEX[step] + 1} of 4</Eyebrow>
        <Title>{STEP_TITLES[step]}</Title>
        {category && step !== 'category' ? (
          <Body style={styles.context}>
            {category.label}
            {type ? ` · ${type.label}` : ''}
          </Body>
        ) : null}
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice && step === 'review' ? <NoticeText>{notice}</NoticeText> : null}

      {/* Step 1 — category */}
      {step === 'category' ? (
        <View style={styles.list}>
          {CERTIFICATE_CATEGORIES.map((item) => {
            const savedCount = Object.keys(entries[item.slug] ?? {}).length;
            return (
              <ListRow
                key={item.slug}
                icon={CATEGORY_ICONS[item.icon]}
                iconTone={savedCount > 0 ? 'brass' : 'mist'}
                title={item.label}
                subtitle={`${certificateCatalog(item.slug).length} certificate types`}
                onPress={() => selectCategory(item)}
                trailing={savedCount > 0 ? <Pill label={`${savedCount} saved`} tone="valid" dot /> : undefined}
              />
            );
          })}
        </View>
      ) : null}

      {/* Step 2 — type */}
      {step === 'type' && category ? (
        <>
          <BackLink label="Categories" onPress={() => setStep('category')} />
          <View style={styles.list}>
            {certificateCatalog(category.slug).map((item) => {
              const existing = savedEntry(category.slug, item.slug);
              const hasFile = Boolean(existing?.file);
              return (
                <ListRow
                  key={item.slug}
                  icon="ribbon-outline"
                  iconTone={existing ? 'brass' : 'mist'}
                  title={item.label}
                  subtitle={
                    existing ? (hasFile ? 'Saved · file attached' : 'Saved · no file yet') : undefined
                  }
                  onPress={() => selectType(item)}
                  trailing={
                    existing ? <Pill label={hasFile ? 'File' : 'Saved'} tone="valid" dot /> : undefined
                  }
                />
              );
            })}
          </View>
        </>
      ) : null}

      {/* Step 3 — capture */}
      {step === 'capture' && category && type ? (
        <>
          <BackLink label={category.label} onPress={() => setStep('type')} />
          <Serif>Photograph or attach the document and we'll read the details for you to review.</Serif>

          {asset ? (
            <View>
              {asset.isImage ? (
                <Image source={{ uri: asset.uri }} style={styles.preview} resizeMode="cover" />
              ) : (
                <Card style={styles.fileCard}>
                  <IconBadge icon="document-text-outline" />
                  <View style={styles.fileText}>
                    <Body numberOfLines={1}>{asset.name}</Body>
                    <Muted>PDF document</Muted>
                  </View>
                </Card>
              )}
              <Pressable onPress={() => setAsset(null)} style={styles.clearBtn} accessibilityLabel="Remove document">
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
              <Muted>or choose a file below</Muted>
            </Pressable>
          )}

          <View style={styles.captureRow}>
            <View style={styles.flex}>
              <Button title={asset?.isImage ? 'Retake' : 'Camera'} icon="camera-outline" onPress={takePhoto} />
            </View>
            <View style={styles.flex}>
              <Button title="Photo" variant="secondary" icon="images-outline" onPress={pickImage} />
            </View>
            <View style={styles.flex}>
              <Button title="PDF" variant="secondary" icon="document-outline" onPress={pickPdf} />
            </View>
          </View>

          <Button
            title="Upload & read details"
            icon="sparkles-outline"
            onPress={uploadAndExtract}
            loading={busy}
            disabled={!asset}
          />
          <Button title="Enter details manually" variant="ghost" onPress={enterManually} />
        </>
      ) : null}

      {/* Step 4 — review */}
      {step === 'review' && category && type ? (
        <>
          <BackLink label="Document" onPress={() => setStep('capture')} />
          {fileMeta ? (
            <Card variant="rail">
              <View style={styles.fileText}>
                <View style={styles.attachedRow}>
                  <Ionicons name="checkmark-circle" size={16} color={colors.successLight} />
                  <Body style={styles.attachedTitle}>Document attached</Body>
                </View>
                <Muted numberOfLines={1}>{fileMeta.originalFilename ?? asset?.name ?? 'File'}</Muted>
              </View>
            </Card>
          ) : null}

          <Card style={styles.form}>
            {COMMON_CERTIFICATE_FIELDS.map((field) => (
              <Field
                key={field.key}
                label={requiredLabel(field.label, field.required)}
                value={values[field.key] ?? ''}
                onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
                type={field.type === 'date' ? 'date' : 'text'}
              />
            ))}
            {extraFields.map((field) => (
              <Field
                key={field.key}
                label={requiredLabel(field.label, field.required)}
                value={values[field.key] ?? ''}
                onChangeText={(text) => setValues((prev) => ({ ...prev, [field.key]: text }))}
                type={field.type === 'select' ? 'select' : 'text'}
                options={field.options}
              />
            ))}
          </Card>

          <Button title="Save certificate" icon="checkmark-outline" onPress={save} loading={saving} />
        </>
      ) : null}
    </Screen>
  );
}

const STEP_INDEX: Record<Step, number> = { category: 0, type: 1, capture: 2, review: 3 };

function Stepper({ step }: { step: Step }) {
  const current = STEP_INDEX[step];
  return (
    <View style={styles.stepper} accessibilityLabel={`Step ${current + 1} of 4`}>
      {[0, 1, 2, 3].map((index) => (
        <View
          key={index}
          style={[
            styles.stepBar,
            index <= current ? styles.stepBarActive : styles.stepBarIdle,
          ]}
        />
      ))}
    </View>
  );
}

function BackLink({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={styles.back} accessibilityRole="button" accessibilityLabel={`Back to ${label}`}>
      <Ionicons name="chevron-back" size={16} color={colors.primaryLight} />
      <Body style={styles.backText}>{label}</Body>
    </Pressable>
  );
}

function requiredLabel(label: string, required?: boolean): string {
  return required ? `${label} *` : label;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', gap: spacing.xs },
  stepBar: { flex: 1, height: 4, borderRadius: radius.pill },
  stepBarActive: { backgroundColor: colors.primary },
  stepBarIdle: { backgroundColor: colors.borderStrong },
  head: { gap: spacing.sm, marginTop: spacing.xs },
  context: { color: colors.textMuted, fontSize: 13 },
  list: { gap: spacing.sm },
  back: { flexDirection: 'row', alignItems: 'center', gap: 2, alignSelf: 'flex-start' },
  backText: { color: colors.primaryLight, fontFamily: fonts.bodyMedium },
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
  fileCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  fileText: { flex: 1, gap: 2 },
  attachedRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  attachedTitle: { fontFamily: fonts.bodySemiBold },
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
  captureRow: { flexDirection: 'row', gap: spacing.sm },
  flex: { flex: 1 },
  form: { gap: spacing.md },
});
