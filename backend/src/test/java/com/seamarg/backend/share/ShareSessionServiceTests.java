package com.seamarg.backend.share;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import java.time.Duration;
import java.time.Instant;

class ShareSessionServiceTests {

	private static final Instant NOW = Instant.parse("2026-07-09T10:00:00Z");

	private ShareSessionService service(String secret) {
		return new ShareSessionService(new ShareSettings("", Duration.ofMinutes(30), Duration.ofMinutes(15), secret));
	}

	@Test
	void issuesAndVerifiesAToken() {
		var service = service("top-secret");
		var token = service.issue("share-1", "owner-9", NOW.plusSeconds(900));

		var ref = service.verify(token, NOW);

		assertTrue(ref.isPresent());
		assertEquals("share-1", ref.get().shareId());
		assertEquals("owner-9", ref.get().ownerSub());
	}

	@Test
	void rejectsATamperedToken() {
		var service = service("top-secret");
		var token = service.issue("share-1", "owner-9", NOW.plusSeconds(900));

		// Flip the last character of the payload segment.
		var dot = token.indexOf('.');
		var tampered = flipFirst(token.substring(0, dot)) + token.substring(dot);

		assertTrue(service.verify(tampered, NOW).isEmpty());
	}

	@Test
	void rejectsAnExpiredToken() {
		var service = service("top-secret");
		var token = service.issue("share-1", "owner-9", NOW.plusSeconds(900));

		assertTrue(service.verify(token, NOW.plusSeconds(901)).isEmpty());
	}

	@Test
	void rejectsATokenSignedWithADifferentSecret() {
		var token = service("secret-a").issue("share-1", "owner-9", NOW.plusSeconds(900));

		assertTrue(service("secret-b").verify(token, NOW).isEmpty());
	}

	@Test
	void rejectsMalformedInput() {
		var service = service("top-secret");
		assertTrue(service.verify(null, NOW).isEmpty());
		assertTrue(service.verify("", NOW).isEmpty());
		assertTrue(service.verify("no-dot", NOW).isEmpty());
		assertTrue(service.verify(".", NOW).isEmpty());
	}

	private static String flipFirst(String value) {
		var first = value.charAt(0);
		var replacement = first == 'A' ? 'B' : 'A';
		return replacement + value.substring(1);
	}
}
