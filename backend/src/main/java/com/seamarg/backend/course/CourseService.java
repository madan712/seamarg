package com.seamarg.backend.course;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

/**
 * Core Courses catalog service: course types, institutes, per-institute
 * offerings, and scheduled batches, plus the course + date-range batch search
 * (docs/courses-design.md §3–§5). Used by both the public discovery controller
 * and the admin CRUD controller; seat integrity lives in {@link EnrollmentService}.
 */
@Service
class CourseService {

	private final CourseRepository repository;
	private final ObjectMapper objectMapper;

	CourseService(CourseRepository repository, ObjectMapper objectMapper) {
		this.repository = repository;
		this.objectMapper = objectMapper;
	}

	// ---------------------------------------------------------------- course types

	List<Map<String, Object>> listCourseTypes(boolean includeInactive) {
		var results = new ArrayList<Map<String, Object>>();
		for (var item : repository.queryPartition(CourseKeys.CATALOG_PK)) {
			if (!item.sk().startsWith(CourseKeys.TYPE_SK_PREFIX)) {
				continue;
			}
			var view = parse(item.payloadJson());
			if (includeInactive || isActive(view)) {
				results.add(view);
			}
		}
		results.sort(Comparator.comparing(v -> string(v, "name").toLowerCase(Locale.ROOT)));
		return results;
	}

	/** Public catalog: active course types grouped by category slug. */
	Map<String, Object> catalogGroupedByCategory() {
		var grouped = new LinkedHashMap<String, List<Map<String, Object>>>();
		for (var category : CourseCategory.values()) {
			grouped.put(category.slug(), new ArrayList<>());
		}
		for (var type : listCourseTypes(false)) {
			var category = CourseCategory.fromName(string(type, "category")).orElse(CourseCategory.OTHER);
			grouped.get(category.slug()).add(type);
		}
		var categories = new ArrayList<Map<String, Object>>();
		for (var category : CourseCategory.values()) {
			var types = grouped.get(category.slug());
			if (types.isEmpty()) {
				continue;
			}
			categories.add(new LinkedHashMap<>(Map.of(
				"slug", category.slug(),
				"label", category.label(),
				"courseTypes", types)));
		}
		return new LinkedHashMap<>(Map.of("categories", categories));
	}

	Map<String, Object> saveCourseType(String slugOrNull, Map<String, Object> fields) {
		var name = requireText(fields, "name", "Course name");
		var slug = StringUtils.hasText(slugOrNull) ? slugOrNull : CourseKeys.slugify(name);
		if (!StringUtils.hasText(slug)) {
			throw new IllegalArgumentException("Course type slug could not be derived.");
		}
		var category = CourseCategory.fromSlug(string(fields, "category"))
			.or(() -> CourseCategory.fromName(string(fields, "category")))
			.orElse(CourseCategory.OTHER);
		var view = new LinkedHashMap<String, Object>();
		view.put("slug", slug);
		view.put("name", name);
		view.put("category", category.name());
		view.put("description", string(fields, "description"));
		view.put("active", fields.containsKey("active") ? truthy(fields.get("active")) : true);
		repository.put(CourseItem.builder(CourseKeys.CATALOG_PK, CourseKeys.courseTypeSk(slug))
			.entityType("COURSE_TYPE")
			.payload(write(view))
			.build());
		return view;
	}

	void deleteCourseType(String slug) {
		repository.delete(CourseKeys.CATALOG_PK, CourseKeys.courseTypeSk(slug));
	}

	Optional<Map<String, Object>> findCourseType(String slug) {
		return repository.get(CourseKeys.CATALOG_PK, CourseKeys.courseTypeSk(slug))
			.map(item -> parse(item.payloadJson()));
	}

	// ---------------------------------------------------------------- institutes

	List<Map<String, Object>> listInstitutes(String q, String state, String city, boolean includeInactive) {
		var results = new ArrayList<Map<String, Object>>();
		for (var item : repository.queryIndex(CourseKeys.INSTITUTE_INDEX_PK)) {
			var view = parse(item.payloadJson());
			if (!includeInactive && !isActive(view)) {
				continue;
			}
			if (StringUtils.hasText(q) && !containsIgnoreCase(string(view, "name"), q)
					&& !containsIgnoreCase(string(view, "city"), q)
					&& !containsIgnoreCase(string(view, "state"), q)) {
				continue;
			}
			if (StringUtils.hasText(state) && !string(view, "state").equalsIgnoreCase(state)) {
				continue;
			}
			if (StringUtils.hasText(city) && !string(view, "city").equalsIgnoreCase(city)) {
				continue;
			}
			results.add(view);
		}
		results.sort(Comparator
			.comparing((Map<String, Object> v) -> string(v, "state").toLowerCase(Locale.ROOT))
			.thenComparing(v -> string(v, "name").toLowerCase(Locale.ROOT)));
		return results;
	}

	/** Institute detail: meta + offerings (with course names) + batches (with seats). */
	Optional<Map<String, Object>> getInstitute(String instituteId, boolean publicView) {
		var partition = repository.queryPartition(CourseKeys.institutePk(instituteId));
		Map<String, Object> meta = null;
		var offerings = new ArrayList<Map<String, Object>>();
		var batches = new ArrayList<Map<String, Object>>();
		for (var item : partition) {
			if (CourseKeys.INSTITUTE_META_SK.equals(item.sk())) {
				meta = parse(item.payloadJson());
			} else if (item.sk().startsWith(CourseKeys.OFFERING_SK_PREFIX)) {
				offerings.add(parse(item.payloadJson()));
			} else if (item.sk().startsWith(CourseKeys.BATCH_SK_PREFIX)) {
				batches.add(batchView(item));
			}
		}
		if (meta == null) {
			return Optional.empty();
		}
		if (publicView && !isActive(meta)) {
			return Optional.empty();
		}
		var visibleBatches = publicView ? onlyBookable(batches) : batches;
		visibleBatches.sort(Comparator.comparing(b -> string(b, "startDate")));
		var detail = new LinkedHashMap<String, Object>(meta);
		detail.put("offerings", offerings);
		detail.put("batches", visibleBatches);
		return Optional.of(detail);
	}

	Map<String, Object> saveInstitute(String idOrNull, Map<String, Object> fields) {
		var name = requireText(fields, "name", "Institute name");
		var id = StringUtils.hasText(idOrNull) ? idOrNull
			: StringUtils.hasText(string(fields, "id")) ? string(fields, "id")
			: CourseKeys.slugify(name);
		if (!StringUtils.hasText(id)) {
			throw new IllegalArgumentException("Institute id could not be derived.");
		}
		var view = new LinkedHashMap<String, Object>();
		view.put("id", id);
		view.put("name", name);
		view.put("dgsCode", string(fields, "dgsCode"));
		view.put("approvalStatus", string(fields, "approvalStatus"));
		view.put("city", string(fields, "city"));
		view.put("state", string(fields, "state"));
		view.put("website", string(fields, "website"));
		view.put("notes", string(fields, "notes"));
		view.put("active", fields.containsKey("active") ? truthy(fields.get("active")) : true);
		repository.put(CourseItem.builder(CourseKeys.institutePk(id), CourseKeys.INSTITUTE_META_SK)
			.index(CourseKeys.INSTITUTE_INDEX_PK, CourseKeys.instituteIndexSk(string(view, "state"), name))
			.entityType("INSTITUTE")
			.payload(write(view))
			.build());
		return view;
	}

	void setInstituteActive(String instituteId, boolean active) {
		var meta = repository.get(CourseKeys.institutePk(instituteId), CourseKeys.INSTITUTE_META_SK)
			.orElseThrow(() -> new IllegalArgumentException("Unknown institute: " + instituteId));
		var view = parse(meta.payloadJson());
		view.put("active", active);
		repository.put(CourseItem.builder(meta.pk(), meta.sk())
			.index(CourseKeys.INSTITUTE_INDEX_PK,
				CourseKeys.instituteIndexSk(string(view, "state"), string(view, "name")))
			.entityType("INSTITUTE")
			.payload(write(view))
			.build());
	}

	void deleteInstitute(String instituteId) {
		for (var item : repository.queryPartition(CourseKeys.institutePk(instituteId))) {
			repository.delete(item.pk(), item.sk());
		}
	}

	// ---------------------------------------------------------------- offerings

	Map<String, Object> saveOffering(String instituteId, String typeSlug, Map<String, Object> fields) {
		var institute = requireInstitute(instituteId);
		var courseType = findCourseType(typeSlug)
			.orElseThrow(() -> new IllegalArgumentException("Unknown course type: " + typeSlug));
		var data = fields == null ? Map.<String, Object>of() : fields;
		var view = new LinkedHashMap<String, Object>();
		view.put("instituteId", instituteId);
		view.put("instituteName", string(institute, "name"));
		view.put("state", string(institute, "state"));
		view.put("typeSlug", typeSlug);
		view.put("courseName", string(courseType, "name"));
		view.put("category", string(courseType, "category"));
		view.put("displayName", string(data, "displayName"));
		view.put("fees", string(data, "fees"));
		view.put("durationText", string(data, "durationText"));
		view.put("active", data.containsKey("active") ? truthy(data.get("active")) : true);
		repository.put(CourseItem.builder(CourseKeys.institutePk(instituteId), CourseKeys.offeringSk(typeSlug))
			.index(CourseKeys.courseTypeIndexPk(typeSlug), CourseKeys.offeringIndexSk(instituteId))
			.entityType("OFFERING")
			.payload(write(view))
			.build());
		return view;
	}

	void deleteOffering(String instituteId, String typeSlug) {
		repository.delete(CourseKeys.institutePk(instituteId), CourseKeys.offeringSk(typeSlug));
		// Cascade: drop the offering's batches too.
		for (var item : repository.queryPartitionPrefix(CourseKeys.institutePk(instituteId),
				CourseKeys.BATCH_SK_PREFIX + typeSlug + "#")) {
			repository.delete(item.pk(), item.sk());
		}
	}

	// ---------------------------------------------------------------- batches

	Map<String, Object> saveBatch(String instituteId, String typeSlug, String batchIdOrNull,
			Map<String, Object> fields) {
		var institute = requireInstitute(instituteId);
		var courseType = findCourseType(typeSlug)
			.orElseThrow(() -> new IllegalArgumentException("Unknown course type: " + typeSlug));
		var data = fields == null ? Map.<String, Object>of() : fields;
		var startDate = requireDate(data, "startDate", "Batch start date");
		var endDateText = string(data, "endDate");
		if (StringUtils.hasText(endDateText)) {
			parseDate(endDateText, "Batch end date");
		}
		var totalSeats = requirePositiveInt(data, "totalSeats", "Total seats");
		var batchId = StringUtils.hasText(batchIdOrNull) ? batchIdOrNull : UUID.randomUUID().toString();

		var existing = repository.get(CourseKeys.institutePk(instituteId),
			CourseKeys.batchSk(typeSlug, batchId));
		var confirmedSeats = existing.map(item -> item.number("confirmedSeats", 0)).orElse(0L);
		if (confirmedSeats > totalSeats) {
			throw new IllegalArgumentException(
				"Total seats cannot be lower than the " + confirmedSeats + " already confirmed.");
		}

		var view = new LinkedHashMap<String, Object>();
		view.put("batchId", batchId);
		view.put("instituteId", instituteId);
		view.put("instituteName", string(institute, "name"));
		view.put("state", string(institute, "state"));
		view.put("typeSlug", typeSlug);
		view.put("courseName", string(courseType, "name"));
		view.put("startDate", startDate.toString());
		view.put("endDate", endDateText);
		view.put("status", statusOrDefault(string(data, "status")));
		view.put("mode", StringUtils.hasText(string(data, "mode")) ? string(data, "mode") : "ONSITE");
		view.put("fees", string(data, "fees"));
		view.put("notes", string(data, "notes"));

		repository.put(CourseItem.builder(CourseKeys.institutePk(instituteId),
				CourseKeys.batchSk(typeSlug, batchId))
			.index(CourseKeys.courseTypeIndexPk(typeSlug),
				CourseKeys.batchIndexSk(startDate.toString(), instituteId, batchId))
			.entityType("BATCH")
			.payload(write(view))
			.numbers(Map.of("totalSeats", totalSeats, "confirmedSeats", confirmedSeats))
			.build());

		view.put("totalSeats", totalSeats);
		view.put("confirmedSeats", confirmedSeats);
		view.put("availableSeats", Math.max(0, totalSeats - confirmedSeats));
		return view;
	}

	void deleteBatch(String instituteId, String typeSlug, String batchId) {
		repository.delete(CourseKeys.institutePk(instituteId), CourseKeys.batchSk(typeSlug, batchId));
	}

	/** Primary public search: batches of a course type within an optional date range. */
	List<Map<String, Object>> searchBatches(String typeSlug, String from, String to, String state,
			boolean openOnly) {
		var fromDate = StringUtils.hasText(from) ? parseDate(from, "From date") : null;
		var toDate = StringUtils.hasText(to) ? parseDate(to, "To date") : null;
		var results = new ArrayList<Map<String, Object>>();
		for (var item : repository.queryIndex(CourseKeys.courseTypeIndexPk(typeSlug))) {
			if (!item.sk().startsWith(CourseKeys.BATCH_SK_PREFIX)) {
				continue;
			}
			var view = batchView(item);
			var start = tryDate(string(view, "startDate"));
			if (start == null) {
				continue;
			}
			if (fromDate != null && start.isBefore(fromDate)) {
				continue;
			}
			if (toDate != null && start.isAfter(toDate)) {
				continue;
			}
			if (StringUtils.hasText(state) && !string(view, "state").equalsIgnoreCase(state)) {
				continue;
			}
			if (openOnly && !isBookable(view)) {
				continue;
			}
			results.add(view);
		}
		results.sort(Comparator.comparing(b -> string(b, "startDate")));
		return results;
	}

	/** Course-type detail for the public course page: institutes offering it + bookable batches. */
	Optional<Map<String, Object>> getCourse(String typeSlug, boolean publicView) {
		var courseType = findCourseType(typeSlug);
		if (courseType.isEmpty() || (publicView && !isActive(courseType.get()))) {
			return Optional.empty();
		}
		var offerings = new ArrayList<Map<String, Object>>();
		var batches = new ArrayList<Map<String, Object>>();
		for (var item : repository.queryIndex(CourseKeys.courseTypeIndexPk(typeSlug))) {
			if (item.sk().startsWith(CourseKeys.OFFERING_SK_PREFIX)) {
				offerings.add(parse(item.payloadJson()));
			} else if (item.sk().startsWith(CourseKeys.BATCH_SK_PREFIX)) {
				batches.add(batchView(item));
			}
		}
		var visibleBatches = publicView ? onlyBookable(batches) : batches;
		visibleBatches.sort(Comparator.comparing(b -> string(b, "startDate")));
		var detail = new LinkedHashMap<String, Object>(courseType.get());
		detail.put("offerings", offerings);
		detail.put("batches", visibleBatches);
		return Optional.of(detail);
	}

	/** Locates a batch for the enrollment flow (keys + snapshot + live seat counts). */
	Optional<BatchLocator> locateBatch(String instituteId, String typeSlug, String batchId) {
		return repository.get(CourseKeys.institutePk(instituteId), CourseKeys.batchSk(typeSlug, batchId))
			.map(item -> {
				var view = batchView(item);
				return new BatchLocator(item.pk(), item.sk(), batchId, instituteId, typeSlug,
					string(view, "instituteName"), string(view, "courseName"), string(view, "startDate"),
					string(view, "status"), item.number("totalSeats", 0), item.number("confirmedSeats", 0));
			});
	}

	// ---------------------------------------------------------------- helpers

	private Map<String, Object> requireInstitute(String instituteId) {
		return repository.get(CourseKeys.institutePk(instituteId), CourseKeys.INSTITUTE_META_SK)
			.map(item -> parse(item.payloadJson()))
			.orElseThrow(() -> new IllegalArgumentException("Unknown institute: " + instituteId));
	}

	private Map<String, Object> batchView(CourseItem item) {
		var view = parse(item.payloadJson());
		var total = item.number("totalSeats", 0);
		var confirmed = item.number("confirmedSeats", 0);
		view.put("totalSeats", total);
		view.put("confirmedSeats", confirmed);
		view.put("availableSeats", Math.max(0, total - confirmed));
		return view;
	}

	private List<Map<String, Object>> onlyBookable(List<Map<String, Object>> batches) {
		var visible = new ArrayList<Map<String, Object>>();
		for (var batch : batches) {
			if (isBookable(batch)) {
				visible.add(batch);
			}
		}
		return visible;
	}

	static boolean isBookable(Map<String, Object> batch) {
		if (!"OPEN".equalsIgnoreCase(String.valueOf(batch.get("status")))) {
			return false;
		}
		var available = batch.get("availableSeats");
		if (available instanceof Number number && number.longValue() <= 0) {
			return false;
		}
		var start = tryDate(String.valueOf(batch.get("startDate")));
		return start == null || !start.isBefore(LocalDate.now());
	}

	private static String statusOrDefault(String status) {
		if (!StringUtils.hasText(status)) {
			return "OPEN";
		}
		var upper = status.toUpperCase(Locale.ROOT);
		if (!upper.equals("OPEN") && !upper.equals("CLOSED") && !upper.equals("CANCELLED")) {
			throw new IllegalArgumentException("Unknown batch status: " + status);
		}
		return upper;
	}

	private Map<String, Object> parse(String payloadJson) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return new LinkedHashMap<>();
		}
		try {
			return objectMapper.readValue(payloadJson, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (JsonProcessingException exception) {
			throw new IllegalStateException("Stored course record could not be read.", exception);
		}
	}

	private String write(Map<String, Object> view) {
		try {
			return objectMapper.writeValueAsString(view);
		} catch (JsonProcessingException exception) {
			throw new IllegalArgumentException("Course record could not be serialized.", exception);
		}
	}

	private static boolean isActive(Map<String, Object> view) {
		var value = view.get("active");
		return value == null || truthy(value);
	}

	private static boolean truthy(Object value) {
		if (value instanceof Boolean bool) {
			return bool;
		}
		return value != null && Boolean.parseBoolean(String.valueOf(value));
	}

	private static String string(Map<String, Object> view, String key) {
		var value = view.get(key);
		return value == null ? "" : String.valueOf(value);
	}

	private static boolean containsIgnoreCase(String haystack, String needle) {
		return haystack.toLowerCase(Locale.ROOT).contains(needle.toLowerCase(Locale.ROOT));
	}

	private static String requireText(Map<String, Object> fields, String key, String label) {
		var value = fields == null ? null : fields.get(key);
		if (!(value instanceof String text) || text.isBlank()) {
			throw new IllegalArgumentException(label + " is required.");
		}
		return text.trim();
	}

	private static long requirePositiveInt(Map<String, Object> fields, String key, String label) {
		var value = fields.get(key);
		final long parsed;
		if (value instanceof Number number) {
			parsed = number.longValue();
		} else if (value instanceof String text && StringUtils.hasText(text)) {
			try {
				parsed = Long.parseLong(text.trim());
			} catch (NumberFormatException exception) {
				throw new IllegalArgumentException(label + " must be a whole number.");
			}
		} else {
			throw new IllegalArgumentException(label + " is required.");
		}
		if (parsed <= 0) {
			throw new IllegalArgumentException(label + " must be greater than zero.");
		}
		return parsed;
	}

	private static LocalDate requireDate(Map<String, Object> fields, String key, String label) {
		var value = fields.get(key);
		if (!(value instanceof String text) || text.isBlank()) {
			throw new IllegalArgumentException(label + " is required.");
		}
		return parseDate(text, label);
	}

	private static LocalDate parseDate(String text, String label) {
		try {
			return LocalDate.parse(text.trim());
		} catch (DateTimeParseException exception) {
			throw new IllegalArgumentException(label + " is not a valid date (expected YYYY-MM-DD).");
		}
	}

	private static LocalDate tryDate(String text) {
		if (text == null || text.isBlank()) {
			return null;
		}
		try {
			return LocalDate.parse(text.trim());
		} catch (DateTimeParseException exception) {
			return null;
		}
	}

	Instant nowInstant() {
		return Instant.now();
	}

	/** Batch coordinates + live seat counts handed to {@link EnrollmentService}. */
	record BatchLocator(String batchPk, String batchSk, String batchId, String instituteId, String typeSlug,
			String instituteName, String courseName, String startDate, String status,
			long totalSeats, long confirmedSeats) {

		long availableSeats() {
			return Math.max(0, totalSeats - confirmedSeats);
		}
	}
}
