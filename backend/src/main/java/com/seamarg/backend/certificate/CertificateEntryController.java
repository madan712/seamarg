package com.seamarg.backend.certificate;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.exception.SdkException;

import java.time.Instant;
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
	private final CertificateFileService certificateFileService;
	private final CertificateSettings certificateSettings;

	CertificateEntryController(CertificateEntryService certificateEntryService,
			CertificateFileService certificateFileService, CertificateSettings certificateSettings) {
		this.certificateEntryService = certificateEntryService;
		this.certificateFileService = certificateFileService;
		this.certificateSettings = certificateSettings;
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

	@PostMapping(path = "/{category}/{type}/file", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	CertificateFileService.FileUploadResult uploadFile(@PathVariable String category, @PathVariable String type,
			@RequestParam("file") MultipartFile file, JwtAuthenticationToken authentication) {
		CertificateCategory.fromSlug(category)
			.orElseThrow(() -> new IllegalArgumentException("Unknown certificate category: " + category));
		return certificateFileService.upload(userId(authentication), file);
	}

	@GetMapping("/{category}/{type}/download-url")
	DownloadUrlResponse downloadUrl(@PathVariable String category, @PathVariable String type,
			JwtAuthenticationToken authentication) {
		var certificateCategory = CertificateCategory.fromSlug(category)
			.orElseThrow(() -> new IllegalArgumentException("Unknown certificate category: " + category));
		var url = certificateFileService.createDownloadUrl(userId(authentication), certificateCategory, type);
		return new DownloadUrlResponse(url.toString(), Instant.now().plus(certificateSettings.downloadUrlTtl()));
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
		return ResponseEntity.badRequest().body(new ApiError(exception.getMessage()));
	}

	@ExceptionHandler(StorageUnavailableException.class)
	ResponseEntity<ApiError> storageUnavailable(StorageUnavailableException exception) {
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE).body(new ApiError(exception.getMessage()));
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

	record DownloadUrlResponse(String url, Instant expiresAt) {
	}

	record ApiError(String message) {
	}
}
