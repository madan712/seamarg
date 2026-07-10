// Owner-side document sharing (design docs/document-sharing-design.md §8): flag
// which uploaded files are shareable, mint a secure link, show it as a QR code,
// and list / revoke active links. The recipient viewer is web-only by design —
// anyone scans the QR with their phone camera and opens it in a browser.
import { useCallback, useState } from 'react';
import { ActivityIndicator, Share, StyleSheet, Switch, View } from 'react-native';
import QRCode from 'react-native-qrcode-svg';

import { SessionExpiredError } from '@/api/client';
import {
  buildShareUrl,
  createShare,
  fetchShareableFiles,
  fetchShares,
  revokeShare,
  setShareVisibility,
  type CreatedShare,
  type ShareableFile,
  type ShareView,
} from '@/api/share';
import { useAuth } from '@/auth/AuthContext';
import { Button } from '@/components/Button';
import { Card } from '@/components/Card';
import { EmptyState } from '@/components/EmptyState';
import { Pill } from '@/components/Pill';
import { Screen } from '@/components/Screen';
import { SectionHeader } from '@/components/SectionHeader';
import { Body, ErrorText, Eyebrow, Muted, NoticeText, Serif, Title } from '@/components/Typography';
import { normalizeError } from '@/lib/errors';
import { colors, fonts, palette, radius, sizes, spacing } from '@/theme';
import { useFocusEffect } from 'expo-router';

export default function ShareDocuments() {
  const { session, signOut } = useAuth();
  const [files, setFiles] = useState<ShareableFile[]>([]);
  const [shares, setShares] = useState<ShareView[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastCreated, setLastCreated] = useState<CreatedShare | null>(null);

  const handleError = useCallback(
    (err: unknown) => {
      if (err instanceof SessionExpiredError) {
        signOut();
        return;
      }
      setError(normalizeError(err).message);
    },
    [signOut],
  );

  const load = useCallback(() => {
    if (!session) {
      return;
    }
    setLoading(true);
    setError('');
    Promise.all([fetchShareableFiles(session), fetchShares(session)])
      .then(([fileList, shareList]) => {
        setFiles(fileList ?? []);
        setShares(shareList ?? []);
      })
      .catch(handleError)
      .finally(() => setLoading(false));
  }, [session, handleError]);

  useFocusEffect(load);

  const toggle = useCallback(
    (fileId: string, shareable: boolean) => {
      if (!session) {
        return;
      }
      setNotice('');
      // Optimistic: reflect immediately, revert on failure.
      setFiles((current) =>
        current.map((file) => (file.fileId === fileId ? { ...file, shareable } : file)),
      );
      setShareVisibility(session, fileId, shareable).catch((err) => {
        setFiles((current) =>
          current.map((file) =>
            file.fileId === fileId ? { ...file, shareable: !shareable } : file,
          ),
        );
        handleError(err);
      });
    },
    [session, handleError],
  );

  const generate = useCallback(() => {
    if (!session || busy) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    createShare(session, true)
      .then((created) => {
        setLastCreated(created);
        setNotice('Secure link created. Show the QR code to the person you are sharing with.');
        return fetchShares(session).then((shareList) => setShares(shareList ?? []));
      })
      .catch(handleError)
      .finally(() => setBusy(false));
  }, [session, busy, handleError]);

  const revoke = useCallback(
    (shareId: string) => {
      if (!session || busy) {
        return;
      }
      setBusy(true);
      setError('');
      setNotice('');
      revokeShare(session, shareId)
        .then(() => {
          setLastCreated((current) => (current && current.shareId === shareId ? null : current));
          setNotice('Link revoked. It can no longer be opened.');
          return fetchShares(session).then((shareList) => setShares(shareList ?? []));
        })
        .catch(handleError)
        .finally(() => setBusy(false));
    },
    [session, busy, handleError],
  );

  const shareableCount = files.filter((file) => file.shareable).length;

  return (
    <Screen footerSpace={sizes.tabContentBottom}>
      <View style={styles.header}>
        <Eyebrow dot>Secure sharing</Eyebrow>
        <Title>Share documents</Title>
        <Serif>
          Choose which uploaded documents can be shared, then generate a secure QR code. The person you
          share with scans it from any phone — no account needed — and sees only the files you marked
          shareable. Links expire automatically and can be revoked any time.
        </Serif>
      </View>

      {error ? <ErrorText>{error}</ErrorText> : null}
      {notice ? <NoticeText>{notice}</NoticeText> : null}
      {loading ? <ActivityIndicator color={colors.primary} /> : null}

      <SectionHeader title="Shareable documents" />
      {files.length === 0 && !loading ? (
        <EmptyState
          icon="cloud-upload-outline"
          title="No documents yet"
          message="Add certificates to your Sea Wallet first, then choose which ones to share."
        />
      ) : (
        <View style={styles.list}>
          {files.map((file) => (
            <Card key={file.fileId} style={styles.row}>
              <View style={styles.rowText}>
                <Body numberOfLines={1}>
                  {file.documentName || file.originalFilename || 'Document'}
                </Body>
                <Muted>{metaLine(file)}</Muted>
              </View>
              <Switch
                value={file.shareable}
                onValueChange={(value) => toggle(file.fileId, value)}
                trackColor={{ false: palette.navy2, true: colors.primary }}
                thumbColor={palette.paper}
              />
            </Card>
          ))}
        </View>
      )}

      <SectionHeader title="Generate a secure link" />
      <Muted>{shareableCount} document(s) marked shareable.</Muted>
      <Button
        title="Generate secure QR link"
        icon="qr-code-outline"
        onPress={generate}
        loading={busy}
        disabled={shareableCount === 0}
      />

      {lastCreated ? (
        <Card variant="elevated" style={styles.created}>
          <Body style={styles.qrHeading}>Your secure QR link</Body>
          <Muted>
            Anyone who scans this can view your {shareableCount} shareable file(s) until it expires.
          </Muted>
          <View style={styles.qrWrap}>
            <QRCode value={buildShareUrl(lastCreated.token)} size={220} />
          </View>
          <Body numberOfLines={2}>{buildShareUrl(lastCreated.token)}</Body>
          <Button
            title="Share link"
            variant="secondary"
            onPress={() => {
              void Share.share({ message: buildShareUrl(lastCreated.token) });
            }}
          />
          <Muted>Expires {formatDateTime(lastCreated.expiresAt)}.</Muted>
        </Card>
      ) : null}

      {shares.length > 0 ? (
        <>
          <SectionHeader title="Your share links" />
          <View style={styles.list}>
            {shares.map((share) => (
              <Card key={share.shareId} style={styles.shareRow}>
                <View style={styles.shareHead}>
                  <Body>{share.recipientLabel || 'Secure link'}</Body>
                  <Pill label={share.status} tone={statusTone(share.status)} />
                </View>
                <Muted>
                  Created {formatDateTime(share.createdAt)} · Expires {formatDateTime(share.expiresAt)}
                </Muted>
                <Muted>
                  {share.viewCount} view(s) · {share.downloadCount} download(s)
                </Muted>
                {share.status === 'ACTIVE' ? (
                  <Button title="Revoke" variant="secondary" onPress={() => revoke(share.shareId)} />
                ) : null}
              </Card>
            ))}
          </View>
        </>
      ) : null}
    </Screen>
  );
}

function metaLine(file: ShareableFile): string {
  return [file.category ?? '', file.sizeBytes ? formatBytes(file.sizeBytes) : '']
    .filter(Boolean)
    .join(' · ');
}

function statusTone(status: string): 'ok' | 'warn' | 'due' | 'neutral' {
  if (status === 'ACTIVE') {
    return 'ok';
  }
  if (status === 'REVOKED') {
    return 'due';
  }
  return 'neutral';
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return '';
  }
  const units = ['B', 'KB', 'MB', 'GB'];
  const exponent = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** exponent;
  return `${value >= 10 || exponent === 0 ? Math.round(value) : value.toFixed(1)} ${units[exponent]}`;
}

function formatDateTime(iso: string | null): string {
  if (!iso) {
    return '—';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '—';
  }
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const styles = StyleSheet.create({
  header: { gap: spacing.sm, marginBottom: spacing.xs },
  list: { gap: spacing.sm },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowText: { gap: 2, flexShrink: 1, paddingRight: spacing.sm },
  created: { alignItems: 'stretch', gap: spacing.sm },
  qrHeading: { fontFamily: fonts.bodySemiBold, fontSize: 16 },
  qrWrap: {
    alignSelf: 'center',
    padding: spacing.md,
    backgroundColor: palette.paper,
    borderRadius: radius.md,
  },
  shareRow: { gap: spacing.xs },
  shareHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
});
