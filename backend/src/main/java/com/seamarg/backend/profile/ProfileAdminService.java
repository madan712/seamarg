package com.seamarg.backend.profile;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Read-only, cross-user view over stored profiles for the admin dashboard.
 * Kept in the {@code profile} package so it can reach the package-private
 * repository, but exposes only public types to the admin layer.
 */
@Service
public class ProfileAdminService {

	private final ProfileRepository profileRepository;
	private final ObjectMapper objectMapper;

	ProfileAdminService(ProfileRepository profileRepository, ObjectMapper objectMapper) {
		this.profileRepository = profileRepository;
		this.objectMapper = objectMapper;
	}

	/** Every user that has saved at least one profile section, keyed by Cognito subject. */
	public List<AdminProfileView> listAll() {
		var byUser = new LinkedHashMap<String, AdminProfileView>();
		for (var record : profileRepository.findAll()) {
			if (record.userId() == null) {
				continue;
			}
			var view = byUser.computeIfAbsent(record.userId(),
				userId -> new AdminProfileView(userId, new LinkedHashMap<>(), null));
			view.sections().put(record.section().slug(), parsePayload(record.payloadJson()));
			byUser.put(record.userId(), view.withLatestUpdate(record.updatedAt()));
		}
		return List.copyOf(byUser.values());
	}

	/** All saved sections for a single user (empty map when the user has none). */
	public AdminProfileView getForUser(String userId) {
		var sections = new LinkedHashMap<String, Map<String, Object>>();
		Instant lastUpdated = null;
		for (var record : profileRepository.findByUserId(userId)) {
			sections.put(record.section().slug(), parsePayload(record.payloadJson()));
			lastUpdated = latest(lastUpdated, record.updatedAt());
		}
		return new AdminProfileView(userId, sections, lastUpdated);
	}

	private Map<String, Object> parsePayload(String payloadJson) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return Map.of();
		}
		try {
			return objectMapper.readValue(payloadJson, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (JsonProcessingException exception) {
			return Map.of();
		}
	}

	private static Instant latest(Instant current, Instant candidate) {
		if (candidate == null) {
			return current;
		}
		return current == null || candidate.isAfter(current) ? candidate : current;
	}

	/**
	 * A user's stored profile: section slug &rarr; field values, plus the most
	 * recent update time across those sections.
	 */
	public record AdminProfileView(String userId, Map<String, Map<String, Object>> sections, Instant lastUpdated) {

		AdminProfileView withLatestUpdate(Instant candidate) {
			return new AdminProfileView(userId, sections, latest(lastUpdated, candidate));
		}
	}
}
