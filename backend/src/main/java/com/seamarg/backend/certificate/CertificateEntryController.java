package com.seamarg.backend.certificate;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import software.amazon.awssdk.core.exception.SdkException;

import java.util.Map;

/**
 * Detailed certificate entries (Step 2 §5.3–5.8). One entry per (category,
 * catalog type); identity always comes from the validated JWT.
 */
@Slf4j
@RestController
@RequestMapping("/api/customer/certificates")
class CertificateEntryController {

	private final CertificateEntryService certificateEntryService;

	CertificateEntryController(CertificateEntryService certificateEntryService) {
		this.certificateEntryService = certificateEntryService;
	}

	@GetMapping("/entries")
	Map<String, Map<String, Object>> entries(JwtAuthenticationToken authentication) {
		return certificateEntryService.listByCategory(userId(authentication));
	}

	@PutMapping("/{category}/{type}")
	Map<String, Object> save(@PathVariable String category, @PathVariable String type,
			@RequestBody(required = false) Map<String, Object> body, JwtAuthenticationToken authentication) {
		var certificateCategory = CertificateCategory.fromSlug(category)
			.orElseThrow(() -> new IllegalArgumentException("Unknown certificate category: " + category));
		return certificateEntryService.saveEntry(userId(authentication), certificateCategory, type, body);
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
		return ResponseEntity.badRequest().body(new ApiError(exception.getMessage()));
	}

	@ExceptionHandler(SdkException.class)
	ResponseEntity<ApiError> awsStorageFailure(SdkException exception) {
		log.warn("Certificate entry storage request failed", exception);
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(new ApiError(
				"Certificate storage request failed. Check backend AWS credentials and DynamoDB permissions."));
	}

	private static String userId(JwtAuthenticationToken authentication) {
		return authentication.getToken().getSubject();
	}

	record ApiError(String message) {
	}
}
