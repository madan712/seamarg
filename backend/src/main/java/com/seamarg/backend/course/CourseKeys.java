package com.seamarg.backend.course;

import java.text.Normalizer;
import java.util.Locale;

/**
 * Single source of truth for the Courses key scheme on the shared table
 * (docs/courses-design.md §3). Catalog entities live under dedicated
 * {@code pk} namespaces (not {@code USER#}); enrollments stay per-user.
 *
 * <pre>
 * Course type   pk=CATALOG#COURSETYPE       sk=TYPE#&lt;slug&gt;
 * Institute     pk=INSTITUTE#&lt;instId&gt;       sk=META            gsi1Pk=INSTITUTE            gsi1Sk=&lt;STATE&gt;#&lt;name&gt;
 * Offering      pk=INSTITUTE#&lt;instId&gt;       sk=OFFERING#&lt;slug&gt;  gsi1Pk=COURSETYPE#&lt;slug&gt;    gsi1Sk=OFFERING#&lt;instId&gt;
 * Batch         pk=INSTITUTE#&lt;instId&gt;       sk=BATCH#&lt;slug&gt;#&lt;batchId&gt;  gsi1Pk=COURSETYPE#&lt;slug&gt;  gsi1Sk=BATCH#&lt;startDate&gt;#&lt;instId&gt;#&lt;batchId&gt;
 * Enrollment    pk=USER#&lt;sub&gt;               sk=ENROLLMENT#&lt;batchId&gt;    gsi1Pk=BATCH#&lt;batchId&gt;   gsi1Sk=ENROLLMENT#&lt;createdAt&gt;#&lt;sub&gt;
 * </pre>
 */
final class CourseKeys {

	static final String CATALOG_PK = "CATALOG#COURSETYPE";
	static final String TYPE_SK_PREFIX = "TYPE#";
	static final String INSTITUTE_INDEX_PK = "INSTITUTE";
	static final String INSTITUTE_META_SK = "META";
	static final String OFFERING_SK_PREFIX = "OFFERING#";
	static final String BATCH_SK_PREFIX = "BATCH#";
	static final String ENROLLMENT_SK_PREFIX = "ENROLLMENT#";

	private CourseKeys() {
	}

	static String courseTypeSk(String slug) {
		return TYPE_SK_PREFIX + slug;
	}

	static String institutePk(String instituteId) {
		return "INSTITUTE#" + instituteId;
	}

	static String courseTypeIndexPk(String typeSlug) {
		return "COURSETYPE#" + typeSlug;
	}

	static String offeringSk(String typeSlug) {
		return OFFERING_SK_PREFIX + typeSlug;
	}

	static String offeringIndexSk(String instituteId) {
		return OFFERING_SK_PREFIX + instituteId;
	}

	static String batchSk(String typeSlug, String batchId) {
		return BATCH_SK_PREFIX + typeSlug + "#" + batchId;
	}

	static String batchIndexSk(String startDate, String instituteId, String batchId) {
		return BATCH_SK_PREFIX + startDate + "#" + instituteId + "#" + batchId;
	}

	static String userPk(String sub) {
		return "USER#" + sub;
	}

	static String enrollmentSk(String batchId) {
		return ENROLLMENT_SK_PREFIX + batchId;
	}

	static String batchIndexPk(String batchId) {
		return "BATCH#" + batchId;
	}

	static String enrollmentIndexSk(String createdAtIso, String sub) {
		return ENROLLMENT_SK_PREFIX + createdAtIso + "#" + sub;
	}

	static String instituteIndexSk(String state, String name) {
		return upper(state) + "#" + (name == null ? "" : name);
	}

	/** URL/id-safe slug: lower-case, ASCII, non-alphanumerics collapsed to single hyphens. */
	static String slugify(String value) {
		if (value == null || value.isBlank()) {
			return "";
		}
		var normalized = Normalizer.normalize(value, Normalizer.Form.NFD)
			.replaceAll("\\p{M}", "");
		var slug = normalized.toLowerCase(Locale.ROOT)
			.replaceAll("[^a-z0-9]+", "-")
			.replaceAll("(^-+)|(-+$)", "");
		return slug;
	}

	private static String upper(String value) {
		return value == null ? "" : value.toUpperCase(Locale.ROOT);
	}
}
