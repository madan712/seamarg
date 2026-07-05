package com.seamarg.backend.certificate;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import software.amazon.awssdk.core.exception.SdkException;

import java.util.Map;

/**
 * Held/not-held "Main documents" checklist (Step 2 §5.2). Stored per user as a
 * single JSON item; identity always comes from the validated JWT.
 */
@Slf4j
@RestController
@RequestMapping("/api/customer/certificates/main-documents")
class MainDocumentsController {

	private final MainDocumentsService mainDocumentsService;

	MainDocumentsController(MainDocumentsService mainDocumentsService) {
		this.mainDocumentsService = mainDocumentsService;
	}

	@GetMapping
	Map<String, Object> get(JwtAuthenticationToken authentication) {
		return mainDocumentsService.get(userId(authentication));
	}

	@PutMapping
	Map<String, Object> save(@RequestBody(required = false) Map<String, Object> body,
			JwtAuthenticationToken authentication) {
		return mainDocumentsService.save(userId(authentication), body);
	}

	@ExceptionHandler(SdkException.class)
	ResponseEntity<ApiError> awsStorageFailure(SdkException exception) {
		log.warn("Main documents storage request failed", exception);
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
