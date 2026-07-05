package com.seamarg.backend;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.multipart.MultipartException;

/**
 * Application-wide fallback that keeps API errors as JSON. Without this, failures
 * raised outside a controller method — most notably multipart parsing errors such
 * as {@link MaxUploadSizeExceededException} when an uploaded file exceeds the servlet
 * limit — fall through to Spring's HTML "Whitelabel" error page. The frontend then
 * receives HTML instead of JSON and reports a misleading CloudFront routing error.
 */
@Slf4j
@RestControllerAdvice
class ApiExceptionHandler {

	@ExceptionHandler(MaxUploadSizeExceededException.class)
	ResponseEntity<ApiError> handleMaxUploadSize(MaxUploadSizeExceededException exception) {
		log.warn("Rejected upload that exceeded the multipart size limit", exception);
		return ResponseEntity.status(HttpStatus.CONTENT_TOO_LARGE)
			.body(new ApiError("The uploaded file is too large. Attach a smaller scan and try again."));
	}

	@ExceptionHandler(MultipartException.class)
	ResponseEntity<ApiError> handleMultipart(MultipartException exception) {
		log.warn("Rejected malformed multipart upload", exception);
		return ResponseEntity.badRequest()
			.body(new ApiError("The upload could not be read. Attach the file again and try once more."));
	}

	record ApiError(String message) {
	}
}
