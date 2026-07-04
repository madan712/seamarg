package com.seamarg.backend.profile;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
class ProfileService {

	// Required fields per section (mirrors the frontend's required markers).
	private static final Map<ProfileSection, List<RequiredField>> REQUIRED_FIELDS = Map.of(
		ProfileSection.MAIN, List.of(
			new RequiredField("firstName", "First name"),
			new RequiredField("lastName", "Last name"),
			new RequiredField("dateOfBirth", "Date of Birth")));

	private final ProfileRepository profileRepository;
	private final ObjectMapper objectMapper;

	ProfileService(ProfileRepository profileRepository, ObjectMapper objectMapper) {
		this.profileRepository = profileRepository;
		this.objectMapper = objectMapper;
	}

	/**
	 * Returns every saved section for a user, keyed by section slug.
	 */
	Map<String, Object> getProfile(String userId) {
		var profile = new LinkedHashMap<String, Object>();
		for (var record : profileRepository.findByUserId(userId)) {
			profile.put(record.section().slug(), parsePayload(record.payloadJson()));
		}
		return profile;
	}

	/**
	 * Validates and upserts a single section, returning the stored field values.
	 */
	Map<String, Object> saveSection(String userId, ProfileSection section, Map<String, Object> data) {
		var fields = data == null ? Map.<String, Object>of() : data;
		validateRequired(section, fields);

		var record = new ProfileSectionRecord(userId, section, writePayload(fields), Instant.now());
		profileRepository.save(record);
		return fields;
	}

	private void validateRequired(ProfileSection section, Map<String, Object> fields) {
		for (var required : REQUIRED_FIELDS.getOrDefault(section, List.of())) {
			var value = fields.get(required.key());
			if (!(value instanceof String text) || text.isBlank()) {
				throw new IllegalArgumentException(required.label() + " is required.");
			}
		}
	}

	private Map<String, Object> parsePayload(String payloadJson) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return Map.of();
		}
		try {
			return objectMapper.readValue(payloadJson, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (JsonProcessingException exception) {
			throw new IllegalStateException("Stored profile section could not be read.", exception);
		}
	}

	private String writePayload(Map<String, Object> fields) {
		try {
			return objectMapper.writeValueAsString(fields);
		} catch (JsonProcessingException exception) {
			throw new IllegalArgumentException("Profile section could not be serialized.", exception);
		}
	}

	private record RequiredField(String key, String label) {
	}
}
