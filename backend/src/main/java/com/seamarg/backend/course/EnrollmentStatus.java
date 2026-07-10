package com.seamarg.backend.course;

import java.util.Optional;

/**
 * Lifecycle of an enrollment request (docs/courses-design.md §1 D1, §6).
 * A request starts {@code PENDING}; an admin moves it to {@code CONFIRMED}
 * (consuming a seat) or {@code REJECTED}; the seafarer may {@code CANCEL} it.
 */
enum EnrollmentStatus {

	PENDING,
	CONFIRMED,
	REJECTED,
	CANCELLED;

	/** A status that still occupies (or is queued for) a seat. */
	boolean isActive() {
		return this == PENDING || this == CONFIRMED;
	}

	static Optional<EnrollmentStatus> fromName(String name) {
		if (name == null) {
			return Optional.empty();
		}
		for (var status : values()) {
			if (status.name().equalsIgnoreCase(name)) {
				return Optional.of(status);
			}
		}
		return Optional.empty();
	}
}
