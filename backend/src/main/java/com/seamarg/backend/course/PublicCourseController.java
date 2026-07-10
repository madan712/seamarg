package com.seamarg.backend.course;

import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Public course discovery (docs/courses-design.md §5.1). Open, unauthenticated
 * browse + search under {@code /api/public}; enrolling requires a login and
 * lives in {@link EnrollmentController}.
 */
@RestController
@RequestMapping("/api/public")
class PublicCourseController {

	private final CourseService courseService;

	PublicCourseController(CourseService courseService) {
		this.courseService = courseService;
	}

	@GetMapping("/courses")
	List<Map<String, Object>> courses() {
		return courseService.listCourseTypes(false);
	}

	@GetMapping("/courses/catalog")
	Map<String, Object> catalog() {
		return courseService.catalogGroupedByCategory();
	}

	@GetMapping("/courses/{typeSlug}")
	ResponseEntity<Map<String, Object>> course(@PathVariable String typeSlug) {
		return ResponseEntity.of(courseService.getCourse(typeSlug, true));
	}

	@GetMapping("/institutes")
	List<Map<String, Object>> institutes(
			@RequestParam(required = false) String q,
			@RequestParam(required = false) String state,
			@RequestParam(required = false) String city) {
		return courseService.listInstitutes(q, state, city, false);
	}

	@GetMapping("/institutes/{instituteId}")
	ResponseEntity<Map<String, Object>> institute(@PathVariable String instituteId) {
		return ResponseEntity.of(courseService.getInstitute(instituteId, true));
	}

	@GetMapping("/batches/search")
	List<Map<String, Object>> searchBatches(
			@RequestParam String course,
			@RequestParam(required = false) String from,
			@RequestParam(required = false) String to,
			@RequestParam(required = false) String state,
			@RequestParam(name = "openOnly", defaultValue = "true") boolean openOnly) {
		return courseService.searchBatches(course, from, to, state, openOnly);
	}
}
