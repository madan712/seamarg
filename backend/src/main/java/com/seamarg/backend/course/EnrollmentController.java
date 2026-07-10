package com.seamarg.backend.course;

import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * Seafarer enrollment requests (docs/courses-design.md §5.2). Identity always
 * comes from the validated JWT subject, never the request body.
 */
@RestController
@RequestMapping("/api/customer/enrollments")
class EnrollmentController {

	private final EnrollmentService enrollmentService;

	EnrollmentController(EnrollmentService enrollmentService) {
		this.enrollmentService = enrollmentService;
	}

	@GetMapping
	List<Map<String, Object>> list(JwtAuthenticationToken authentication) {
		return enrollmentService.listForUser(userId(authentication));
	}

	@PostMapping
	Map<String, Object> create(@RequestBody(required = false) Map<String, Object> body,
			JwtAuthenticationToken authentication) {
		var data = body == null ? Map.<String, Object>of() : body;
		return enrollmentService.request(userId(authentication),
			string(data, "instituteId"), string(data, "typeSlug"), string(data, "batchId"));
	}

	@DeleteMapping("/{batchId}")
	Map<String, Object> cancel(@PathVariable String batchId, JwtAuthenticationToken authentication) {
		return enrollmentService.cancel(userId(authentication), batchId);
	}

	private static String userId(JwtAuthenticationToken authentication) {
		return authentication.getToken().getSubject();
	}

	private static String string(Map<String, Object> data, String key) {
		var value = data.get(key);
		return value == null ? null : String.valueOf(value);
	}
}
