package com.seamarg.backend.share;

import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.Base64;
import java.util.Optional;

/**
 * Issues and verifies the short-lived <em>share session</em> token the anonymous
 * recipient uses after redeeming a link (design §2.2). The token is a minimal
 * stateless HMAC-signed blob — {@code base64url(payload).base64url(hmacSha256)} —
 * so nothing is stored server-side. Payload is {@code shareId|ownerSub|expiresAtEpoch};
 * the {@code scope} is implicit (this signer only ever mints share sessions).
 * Carrying {@code ownerSub} lets the recipient's follow-up calls resolve the
 * owner-keyed share without a second lookup (the sub is not secret, and only the
 * legitimate recipient ever holds a valid token).
 *
 * <p>The recipient sends it back in the {@code X-Share-Session} header (not
 * {@code Authorization}, which the Cognito resource-server filter would try to
 * decode and reject).
 */
@Slf4j
@Service
class ShareSessionService {

	static final String HEADER = "X-Share-Session";

	private static final Base64.Encoder ENCODER = Base64.getUrlEncoder().withoutPadding();
	private static final Base64.Decoder DECODER = Base64.getUrlDecoder();

	private final byte[] secret;

	ShareSessionService(ShareSettings settings) {
		if (StringUtils.hasText(settings.hmacSecret())) {
			this.secret = settings.hmacSecret().getBytes(StandardCharsets.UTF_8);
		}
		else {
			// No configured secret (local dev): mint a random per-boot secret so
			// sessions still work; they simply do not survive a restart.
			var random = new byte[32];
			new SecureRandom().nextBytes(random);
			this.secret = random;
			log.warn("seamarg.share.hmac-secret is not set; using a random per-boot secret. "
				+ "Set it in production so share sessions survive restarts and multiple instances agree.");
		}
	}

	/** Mints a session token for a share, valid until {@code expiresAt}. */
	String issue(String shareId, String ownerSub, Instant expiresAt) {
		var payload = shareId + "|" + ownerSub + "|" + expiresAt.getEpochSecond();
		var payloadBytes = payload.getBytes(StandardCharsets.UTF_8);
		return ENCODER.encodeToString(payloadBytes) + "." + ENCODER.encodeToString(sign(payloadBytes));
	}

	/** Returns the share reference if the token is well-formed, unmodified, and unexpired. */
	Optional<SessionRef> verify(String token, Instant now) {
		if (!StringUtils.hasText(token)) {
			return Optional.empty();
		}
		var dot = token.indexOf('.');
		if (dot <= 0 || dot == token.length() - 1) {
			return Optional.empty();
		}
		try {
			var payloadBytes = DECODER.decode(token.substring(0, dot));
			var providedMac = DECODER.decode(token.substring(dot + 1));
			if (!MessageDigest.isEqual(providedMac, sign(payloadBytes))) {
				return Optional.empty();
			}
			var parts = new String(payloadBytes, StandardCharsets.UTF_8).split("\\|", 3);
			if (parts.length != 3) {
				return Optional.empty();
			}
			if (now.getEpochSecond() >= Long.parseLong(parts[2])) {
				return Optional.empty();
			}
			return Optional.of(new SessionRef(parts[0], parts[1]));
		}
		catch (IllegalArgumentException exception) {
			return Optional.empty();
		}
	}

	/** The share a valid session token points at. */
	record SessionRef(String shareId, String ownerSub) {
	}

	private byte[] sign(byte[] payload) {
		try {
			var mac = Mac.getInstance("HmacSHA256");
			mac.init(new SecretKeySpec(secret, "HmacSHA256"));
			return mac.doFinal(payload);
		}
		catch (Exception exception) {
			throw new IllegalStateException("Could not sign share session token.", exception);
		}
	}
}
