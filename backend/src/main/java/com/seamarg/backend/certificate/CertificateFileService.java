package com.seamarg.backend.certificate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URL;
import java.util.LinkedHashMap;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * Handles the file side of a detailed certificate entry (Step 2 §5.3–5.8):
 * store one uploaded scan in S3, read metadata from it with MiniMax, and mint a
 * short-lived download URL for the attached file. The entry fields (and the file
 * metadata) are persisted separately by {@link CertificateEntryService} on Save.
 */
@Service
class CertificateFileService {

	private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
		"application/pdf", "image/jpeg", "image/png", "image/webp", "image/heic");

	private final CertificateSettings settings;
	private final DocumentStorage documentStorage;
	private final MiniMaxCertificateExtractor extractor;
	private final CertificateDataRepository repository;
	private final ObjectMapper objectMapper;

	CertificateFileService(CertificateSettings settings, DocumentStorage documentStorage,
			MiniMaxCertificateExtractor extractor, CertificateDataRepository repository, ObjectMapper objectMapper) {
		this.settings = settings;
		this.documentStorage = documentStorage;
		this.extractor = extractor;
		this.repository = repository;
		this.objectMapper = objectMapper;
	}

	FileUploadResult upload(String userId, String typeSlug, MultipartFile file) {
		validate(file);
		var fileId = UUID.randomUUID().toString();
		var originalFilename = safeFilename(file.getOriginalFilename());
		var contentType = safeContentType(file);
		byte[] content;
		try {
			content = file.getBytes();
		} catch (IOException exception) {
			throw new IllegalArgumentException("Could not read the uploaded file.", exception);
		}

		// Name the stored file after the catalog slug (shared/certificates.ts) so a
		// certificate's file is identifiable by its type rather than the raw camera
		// filename. The original extension is preserved for content-type/download.
		var storedFilename = slugFilename(typeSlug, originalFilename);
		var stored = documentStorage.store(userId, fileId, storedFilename, contentType, content);
		var extraction = extractor.analyze(originalFilename, contentType, content);
		var metadata = new FileMetadata(stored.bucketName(), stored.objectKey(), storedFilename, contentType,
			content.length);
		return new FileUploadResult(extraction, metadata);
	}

	URL createDownloadUrl(String userId, CertificateCategory category, String typeSlug, boolean asAttachment) {
		var payload = repository.findPayload(userId, category.sortKey(typeSlug))
			.orElseThrow(() -> new IllegalArgumentException("No saved certificate for this type."));
		var fields = parse(payload);
		var file = fields.get("file");
		if (!(file instanceof Map<?, ?> fileMap)) {
			throw new IllegalArgumentException("No file is attached to this certificate.");
		}
		var bucketName = string(fileMap, "bucketName");
		var objectKey = string(fileMap, "objectKey");
		if (!StringUtils.hasText(bucketName) || !StringUtils.hasText(objectKey)) {
			throw new IllegalArgumentException("No file is attached to this certificate.");
		}
		return documentStorage.createDownloadUrl(bucketName, objectKey, string(fileMap, "originalFilename"), asAttachment);
	}

	private void validate(MultipartFile file) {
		if (file == null || file.isEmpty()) {
			throw new IllegalArgumentException("Choose a file to upload.");
		}
		if (file.getSize() > settings.maxUploadBytes()) {
			throw new IllegalArgumentException("File exceeds the maximum allowed upload size.");
		}
		var contentType = safeContentType(file);
		var filename = safeFilename(file.getOriginalFilename()).toLowerCase(Locale.ENGLISH);
		var allowedExtension = filename.endsWith(".pdf")
			|| filename.endsWith(".jpg")
			|| filename.endsWith(".jpeg")
			|| filename.endsWith(".png")
			|| filename.endsWith(".webp")
			|| filename.endsWith(".heic");
		if (!ALLOWED_CONTENT_TYPES.contains(contentType) && !allowedExtension) {
			throw new IllegalArgumentException("Only PDF or image files can be attached.");
		}
	}

	private Map<String, Object> parse(String payloadJson) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return Map.of();
		}
		try {
			return objectMapper.readValue(payloadJson, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (JsonProcessingException exception) {
			throw new IllegalStateException("Stored certificate entry could not be read.", exception);
		}
	}

	private static String string(Map<?, ?> map, String key) {
		var value = map.get(key);
		return value instanceof String text ? text : null;
	}

	private static String safeContentType(MultipartFile file) {
		return StringUtils.hasText(file.getContentType()) ? file.getContentType() : "application/octet-stream";
	}

	private static String safeFilename(String filename) {
		if (!StringUtils.hasText(filename)) {
			return "document";
		}
		var lastSlash = Math.max(filename.lastIndexOf('/'), filename.lastIndexOf('\\'));
		var basename = lastSlash >= 0 ? filename.substring(lastSlash + 1) : filename;
		return StringUtils.hasText(basename) ? basename : "document";
	}

	/** Builds "&lt;slug&gt;.&lt;ext&gt;" from the certificate type slug, keeping the original extension. */
	private static String slugFilename(String typeSlug, String originalFilename) {
		var slug = StringUtils.hasText(typeSlug) ? typeSlug.trim() : "document";
		var extension = fileExtension(originalFilename);
		return extension.isEmpty() ? slug : slug + "." + extension;
	}

	private static String fileExtension(String filename) {
		if (!StringUtils.hasText(filename)) {
			return "";
		}
		var dot = filename.lastIndexOf('.');
		if (dot < 0 || dot == filename.length() - 1) {
			return "";
		}
		var extension = filename.substring(dot + 1);
		return extension.matches("[A-Za-z0-9]{1,10}") ? extension.toLowerCase(Locale.ENGLISH) : "";
	}

	record FileMetadata(String bucketName, String objectKey, String originalFilename, String contentType,
			long sizeBytes) {
	}

	record FileUploadResult(CertificateEntryExtraction extraction, FileMetadata file) {
	}
}
