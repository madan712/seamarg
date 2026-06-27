package com.seamarg.backend.certificate;

import org.springframework.util.StringUtils;

import java.time.LocalDate;

public record CertificateExtraction(
		String documentName,
		String documentCategory,
		String rank,
		LocalDate expiryDate,
		String issuer,
		String certificateNumber,
		Double confidence,
		String source,
		String notes) {

	public static CertificateExtraction reviewRequired(String source, String notes) {
		return new CertificateExtraction(null, null, null, null, null, null, 0.0, source, notes);
	}

	public CertificateExtraction normalized() {
		return new CertificateExtraction(
			clean(documentName),
			clean(documentCategory),
			clean(rank),
			expiryDate,
			clean(issuer),
			clean(certificateNumber),
			confidence == null ? 0.0 : Math.max(0.0, Math.min(1.0, confidence)),
			StringUtils.hasText(source) ? source : "unknown",
			clean(notes));
	}

	private static String clean(String value) {
		return StringUtils.hasText(value) ? value.trim() : null;
	}
}
