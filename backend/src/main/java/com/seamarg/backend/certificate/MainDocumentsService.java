package com.seamarg.backend.certificate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Stores the "Main documents" held/not-held checklist as a single JSON item
 * ({@code sk = CERT#MAINDOCS}), mirroring the profile-section storage pattern.
 */
@Service
class MainDocumentsService {

	static final String SORT_KEY = "CERT#MAINDOCS";

	private final CertificateDataRepository repository;
	private final ObjectMapper objectMapper;

	MainDocumentsService(CertificateDataRepository repository, ObjectMapper objectMapper) {
		this.repository = repository;
		this.objectMapper = objectMapper;
	}

	Map<String, Object> get(String userId) {
		return repository.findPayload(userId, SORT_KEY)
			.map(this::parse)
			.orElseGet(Map::of);
	}

	Map<String, Object> save(String userId, Map<String, Object> documents) {
		var data = documents == null ? Map.<String, Object>of() : documents;
		repository.savePayload(userId, SORT_KEY, write(data));
		return data;
	}

	private Map<String, Object> parse(String payloadJson) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return Map.of();
		}
		try {
			return objectMapper.readValue(payloadJson, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (JsonProcessingException exception) {
			throw new IllegalStateException("Stored main documents could not be read.", exception);
		}
	}

	private String write(Map<String, Object> data) {
		try {
			return objectMapper.writeValueAsString(data);
		} catch (JsonProcessingException exception) {
			throw new IllegalArgumentException("Main documents could not be serialized.", exception);
		}
	}
}
