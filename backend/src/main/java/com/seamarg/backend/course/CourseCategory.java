package com.seamarg.backend.course;

import java.util.Optional;

/**
 * Canonical grouping for course types (docs/courses-design.md §4). The enum
 * name is stored inside the course-type payload; the slug is the URL/JSON form
 * used by the clients. Categories mirror the source spreadsheet's own grouping
 * (pre-sea, STCW modular, competency, refresher, tanker, simulator).
 */
enum CourseCategory {

	PRE_SEA("pre-sea", "Pre-Sea"),
	STCW_MODULAR("stcw-modular", "STCW Modular"),
	COMPETENCY("competency", "Competency"),
	REFRESHER("refresher", "Refresher"),
	TANKER("tanker", "Tanker"),
	SIMULATOR("simulator", "Simulator"),
	OTHER("other", "Other");

	private final String slug;
	private final String label;

	CourseCategory(String slug, String label) {
		this.slug = slug;
		this.label = label;
	}

	String slug() {
		return slug;
	}

	String label() {
		return label;
	}

	static Optional<CourseCategory> fromSlug(String slug) {
		if (slug == null) {
			return Optional.empty();
		}
		for (var category : values()) {
			if (category.slug.equalsIgnoreCase(slug)) {
				return Optional.of(category);
			}
		}
		return Optional.empty();
	}

	static Optional<CourseCategory> fromName(String name) {
		if (name == null) {
			return Optional.empty();
		}
		for (var category : values()) {
			if (category.name().equalsIgnoreCase(name)) {
				return Optional.of(category);
			}
		}
		return Optional.empty();
	}
}
