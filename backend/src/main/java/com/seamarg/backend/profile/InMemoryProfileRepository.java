package com.seamarg.backend.profile;

import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Fallback used when no DynamoDB table is configured (local/dev without AWS).
 */
class InMemoryProfileRepository implements ProfileRepository {

	private final ConcurrentHashMap<String, ProfileSectionRecord> records = new ConcurrentHashMap<>();

	@Override
	public List<ProfileSectionRecord> findByUserId(String userId) {
		return records.values()
			.stream()
			.filter(record -> record.userId().equals(userId))
			.toList();
	}

	@Override
	public ProfileSectionRecord save(ProfileSectionRecord record) {
		records.put(key(record.userId(), record.section()), record);
		return record;
	}

	@Override
	public List<ProfileSectionRecord> findAll() {
		return List.copyOf(records.values());
	}

	private static String key(String userId, ProfileSection section) {
		return userId + "::" + section.name();
	}
}
