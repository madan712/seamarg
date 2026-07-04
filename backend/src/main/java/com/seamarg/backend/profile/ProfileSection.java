package com.seamarg.backend.profile;

import java.util.Optional;

/**
 * The editable seafarer-profile sections (PRD step 1). Each maps to a DynamoDB
 * item under the user partition with sort key {@code PROFILE#<NAME>}.
 */
enum ProfileSection {

	MAIN("main"),
	CONTACT("contact"),
	PASSPORT("passport"),
	ADDRESS("address"),
	LANGUAGES("languages"),
	SKILLS("skills"),
	VISAS("visas"),
	RELATIVES("relatives"),
	MISC("misc");

	private static final String SORT_KEY_PREFIX = "PROFILE#";

	private final String slug;

	ProfileSection(String slug) {
		this.slug = slug;
	}

	String slug() {
		return slug;
	}

	String sortKey() {
		return SORT_KEY_PREFIX + name();
	}

	static String sortKeyPrefix() {
		return SORT_KEY_PREFIX;
	}

	static Optional<ProfileSection> fromSlug(String slug) {
		if (slug == null) {
			return Optional.empty();
		}
		for (var section : values()) {
			if (section.slug.equalsIgnoreCase(slug)) {
				return Optional.of(section);
			}
		}
		return Optional.empty();
	}

	static Optional<ProfileSection> fromSortKey(String sortKey) {
		if (sortKey == null || !sortKey.startsWith(SORT_KEY_PREFIX)) {
			return Optional.empty();
		}
		try {
			return Optional.of(ProfileSection.valueOf(sortKey.substring(SORT_KEY_PREFIX.length())));
		} catch (IllegalArgumentException exception) {
			return Optional.empty();
		}
	}
}
