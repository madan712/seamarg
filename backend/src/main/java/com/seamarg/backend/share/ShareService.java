package com.seamarg.backend.share;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.util.Base64;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

/**
 * Core of the document-sharing feature: mints capability tokens, persists shares,
 * and redeems them for anonymous recipients.
 *
 * <p>The capability token is 256 bits of CSPRNG randomness, base64url-encoded. Only
 * its SHA-256 hash is stored (design §2.1), so a database leak never exposes live
 * links. The plaintext token is returned exactly once, at creation.
 */
@Service
class ShareService {

	private static final int TOKEN_BYTES = 32;

	private final ShareRepository shareRepository;
	private final ShareSessionService shareSessionService;
	private final ShareSettings settings;
	private final SecureRandom secureRandom = new SecureRandom();
	private final Base64.Encoder tokenEncoder = Base64.getUrlEncoder().withoutPadding();
	private final Clock clock;

	@Autowired
	ShareService(ShareRepository shareRepository, ShareSessionService shareSessionService, ShareSettings settings) {
		this(shareRepository, shareSessionService, settings, Clock.systemUTC());
	}

	// Visible for testing with a fixed clock.
	ShareService(ShareRepository shareRepository, ShareSessionService shareSessionService, ShareSettings settings,
			Clock clock) {
		this.shareRepository = shareRepository;
		this.shareSessionService = shareSessionService;
		this.settings = settings;
		this.clock = clock;
	}

	/** Creates a new active share and returns the one-time plaintext token. */
	CreatedShare createShare(String ownerSub, boolean allowDownload, String recipientLabel) {
		var token = generateToken();
		var now = clock.instant();
		var share = new ShareItem(
			UUID.randomUUID().toString(),
			ownerSub,
			hashToken(token),
			ShareStatus.ACTIVE,
			allowDownload,
			trimToNull(recipientLabel),
			now,
			now.plus(settings.linkTtl()),
			0L,
			0L,
			null);
		shareRepository.save(share);
		return new CreatedShare(share.shareId(), token, share.expiresAt(), share.allowDownload(),
			share.recipientLabel());
	}

	/** The owner's shares, newest first, with a live status (expired links reported as EXPIRED). */
	List<ShareView> listOwnerShares(String ownerSub) {
		var now = clock.instant();
		return shareRepository.listByOwner(ownerSub).stream()
			.sorted(Comparator.comparing(ShareItem::createdAt,
				Comparator.nullsLast(Comparator.naturalOrder())).reversed())
			.map(share -> toView(share, now))
			.toList();
	}

	ShareView getOwnerShare(String ownerSub, String shareId) {
		var share = shareRepository.findByOwnerAndId(ownerSub, shareId)
			.orElseThrow(() -> new IllegalArgumentException("Share not found."));
		return toView(share, clock.instant());
	}

	/** Revokes an active share; a revoked link can never be redeemed again. */
	void revoke(String ownerSub, String shareId) {
		var share = shareRepository.findByOwnerAndId(ownerSub, shareId)
			.orElseThrow(() -> new IllegalArgumentException("Share not found."));
		if (share.status() != ShareStatus.REVOKED) {
			shareRepository.save(share.revoked());
		}
	}

	/**
	 * Redeems a capability token for an anonymous recipient. Validates the token,
	 * status, and expiry, records a view, and returns a short-lived session token.
	 *
	 * @param pin optional second factor; unused in MVP (design D2), but validated
	 *            through {@link #validateSecondFactor} so a PIN/OTP can be added
	 *            later without changing this flow or the client contract.
	 */
	RedeemedShare redeem(String token, String pin) {
		var now = clock.instant();
		var share = shareRepository.findByTokenHash(hashToken(token))
			.filter(candidate -> candidate.isRedeemable(now))
			.orElseThrow(() -> new ShareGoneException("This link is no longer available."));

		validateSecondFactor(share, pin);

		var accessed = share.withView(now);
		shareRepository.save(accessed);

		var sessionExpiry = earliest(now.plus(settings.sessionTtl()), share.expiresAt());
		var sessionToken = shareSessionService.issue(share.shareId(), share.ownerSub(), sessionExpiry);
		return new RedeemedShare(share.shareId(), share.ownerSub(), share.allowDownload(), share.recipientLabel(),
			share.expiresAt(), sessionToken, sessionExpiry);
	}

	/**
	 * Resolves a live, redeemable share from a valid session token. Used by the
	 * recipient's file-list and download calls after redeeming.
	 */
	ShareItem requireActiveShareForSession(String sessionToken) {
		var now = clock.instant();
		var ref = shareSessionService.verify(sessionToken, now)
			.orElseThrow(() -> new ShareSessionInvalidException("Your access session is invalid or has expired."));
		return shareRepository.findByOwnerAndId(ref.ownerSub(), ref.shareId())
			.filter(share -> share.isRedeemable(now))
			.orElseThrow(() -> new ShareGoneException("This link is no longer available."));
	}

	void recordDownload(ShareItem share) {
		shareRepository.save(share.withDownload(clock.instant()));
	}

	/**
	 * Second-factor hook. No-op in MVP (design D2). To enable a PIN/OTP later,
	 * compare {@code pin} against the (currently unset) hash on the share and
	 * throw on mismatch — no other part of the redeem flow needs to change.
	 */
	@SuppressWarnings("unused")
	private void validateSecondFactor(ShareItem share, String pin) {
		// Intentionally empty: MVP has no second factor.
	}

	private ShareView toView(ShareItem share, Instant now) {
		var status = share.status() == ShareStatus.ACTIVE && share.isExpired(now) ? "EXPIRED" : share.status().name();
		return new ShareView(share.shareId(), status, share.allowDownload(), share.recipientLabel(),
			share.createdAt(), share.expiresAt(), share.viewCount(), share.downloadCount(), share.lastAccessedAt());
	}

	private String generateToken() {
		var bytes = new byte[TOKEN_BYTES];
		secureRandom.nextBytes(bytes);
		return tokenEncoder.encodeToString(bytes);
	}

	static String hashToken(String token) {
		try {
			var digest = MessageDigest.getInstance("SHA-256");
			var hash = digest.digest(token.getBytes(StandardCharsets.UTF_8));
			var hex = new StringBuilder(hash.length * 2);
			for (var b : hash) {
				hex.append(Character.forDigit((b >> 4) & 0xF, 16));
				hex.append(Character.forDigit(b & 0xF, 16));
			}
			return hex.toString();
		}
		catch (NoSuchAlgorithmException exception) {
			throw new IllegalStateException("SHA-256 is unavailable.", exception);
		}
	}

	private static Instant earliest(Instant a, Instant b) {
		if (a == null) {
			return b;
		}
		if (b == null) {
			return a;
		}
		return a.isBefore(b) ? a : b;
	}

	private static String trimToNull(String value) {
		if (value == null) {
			return null;
		}
		var trimmed = value.trim();
		return trimmed.isEmpty() ? null : trimmed;
	}

	/** Result of creating a share — the token is present only here, once. */
	record CreatedShare(String shareId, String token, Instant expiresAt, boolean allowDownload,
			String recipientLabel) {
	}

	/** Owner-facing view of a share (never includes the token). */
	record ShareView(String shareId, String status, boolean allowDownload, String recipientLabel, Instant createdAt,
			Instant expiresAt, long viewCount, long downloadCount, Instant lastAccessedAt) {
	}

	/** Result of a successful redeem — everything the recipient's client needs next. */
	record RedeemedShare(String shareId, String ownerSub, boolean allowDownload, String recipientLabel,
			Instant expiresAt, String sessionToken, Instant sessionExpiresAt) {
	}
}
