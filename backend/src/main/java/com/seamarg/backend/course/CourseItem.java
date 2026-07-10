package com.seamarg.backend.course;

import java.time.Instant;
import java.util.Map;

/**
 * One row on the shared table for a Courses entity. Descriptive fields live in
 * {@code payloadJson}; seat counters live in {@code numbers} as top-level
 * numeric attributes so DynamoDB can adjust them atomically with a capacity
 * condition (docs/courses-design.md §6).
 */
record CourseItem(
		String pk,
		String sk,
		String gsi1Pk,
		String gsi1Sk,
		String entityType,
		String payloadJson,
		Map<String, Long> numbers,
		Instant updatedAt) {

	static Builder builder(String pk, String sk) {
		return new Builder(pk, sk);
	}

	long number(String name, long fallback) {
		if (numbers == null) {
			return fallback;
		}
		var value = numbers.get(name);
		return value == null ? fallback : value;
	}

	static final class Builder {

		private final String pk;
		private final String sk;
		private String gsi1Pk;
		private String gsi1Sk;
		private String entityType;
		private String payloadJson;
		private Map<String, Long> numbers = Map.of();
		private Instant updatedAt;

		private Builder(String pk, String sk) {
			this.pk = pk;
			this.sk = sk;
		}

		Builder index(String gsi1Pk, String gsi1Sk) {
			this.gsi1Pk = gsi1Pk;
			this.gsi1Sk = gsi1Sk;
			return this;
		}

		Builder entityType(String entityType) {
			this.entityType = entityType;
			return this;
		}

		Builder payload(String payloadJson) {
			this.payloadJson = payloadJson;
			return this;
		}

		Builder numbers(Map<String, Long> numbers) {
			this.numbers = numbers == null ? Map.of() : numbers;
			return this;
		}

		Builder updatedAt(Instant updatedAt) {
			this.updatedAt = updatedAt;
			return this;
		}

		CourseItem build() {
			return new CourseItem(pk, sk, gsi1Pk, gsi1Sk, entityType, payloadJson, numbers, updatedAt);
		}
	}
}
