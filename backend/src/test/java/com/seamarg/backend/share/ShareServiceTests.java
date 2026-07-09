package com.seamarg.backend.share;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;

class ShareServiceTests {

	private static final Instant NOW = Instant.parse("2026-07-09T10:00:00Z");
	private static final String OWNER = "owner-1";

	private final ShareRepository repository = new InMemoryShareRepository();
	private final ShareSettings settings =
		new ShareSettings("", Duration.ofMinutes(30), Duration.ofMinutes(15), "test-secret");
	private final ShareSessionService sessionService = new ShareSessionService(settings);

	private ShareService serviceAt(Instant instant) {
		return new ShareService(repository, sessionService, settings, Clock.fixed(instant, ZoneOffset.UTC));
	}

	@Test
	void createsAnActiveShareWithAOneTimeTokenAndTrimmedLabel() {
		var created = serviceAt(NOW).createShare(OWNER, true, "  Port Agent  ");

		assertNotNull(created.shareId());
		assertFalse(created.token().isBlank());
		assertEquals(NOW.plus(Duration.ofMinutes(30)), created.expiresAt());
		assertTrue(created.allowDownload());
		assertEquals("Port Agent", created.recipientLabel());

		var views = serviceAt(NOW).listOwnerShares(OWNER);
		assertEquals(1, views.size());
		assertEquals("ACTIVE", views.get(0).status());
	}

	@Test
	void redeemsAValidTokenAndRecordsAView() {
		var service = serviceAt(NOW);
		var created = service.createShare(OWNER, true, null);

		var redeemed = service.redeem(created.token(), null);

		assertEquals(OWNER, redeemed.ownerSub());
		assertTrue(redeemed.allowDownload());
		assertNotNull(redeemed.sessionToken());
		// Session never outlives the link, and is capped at the 15m session TTL.
		assertEquals(NOW.plus(Duration.ofMinutes(15)), redeemed.sessionExpiresAt());

		var share = repository.findByTokenHash(ShareService.hashToken(created.token())).orElseThrow();
		assertEquals(1, share.viewCount());

		// The session resolves back to the same active share.
		var resolved = service.requireActiveShareForSession(redeemed.sessionToken());
		assertEquals(created.shareId(), resolved.shareId());
	}

	@Test
	void rejectsAnUnknownToken() {
		var service = serviceAt(NOW);
		assertThrows(ShareGoneException.class, () -> service.redeem("not-a-real-token", null));
	}

	@Test
	void rejectsAnExpiredLink() {
		var created = serviceAt(NOW).createShare(OWNER, true, null);

		var afterExpiry = serviceAt(NOW.plus(Duration.ofMinutes(31)));
		assertThrows(ShareGoneException.class, () -> afterExpiry.redeem(created.token(), null));
	}

	@Test
	void rejectsARevokedLink() {
		var service = serviceAt(NOW);
		var created = service.createShare(OWNER, true, null);

		service.revoke(OWNER, created.shareId());

		assertEquals("REVOKED", service.getOwnerShare(OWNER, created.shareId()).status());
		assertThrows(ShareGoneException.class, () -> service.redeem(created.token(), null));
	}

	@Test
	void reportsExpiredStatusInOwnerListingWithoutRevoking() {
		serviceAt(NOW).createShare(OWNER, true, null);

		var later = serviceAt(NOW.plus(Duration.ofMinutes(31)));
		assertEquals("EXPIRED", later.listOwnerShares(OWNER).get(0).status());
	}

	@Test
	void cappsSessionExpiryToTheRemainingLinkLife() {
		var shortLink = new ShareSettings("", Duration.ofMinutes(5), Duration.ofMinutes(15), "test-secret");
		var service = new ShareService(repository, new ShareSessionService(shortLink), shortLink,
			Clock.fixed(NOW, ZoneOffset.UTC));
		var created = service.createShare(OWNER, true, null);

		var redeemed = service.redeem(created.token(), null);

		// 5m link < 15m session TTL, so the session expires with the link.
		assertEquals(NOW.plus(Duration.ofMinutes(5)), redeemed.sessionExpiresAt());
	}

	@Test
	void rejectsAnExpiredSession() {
		var service = serviceAt(NOW);
		var created = service.createShare(OWNER, true, null);
		var redeemed = service.redeem(created.token(), null);

		var later = serviceAt(NOW.plus(Duration.ofMinutes(16)));
		assertThrows(ShareSessionInvalidException.class,
			() -> later.requireActiveShareForSession(redeemed.sessionToken()));
	}

	@Test
	void distinctSharesGetDistinctTokens() {
		var service = serviceAt(NOW);
		var a = service.createShare(OWNER, true, null);
		var b = service.createShare(OWNER, true, null);
		assertFalse(a.token().equals(b.token()));
		assertEquals(2, service.listOwnerShares(OWNER).size());
	}
}
