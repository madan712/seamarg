package com.seamarg.backend.certificate;

import org.springframework.http.ContentDisposition;

import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.GetObjectRequest;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.presigner.S3Presigner;
import software.amazon.awssdk.services.s3.presigner.model.GetObjectPresignRequest;

import java.net.URL;
import java.time.Instant;

class S3DocumentStorage implements DocumentStorage {

	private final CertificateSettings settings;
	private final S3Client s3Client;
	private final S3Presigner s3Presigner;

	S3DocumentStorage(CertificateSettings settings, S3Client s3Client, S3Presigner s3Presigner) {
		this.settings = settings;
		this.s3Client = s3Client;
		this.s3Presigner = s3Presigner;
	}

	@Override
	public StoredDocument store(String userId, String certificateId, String originalFilename, String contentType,
			byte[] content) {
		var objectKey = "users/%s/certificates/%s/%s".formatted(
			sanitizePathSegment(userId),
			certificateId,
			sanitizeFilename(originalFilename));

		var request = PutObjectRequest.builder()
			.bucket(settings.documentBucketName())
			.key(objectKey)
			.contentType(contentType)
			.contentLength((long) content.length)
			.metadata(java.util.Map.of(
				"userId", userId,
				"certificateId", certificateId,
				"uploadedAt", Instant.now().toString()))
			.build();

		s3Client.putObject(request, RequestBody.fromBytes(content));
		return new StoredDocument(settings.documentBucketName(), objectKey);
	}

	@Override
	public URL createDownloadUrl(CertificateRecord certificate) {
		return presignedUrl(certificate.bucketName(), certificate.objectKey(), certificate.originalFilename(), false);
	}

	@Override
	public URL createDownloadUrl(String bucketName, String objectKey, String filename, boolean asAttachment) {
		return presignedUrl(bucketName, objectKey, filename, asAttachment);
	}

	private URL presignedUrl(String bucketName, String objectKey, String filename, boolean asAttachment) {
		var builder = asAttachment ? ContentDisposition.attachment() : ContentDisposition.inline();
		var disposition = builder.filename(sanitizeFilename(filename)).build().toString();
		var getObjectRequest = GetObjectRequest.builder()
			.bucket(bucketName)
			.key(objectKey)
			.responseContentDisposition(disposition)
			.build();
		var presignRequest = GetObjectPresignRequest.builder()
			.signatureDuration(settings.downloadUrlTtl())
			.getObjectRequest(getObjectRequest)
			.build();

		return s3Presigner.presignGetObject(presignRequest).url();
	}

	private static String sanitizePathSegment(String value) {
		return value.replaceAll("[^A-Za-z0-9._=-]", "_");
	}

	private static String sanitizeFilename(String filename) {
		if (filename == null || filename.isBlank()) {
			return "document";
		}

		var lastSlash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
		var basename = lastSlash >= 0 ? filename.substring(lastSlash + 1) : filename;
		var sanitized = basename.replaceAll("[^A-Za-z0-9._ -]", "_").trim();
		return sanitized.isBlank() ? "document" : sanitized;
	}
}
