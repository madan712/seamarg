package com.seamarg.backend.course;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import software.amazon.awssdk.core.exception.SdkException;

/**
 * Package-scoped error handling for the Courses controllers: validation
 * problems become 400s and AWS/storage failures become 503s, matching the
 * {@code ApiError} shape used elsewhere in the backend.
 */
@Slf4j
@RestControllerAdvice(basePackages = "com.seamarg.backend.course")
class CourseExceptionHandler {

	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
		return ResponseEntity.badRequest().body(new ApiError(exception.getMessage()));
	}

	@ExceptionHandler(SdkException.class)
	ResponseEntity<ApiError> awsFailure(SdkException exception) {
		log.warn("Course storage request failed", exception);
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(new ApiError("Course storage request failed. Check backend AWS credentials and DynamoDB permissions."));
	}

	record ApiError(String message) {
	}
}
