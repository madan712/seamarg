package com.seamarg.backend.share;

import java.time.Instant;

/**
 * A secure share created by a seafarer. The share does not store a chosen file
 * subset (design D1): the recipient always sees the owner's <em>currently</em>
 * shareable files, resolved live at access time. The item only holds the token
 * (hashed), lifecycle, and access counters.
 *
 * <p>Persisted at {@code pk = USER#<ownerSub>}, {@code sk = SHARE#<shareId>}, with
 * a {@code gsi1Pk = SHARETOKEN#<tokenHash>} entry so the anonymous recipient can
 * be resolved by token (design D3, reusing the existing {@code gsi1} index) and
 * an {@code expiresAt} epoch-seconds attribute so DynamoDB TTL auto-cleans it.
 */
record ShareItem(
		String shareId,
		String ownerSub,
		String tokenHash,
		ShareStatus status,
		boolean allowDownload,
		String recipientLabel,
		Instant createdAt,
		Instant expiresAt,
		long viewCount,
		long downloadCount,
		Instant lastAccessedAt) {

	/** True when the link has passed its expiry instant (independent of DynamoDB TTL lag). */
	boolean isExpired(Instant now) {
		return expiresAt != null && !now.isBefore(expiresAt);
	}

	/** True when the link can still be redeemed right now. */
	boolean isRedeemable(Instant now) {
		return status == ShareStatus.ACTIVE && !isExpired(now);
	}

	ShareItem revoked() {
		return new ShareItem(shareId, ownerSub, tokenHash, ShareStatus.REVOKED, allowDownload, recipientLabel,
			createdAt, expiresAt, viewCount, downloadCount, lastAccessedAt);
	}

	ShareItem withView(Instant at) {
		return new ShareItem(shareId, ownerSub, tokenHash, status, allowDownload, recipientLabel, createdAt,
			expiresAt, viewCount + 1, downloadCount, at);
	}

	ShareItem withDownload(Instant at) {
		return new ShareItem(shareId, ownerSub, tokenHash, status, allowDownload, recipientLabel, createdAt,
			expiresAt, viewCount, downloadCount + 1, at);
	}
}
