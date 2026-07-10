package com.seamarg.backend.course;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Enrollment lifecycle (docs/courses-design.md §6): a seafarer requests a seat
 * ({@code PENDING}); an admin confirms (consuming a seat under a capacity
 * condition) or rejects. Seats change only at admin decision time, so the
 * public/customer path never mutates capacity.
 */
@Service
class EnrollmentService {

	private final CourseRepository repository;
	private final CourseService courseService;
	private final ObjectMapper objectMapper;

	EnrollmentService(CourseRepository repository, CourseService courseService, ObjectMapper objectMapper) {
		this.repository = repository;
		this.courseService = courseService;
		this.objectMapper = objectMapper;
	}

	// ---------------------------------------------------------------- customer

	Map<String, Object> request(String sub, String instituteId, String typeSlug, String batchId) {
		if (!StringUtils.hasText(instituteId) || !StringUtils.hasText(typeSlug) || !StringUtils.hasText(batchId)) {
			throw new IllegalArgumentException("instituteId, typeSlug and batchId are required.");
		}
		var batch = courseService.locateBatch(instituteId, typeSlug, batchId)
			.orElseThrow(() -> new IllegalArgumentException("Batch not found."));
		if (!"OPEN".equalsIgnoreCase(batch.status())) {
			throw new IllegalArgumentException("This batch is not open for enrollment.");
		}
		var start = tryDate(batch.startDate());
		if (start != null && start.isBefore(LocalDate.now())) {
			throw new IllegalArgumentException("This batch has already started.");
		}

		var existing = repository.get(CourseKeys.userPk(sub), CourseKeys.enrollmentSk(batchId));
		if (existing.isPresent()) {
			var current = parse(existing.get().payloadJson());
			if (EnrollmentStatus.fromName(String.valueOf(current.get("status")))
					.map(EnrollmentStatus::isActive).orElse(false)) {
				throw new IllegalArgumentException("You already have an active enrollment for this batch.");
			}
		}

		var createdAt = Instant.now().toString();
		var view = new LinkedHashMap<String, Object>();
		view.put("sub", sub);
		view.put("batchId", batchId);
		view.put("instituteId", instituteId);
		view.put("instituteName", batch.instituteName());
		view.put("typeSlug", typeSlug);
		view.put("courseName", batch.courseName());
		view.put("startDate", batch.startDate());
		view.put("status", EnrollmentStatus.PENDING.name());
		view.put("createdAt", createdAt);
		view.put("decidedAt", null);
		view.put("decidedBy", null);
		view.put("note", null);

		repository.put(CourseItem.builder(CourseKeys.userPk(sub), CourseKeys.enrollmentSk(batchId))
			.index(CourseKeys.batchIndexPk(batchId), CourseKeys.enrollmentIndexSk(createdAt, sub))
			.entityType("ENROLLMENT")
			.payload(write(view))
			.build());
		return view;
	}

	List<Map<String, Object>> listForUser(String sub) {
		var results = new ArrayList<Map<String, Object>>();
		for (var item : repository.queryPartitionPrefix(CourseKeys.userPk(sub), CourseKeys.ENROLLMENT_SK_PREFIX)) {
			results.add(parse(item.payloadJson()));
		}
		results.sort(Comparator.comparing((Map<String, Object> v) -> string(v, "createdAt")).reversed());
		return results;
	}

	Map<String, Object> cancel(String sub, String batchId) {
		var item = repository.get(CourseKeys.userPk(sub), CourseKeys.enrollmentSk(batchId))
			.orElseThrow(() -> new IllegalArgumentException("Enrollment not found."));
		var view = parse(item.payloadJson());
		var status = EnrollmentStatus.fromName(string(view, "status")).orElse(EnrollmentStatus.PENDING);
		if (status == EnrollmentStatus.CANCELLED || status == EnrollmentStatus.REJECTED) {
			return view; // already inactive
		}
		return transition(view, EnrollmentStatus.CANCELLED, "self", status == EnrollmentStatus.CONFIRMED);
	}

	// ---------------------------------------------------------------- admin

	/** Enrollment counts by status across the platform, for the admin dashboard. */
	Map<String, Long> statusCounts() {
		long pending = 0;
		long confirmed = 0;
		long rejected = 0;
		long cancelled = 0;
		long total = 0;
		for (var item : repository.scanByEntityType("ENROLLMENT")) {
			var status = EnrollmentStatus.fromName(string(parse(item.payloadJson()), "status")).orElse(null);
			total++;
			if (status == EnrollmentStatus.PENDING) {
				pending++;
			} else if (status == EnrollmentStatus.CONFIRMED) {
				confirmed++;
			} else if (status == EnrollmentStatus.REJECTED) {
				rejected++;
			} else if (status == EnrollmentStatus.CANCELLED) {
				cancelled++;
			}
		}
		var counts = new LinkedHashMap<String, Long>();
		counts.put("pending", pending);
		counts.put("confirmed", confirmed);
		counts.put("rejected", rejected);
		counts.put("cancelled", cancelled);
		counts.put("total", total);
		return counts;
	}

	/** Every enrollment across the platform, newest first, optionally filtered by status. */
	List<Map<String, Object>> listAll(String statusFilter) {
		var results = new ArrayList<Map<String, Object>>();
		for (var item : repository.scanByEntityType("ENROLLMENT")) {
			var view = parse(item.payloadJson());
			if (StringUtils.hasText(statusFilter) && !statusFilter.equalsIgnoreCase(string(view, "status"))) {
				continue;
			}
			results.add(view);
		}
		results.sort(Comparator.comparing((Map<String, Object> v) -> string(v, "createdAt")).reversed());
		return results;
	}

	List<Map<String, Object>> listForBatch(String batchId) {
		var results = new ArrayList<Map<String, Object>>();
		for (var item : repository.queryIndex(CourseKeys.batchIndexPk(batchId))) {
			results.add(parse(item.payloadJson()));
		}
		results.sort(Comparator.comparing(v -> string(v, "createdAt")));
		return results;
	}

	Map<String, Object> approve(String sub, String batchId, String note) {
		var item = repository.get(CourseKeys.userPk(sub), CourseKeys.enrollmentSk(batchId))
			.orElseThrow(() -> new IllegalArgumentException("Enrollment not found."));
		var view = parse(item.payloadJson());
		var status = EnrollmentStatus.fromName(string(view, "status")).orElse(EnrollmentStatus.PENDING);
		if (status == EnrollmentStatus.CONFIRMED) {
			return view;
		}
		if (status != EnrollmentStatus.PENDING) {
			throw new IllegalArgumentException("Only pending enrollments can be approved.");
		}
		var batch = courseService.locateBatch(string(view, "instituteId"), string(view, "typeSlug"), batchId)
			.orElseThrow(() -> new IllegalArgumentException("Batch not found."));

		view.put("status", EnrollmentStatus.CONFIRMED.name());
		view.put("decidedAt", Instant.now().toString());
		view.put("decidedBy", "admin");
		if (StringUtils.hasText(note)) {
			view.put("note", note);
		}
		var confirmed = repository.confirmEnrollmentAndReserveSeat(
			batch.batchPk(), batch.batchSk(), CourseKeys.userPk(sub), CourseKeys.enrollmentSk(batchId),
			write(view));
		if (!confirmed) {
			throw new IllegalArgumentException("This batch is full; no seats remain to confirm.");
		}
		return view;
	}

	Map<String, Object> reject(String sub, String batchId, String note) {
		var item = repository.get(CourseKeys.userPk(sub), CourseKeys.enrollmentSk(batchId))
			.orElseThrow(() -> new IllegalArgumentException("Enrollment not found."));
		var view = parse(item.payloadJson());
		var status = EnrollmentStatus.fromName(string(view, "status")).orElse(EnrollmentStatus.PENDING);
		if (status == EnrollmentStatus.REJECTED) {
			return view;
		}
		return transition(view, EnrollmentStatus.REJECTED, "admin", status == EnrollmentStatus.CONFIRMED);
	}

	private Map<String, Object> transition(Map<String, Object> view, EnrollmentStatus target, String by,
			boolean releaseSeat) {
		var sub = string(view, "sub");
		var batchId = string(view, "batchId");
		view.put("status", target.name());
		view.put("decidedAt", Instant.now().toString());
		view.put("decidedBy", by);
		String batchPk = null;
		String batchSk = null;
		if (releaseSeat) {
			var locator = courseService.locateBatch(string(view, "instituteId"), string(view, "typeSlug"), batchId);
			if (locator.isPresent()) {
				batchPk = locator.get().batchPk();
				batchSk = locator.get().batchSk();
			} else {
				releaseSeat = false; // batch gone; nothing to release
			}
		}
		repository.updateEnrollmentAndReleaseSeat(batchPk, batchSk,
			CourseKeys.userPk(sub), CourseKeys.enrollmentSk(batchId), write(view), releaseSeat);
		return view;
	}

	private static LocalDate tryDate(String text) {
		if (text == null || text.isBlank()) {
			return null;
		}
		try {
			return LocalDate.parse(text.trim());
		} catch (RuntimeException exception) {
			return null;
		}
	}

	private Map<String, Object> parse(String payloadJson) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return new LinkedHashMap<>();
		}
		try {
			return objectMapper.readValue(payloadJson, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (JsonProcessingException exception) {
			throw new IllegalStateException("Stored enrollment could not be read.", exception);
		}
	}

	private String write(Map<String, Object> view) {
		try {
			return objectMapper.writeValueAsString(view);
		} catch (JsonProcessingException exception) {
			throw new IllegalArgumentException("Enrollment could not be serialized.", exception);
		}
	}

	private static String string(Map<String, Object> view, String key) {
		var value = view.get(key);
		return value == null ? "" : String.valueOf(value);
	}
}
