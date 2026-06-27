package com.seamarg.backend.certificate;

import java.time.Instant;
import java.time.LocalDate;

public record CertificateRecord(
		String certificateId,
		String userId,
		String originalFilename,
		String contentType,
		long sizeBytes,
		String bucketName,
		String objectKey,
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

	public CertificateRecord withStatus(String status) {
		return new CertificateRecord(
			certificateId,
			userId,
			originalFilename,
			contentType,
			sizeBytes,
			bucketName,
			objectKey,
			uploadedAt,
			Instant.now(),
			status,
			documentName,
			documentCategory,
			rank,
			expiryDate,
			issuer,
			certificateNumber,
			confidence,
			extractionSource,
			extractionNotes);
	}

	public CertificateRecord withExtraction(CertificateExtraction extraction, String status) {
		return new CertificateRecord(
			certificateId,
			userId,
			originalFilename,
			contentType,
			sizeBytes,
			bucketName,
			objectKey,
			uploadedAt,
			Instant.now(),
			status,
			extraction.documentName(),
			extraction.documentCategory(),
			extraction.rank(),
			extraction.expiryDate(),
			extraction.issuer(),
			extraction.certificateNumber(),
			extraction.confidence(),
			extraction.source(),
			extraction.notes());
	}
}
