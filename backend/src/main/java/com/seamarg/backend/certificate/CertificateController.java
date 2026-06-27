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
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import software.amazon.awssdk.core.exception.SdkException;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

@Slf4j
@RestController
@RequestMapping("/api/customer/certificates")
class CertificateController {

	private final CertificateService certificateService;
	private final CertificateSettings certificateSettings;

	CertificateController(CertificateService certificateService, CertificateSettings certificateSettings) {
		this.certificateService = certificateService;
		this.certificateSettings = certificateSettings;
	}

	@GetMapping
	List<CertificateResponse> list(JwtAuthenticationToken authentication) {
		return certificateService.list(userId(authentication))
			.stream()
			.map(CertificateResponse::from)
			.toList();
	}

	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	ResponseEntity<CertificateResponse> upload(@RequestParam("file") MultipartFile file,
			JwtAuthenticationToken authentication) {
		var certificate = certificateService.upload(userId(authentication), file);
		return ResponseEntity.status(HttpStatus.CREATED).body(CertificateResponse.from(certificate));
	}

	@GetMapping("/{certificateId}/download-url")
	DownloadUrlResponse downloadUrl(@PathVariable String certificateId, JwtAuthenticationToken authentication) {
		var url = certificateService.createDownloadUrl(userId(authentication), certificateId);
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
		log.warn("Certificate storage request failed", exception);
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(new ApiError(
				"Certificate storage request failed. Check backend AWS credentials and S3/DynamoDB permissions."));
	}

	@ExceptionHandler(CertificateNotFoundException.class)
	ResponseEntity<ApiError> notFound(CertificateNotFoundException exception) {
		return ResponseEntity.status(HttpStatus.NOT_FOUND).body(new ApiError(exception.getMessage()));
	}

	private static String userId(JwtAuthenticationToken authentication) {
		return authentication.getToken().getSubject();
	}

	record CertificateResponse(
			String certificateId,
			String originalFilename,
			String contentType,
			long sizeBytes,
			Instant uploadedAt,
			Instant updatedAt,
			String processingStatus,
			String documentName,
			String documentCategory,
			String rank,
			LocalDate expiryDate,
			String issuer,
			String certificateNumber,
			Double confidence,
			String extractionSource,
			String extractionNotes) {

		static CertificateResponse from(CertificateRecord certificate) {
			return new CertificateResponse(
				certificate.certificateId(),
				certificate.originalFilename(),
				certificate.contentType(),
				certificate.sizeBytes(),
				certificate.uploadedAt(),
				certificate.updatedAt(),
				certificate.processingStatus(),
				certificate.documentName(),
				certificate.documentCategory(),
				certificate.rank(),
				certificate.expiryDate(),
				certificate.issuer(),
				certificate.certificateNumber(),
				certificate.confidence(),
				certificate.extractionSource(),
				certificate.extractionNotes());
		}
	}

	record DownloadUrlResponse(String url, Instant expiresAt) {
	}

	record ApiError(String message) {
	}
}
