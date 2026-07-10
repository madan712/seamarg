package com.seamarg.backend.course;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Admin management for the Courses catalog and enrollment queue
 * (docs/courses-design.md §5.3). Gated by {@code X-Admin-Password}
 * ({@code /api/admin/**}); web-only.
 */
@RestController
@RequestMapping("/api/admin/courses")
class CourseAdminController {

	private final CourseService courseService;
	private final EnrollmentService enrollmentService;
	private final CourseImportService courseImportService;

	CourseAdminController(CourseService courseService, EnrollmentService enrollmentService,
			CourseImportService courseImportService) {
		this.courseService = courseService;
		this.enrollmentService = enrollmentService;
		this.courseImportService = courseImportService;
	}

	// ----------------------------------------------------- course types

	@GetMapping("/course-types")
	List<Map<String, Object>> courseTypes() {
		return courseService.listCourseTypes(true);
	}

	@PostMapping("/course-types")
	Map<String, Object> createCourseType(@RequestBody Map<String, Object> body) {
		return courseService.saveCourseType(string(body, "slug"), body);
	}

	@PutMapping("/course-types/{slug}")
	Map<String, Object> updateCourseType(@PathVariable String slug, @RequestBody Map<String, Object> body) {
		return courseService.saveCourseType(slug, body);
	}

	@DeleteMapping("/course-types/{slug}")
	ResponseEntity<Void> deleteCourseType(@PathVariable String slug) {
		courseService.deleteCourseType(slug);
		return ResponseEntity.noContent().build();
	}

	// ----------------------------------------------------- institutes

	@GetMapping("/institutes")
	List<Map<String, Object>> institutes(
			@RequestParam(required = false) String q,
			@RequestParam(required = false) String state,
			@RequestParam(required = false) String city) {
		return courseService.listInstitutes(q, state, city, true);
	}

	@GetMapping("/institutes/{instituteId}")
	ResponseEntity<Map<String, Object>> institute(@PathVariable String instituteId) {
		return ResponseEntity.of(courseService.getInstitute(instituteId, false));
	}

	@PostMapping("/institutes")
	Map<String, Object> createInstitute(@RequestBody Map<String, Object> body) {
		return courseService.saveInstitute(string(body, "id"), body);
	}

	@PutMapping("/institutes/{instituteId}")
	Map<String, Object> updateInstitute(@PathVariable String instituteId, @RequestBody Map<String, Object> body) {
		return courseService.saveInstitute(instituteId, body);
	}

	@PostMapping("/institutes/{instituteId}/active")
	Map<String, Object> setInstituteActive(@PathVariable String instituteId, @RequestBody Map<String, Object> body) {
		courseService.setInstituteActive(instituteId, truthy(body.get("active")));
		return courseService.getInstitute(instituteId, false).orElseThrow();
	}

	@DeleteMapping("/institutes/{instituteId}")
	ResponseEntity<Void> deleteInstitute(@PathVariable String instituteId) {
		courseService.deleteInstitute(instituteId);
		return ResponseEntity.noContent().build();
	}

	// ----------------------------------------------------- offerings

	@PutMapping("/institutes/{instituteId}/offerings/{typeSlug}")
	Map<String, Object> saveOffering(@PathVariable String instituteId, @PathVariable String typeSlug,
			@RequestBody(required = false) Map<String, Object> body) {
		return courseService.saveOffering(instituteId, typeSlug, body);
	}

	@DeleteMapping("/institutes/{instituteId}/offerings/{typeSlug}")
	ResponseEntity<Void> deleteOffering(@PathVariable String instituteId, @PathVariable String typeSlug) {
		courseService.deleteOffering(instituteId, typeSlug);
		return ResponseEntity.noContent().build();
	}

	// ----------------------------------------------------- batches

	@PostMapping("/institutes/{instituteId}/batches")
	Map<String, Object> createBatch(@PathVariable String instituteId, @RequestBody Map<String, Object> body) {
		return courseService.saveBatch(instituteId, string(body, "typeSlug"), string(body, "batchId"), body);
	}

	@PutMapping("/institutes/{instituteId}/batches/{typeSlug}/{batchId}")
	Map<String, Object> updateBatch(@PathVariable String instituteId, @PathVariable String typeSlug,
			@PathVariable String batchId, @RequestBody Map<String, Object> body) {
		return courseService.saveBatch(instituteId, typeSlug, batchId, body);
	}

	@DeleteMapping("/institutes/{instituteId}/batches/{typeSlug}/{batchId}")
	ResponseEntity<Void> deleteBatch(@PathVariable String instituteId, @PathVariable String typeSlug,
			@PathVariable String batchId) {
		courseService.deleteBatch(instituteId, typeSlug, batchId);
		return ResponseEntity.noContent().build();
	}

	// ----------------------------------------------------- enrollment queue

	@GetMapping("/enrollments/stats")
	Map<String, Long> enrollmentStats() {
		return enrollmentService.statusCounts();
	}

	@GetMapping("/enrollments")
	List<Map<String, Object>> allEnrollments(@RequestParam(required = false) String status) {
		return enrollmentService.listAll(status);
	}

	@GetMapping("/batches/{batchId}/enrollments")
	List<Map<String, Object>> batchEnrollments(@PathVariable String batchId) {
		return enrollmentService.listForBatch(batchId);
	}

	@PostMapping("/enrollments/{sub}/{batchId}/approve")
	Map<String, Object> approve(@PathVariable String sub, @PathVariable String batchId,
			@RequestBody(required = false) Map<String, Object> body) {
		return enrollmentService.approve(sub, batchId, body == null ? null : string(body, "note"));
	}

	@PostMapping("/enrollments/{sub}/{batchId}/reject")
	Map<String, Object> reject(@PathVariable String sub, @PathVariable String batchId,
			@RequestBody(required = false) Map<String, Object> body) {
		return enrollmentService.reject(sub, batchId, body == null ? null : string(body, "note"));
	}

	// ----------------------------------------------------- one-time import

	@PostMapping("/import/institutes")
	CourseImportService.ImportSummary importInstitutes(
			@RequestParam(name = "seedBatches", defaultValue = "true") boolean seedBatches) {
		return courseImportService.importSeed(seedBatches);
	}

	private static String string(Map<String, Object> data, String key) {
		var value = data == null ? null : data.get(key);
		return value == null ? null : String.valueOf(value);
	}

	private static boolean truthy(Object value) {
		if (value instanceof Boolean bool) {
			return bool;
		}
		return value != null && Boolean.parseBoolean(String.valueOf(value));
	}
}
