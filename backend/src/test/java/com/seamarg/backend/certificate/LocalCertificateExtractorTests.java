package com.seamarg.backend.certificate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;

class LocalCertificateExtractorTests {

	private final LocalCertificateExtractor extractor = new LocalCertificateExtractor();

	@Test
	void extractsKnownDocumentRankAndExpiryFromTextCertificate() {
		var content = """
			Merchant Navy Medical Fitness Certificate
			Rank: Second Officer
			Valid until: 31/12/2027
			""".getBytes(StandardCharsets.UTF_8);

		var result = extractor.analyze("medical-fitness-certificate.txt", "text/plain", content);

		assertEquals("Medical Fitness Certificate", result.documentName());
		assertEquals("Medical", result.documentCategory());
		assertEquals("Second Officer", result.rank());
		assertEquals(LocalDate.of(2027, 12, 31), result.expiryDate());
		assertTrue(result.confidence() >= 0.65);
	}

	@Test
	void usesFilenameWhenDocumentTextIsNotReadable() {
		var result = extractor.analyze(
			"chief-engineer-coc.pdf",
			"application/pdf",
			"not parsed locally".getBytes(StandardCharsets.UTF_8));

		assertEquals("COC", result.documentName());
		assertEquals("Competency", result.documentCategory());
		assertEquals("Chief Engineer", result.rank());
		assertEquals("local-rules", result.source());
	}
}
