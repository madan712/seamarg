package com.seamarg.backend.certificate;

import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Pattern;

@Component
class LocalCertificateExtractor {

	private static final Pattern LABELLED_EXPIRY_DATE = Pattern.compile(
		"(?i)(expiry|expires|valid until|valid upto|valid up to|date of expiry|validity)[^0-9A-Za-z]{0,24}"
			+ "([0-3]?\\d[/-][01]?\\d[/-](?:\\d{4}|\\d{2})|\\d{4}-[01]\\d-[0-3]\\d|[0-3]?\\d\\s+[A-Za-z]{3,9}\\s+\\d{4})");
	private static final List<DateTimeFormatter> DATE_FORMATTERS = List.of(
		DateTimeFormatter.ISO_LOCAL_DATE,
		DateTimeFormatter.ofPattern("d/M/yyyy", Locale.ENGLISH),
		DateTimeFormatter.ofPattern("d-M-yyyy", Locale.ENGLISH),
		DateTimeFormatter.ofPattern("d MMM yyyy", Locale.ENGLISH),
		DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH));

	CertificateExtraction analyze(String originalFilename, String contentType, byte[] content) {
		var searchableText = buildSearchableText(originalFilename, contentType, content);
		var documentType = findDocumentType(searchableText);
		var rank = findRank(searchableText).orElse(null);
		var expiryDate = findExpiryDate(searchableText).orElse(null);
		var confidence = calculateConfidence(documentType.isPresent(), rank != null, expiryDate != null);
		var notes = confidence >= 0.65
			? "Local extraction matched known merchant navy document patterns."
			: "Review required because local extraction could not confidently read every field.";

		return new CertificateExtraction(
			documentType.map(KnownCertificateDocuments.DocumentType::name).orElse("Uploaded document"),
			documentType.map(KnownCertificateDocuments.DocumentType::category).orElse("Other"),
			rank,
			expiryDate,
			null,
			null,
			confidence,
			"local-rules",
			notes).normalized();
	}

	private static String buildSearchableText(String originalFilename, String contentType, byte[] content) {
		var builder = new StringBuilder();
		if (originalFilename != null) {
			builder.append(originalFilename).append('\n');
		}

		if (contentType != null && contentType.startsWith("text/")) {
			builder.append(new String(content, StandardCharsets.UTF_8));
		}

		return builder.toString();
	}

	private static Optional<KnownCertificateDocuments.DocumentType> findDocumentType(String searchableText) {
		var normalizedText = normalize(searchableText);
		return KnownCertificateDocuments.DOCUMENT_TYPES.stream()
			.filter(document -> normalizedText.contains(normalize(document.name())))
			.max(Comparator.comparingInt(document -> document.name().length()));
	}

	private static Optional<String> findRank(String searchableText) {
		var normalizedText = normalize(searchableText);
		return KnownCertificateDocuments.RANKS.stream()
			.filter(rank -> normalizedText.contains(normalize(rank)))
			.max(Comparator.comparingInt(String::length));
	}

	private static Optional<LocalDate> findExpiryDate(String searchableText) {
		var matcher = LABELLED_EXPIRY_DATE.matcher(searchableText);
		while (matcher.find()) {
			var parsed = parseDate(matcher.group(2));
			if (parsed.isPresent()) {
				return parsed;
			}
		}

		return Optional.empty();
	}

	private static Optional<LocalDate> parseDate(String value) {
		for (var formatter : DATE_FORMATTERS) {
			try {
				return Optional.of(LocalDate.parse(value.trim(), formatter));
			} catch (DateTimeParseException ignored) {
				// Try the next common certificate date format.
			}
		}

		return Optional.empty();
	}

	private static double calculateConfidence(boolean hasDocumentName, boolean hasRank, boolean hasExpiryDate) {
		var confidence = 0.32;
		if (hasDocumentName) {
			confidence += 0.28;
		}
		if (hasRank) {
			confidence += 0.14;
		}
		if (hasExpiryDate) {
			confidence += 0.2;
		}

		return Math.min(confidence, 0.78);
	}

	private static String normalize(String value) {
		return value.toLowerCase(Locale.ENGLISH).replaceAll("[^a-z0-9]+", " ").trim();
	}
}
