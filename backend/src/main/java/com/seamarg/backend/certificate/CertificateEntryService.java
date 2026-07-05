package com.seamarg.backend.certificate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Stores one detailed certificate entry per (category, catalog type) as a JSON
 * item ({@code sk = CERT#<CATEGORY>#<TYPE_SLUG>}). Validates the required fields
 * and rejects past expiry dates (PRD §5.3–5.8, §7).
 */
@Service
class CertificateEntryService {

	private static final String PREFIX = "CERT#";

	private static final List<RequiredField> COMMON_REQUIRED = List.of(
		new RequiredField("issuedDate", "Issued Date"),
		new RequiredField("issuePlace", "Issue Place"),
		new RequiredField("issuingAuthority", "Issuing Authority"));

	private static final Map<CertificateCategory, List<RequiredField>> EXTRA_REQUIRED = Map.of(
		CertificateCategory.NCOC, List.of(new RequiredField("cocGrade", "COC grade")));

	private final CertificateDataRepository repository;
	private final ObjectMapper objectMapper;

	CertificateEntryService(CertificateDataRepository repository, ObjectMapper objectMapper) {
		this.repository = repository;
		this.objectMapper = objectMapper;
	}

	/** Returns saved entries grouped by category slug, then by catalog type slug. */
	Map<String, Map<String, Object>> listByCategory(String userId) {
		var grouped = new LinkedHashMap<String, Map<String, Object>>();
		for (var item : repository.findByUserIdAndPrefix(userId, PREFIX)) {
			var parts = item.sortKey().split("#", 3);
			if (parts.length < 3) {
				continue; // e.g. CERT#MAINDOCS — not a detailed entry
			}
			var category = CertificateCategory.fromName(parts[1]).orElse(null);
			if (category == null) {
				continue;
			}
			grouped.computeIfAbsent(category.slug(), key -> new LinkedHashMap<>())
				.put(parts[2], parsePayload(item.payloadJson()));
		}
		return grouped;
	}

	Map<String, Object> saveEntry(String userId, CertificateCategory category, String typeSlug,
			Map<String, Object> fields) {
		if (!StringUtils.hasText(typeSlug)) {
			throw new IllegalArgumentException("Unknown certificate type.");
		}

		var data = fields == null ? Map.<String, Object>of() : fields;
		validateRequired(category, data);
		validateExpiryNotPast(data);

		repository.savePayload(userId, sortKey(category, typeSlug), writePayload(data));
		return data;
	}

	private void validateRequired(CertificateCategory category, Map<String, Object> fields) {
		var required = new java.util.ArrayList<>(COMMON_REQUIRED);
		required.addAll(EXTRA_REQUIRED.getOrDefault(category, List.of()));
		for (var field : required) {
			var value = fields.get(field.key());
			if (!(value instanceof String text) || text.isBlank()) {
				throw new IllegalArgumentException(field.label() + " is required.");
			}
		}
	}

	private void validateExpiryNotPast(Map<String, Object> fields) {
		var value = fields.get("expiryDate");
		if (!(value instanceof String text) || text.isBlank()) {
			return;
		}
		final LocalDate expiry;
		try {
			expiry = LocalDate.parse(text);
		} catch (DateTimeParseException exception) {
			throw new IllegalArgumentException("Expiry date is not a valid date.");
		}
		if (expiry.isBefore(LocalDate.now())) {
			throw new IllegalArgumentException("Expiry date cannot be in the past; expired certificates are not accepted.");
		}
	}

	private static String sortKey(CertificateCategory category, String typeSlug) {
		return PREFIX + category.name() + "#" + typeSlug;
	}

	private Map<String, Object> parsePayload(String payloadJson) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return Map.of();
		}
		try {
			return objectMapper.readValue(payloadJson, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (JsonProcessingException exception) {
			throw new IllegalStateException("Stored certificate entry could not be read.", exception);
		}
	}

	private String writePayload(Map<String, Object> fields) {
		try {
			return objectMapper.writeValueAsString(fields);
		} catch (JsonProcessingException exception) {
			throw new IllegalArgumentException("Certificate entry could not be serialized.", exception);
		}
	}

	private record RequiredField(String key, String label) {
	}
}
