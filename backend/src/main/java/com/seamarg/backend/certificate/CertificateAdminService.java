package com.seamarg.backend.certificate;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.net.URL;
import java.time.Instant;
import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

/**
 * Read-only, cross-user view over uploaded certificate files for the admin
 * dashboard. Files reach the platform two ways and this service unifies both:
 * <ul>
 *   <li>standalone {@code CERTIFICATE#} records ({@link CertificateRepository});</li>
 *   <li>files attached to a detailed certificate <em>entry</em>, stored inside
 *       the entry payload under a {@code file} key ({@link CertificateDataRepository},
 *       sort key {@code CERT#<CATEGORY>#<TYPE>}).</li>
 * </ul>
 * The seafarer portal uses the entry flow, so most real uploads live there.
 */
@Service
public class CertificateAdminService {

	private static final String ENTRY_PREFIX = "CERT#";
	private static final String ENTRY_FILE_ID_PREFIX = "entry~";

	private final CertificateRepository certificateRepository;
	private final CertificateDataRepository certificateDataRepository;
	private final DocumentStorage documentStorage;
	private final ObjectMapper objectMapper;

	CertificateAdminService(CertificateRepository certificateRepository,
			CertificateDataRepository certificateDataRepository, DocumentStorage documentStorage,
			ObjectMapper objectMapper) {
		this.certificateRepository = certificateRepository;
		this.certificateDataRepository = certificateDataRepository;
		this.documentStorage = documentStorage;
		this.objectMapper = objectMapper;
	}

	/** Every uploaded file across all users, grouped by user id, newest first. */
	public Map<String, List<AdminFile>> allFilesByUser() {
		var byUser = new LinkedHashMap<String, List<AdminFile>>();

		for (var record : certificateRepository.findAll()) {
			if (record.userId() != null) {
				byUser.computeIfAbsent(record.userId(), key -> new ArrayList<>()).add(fromRecord(record));
			}
		}

		for (var entry : certificateDataRepository.findAllByPrefix(ENTRY_PREFIX)) {
			var file = fromEntry(entry.userId(), entry.sortKey(), entry.payloadJson(), entry.updatedAt());
			if (file != null) {
				byUser.computeIfAbsent(entry.userId(), key -> new ArrayList<>()).add(file);
			}
		}

		byUser.values().forEach(files -> files.sort(Comparator.comparing(AdminFile::uploadedAt,
			Comparator.nullsLast(Comparator.naturalOrder())).reversed()));
		return byUser;
	}

	/** All uploaded files for a single user, newest first. */
	public List<AdminFile> filesForUser(String userId) {
		return allFilesByUser().getOrDefault(userId, List.of());
	}

	/**
	 * Creates a short-lived presigned URL for one user's file, or an empty result
	 * when it cannot be found. Resolves both standalone records (by certificate
	 * id) and entry-attached files (by {@code entry~<category>~<type>} id).
	 */
	public Optional<URL> createDownloadUrl(String userId, String fileId, boolean asAttachment) {
		if (fileId != null && fileId.startsWith(ENTRY_FILE_ID_PREFIX)) {
			return entryFileDownloadUrl(userId, fileId, asAttachment);
		}
		return certificateRepository.findByUserIdAndCertificateId(userId, fileId)
			.map(certificate -> documentStorage.createDownloadUrl(
				certificate.bucketName(),
				certificate.objectKey(),
				certificate.originalFilename(),
				asAttachment));
	}

	private Optional<URL> entryFileDownloadUrl(String userId, String fileId, boolean asAttachment) {
		var parts = fileId.substring(ENTRY_FILE_ID_PREFIX.length()).split("~", 2);
		if (parts.length < 2) {
			return Optional.empty();
		}
		var category = CertificateCategory.fromSlug(parts[0]).orElse(null);
		if (category == null) {
			return Optional.empty();
		}
		return certificateDataRepository.findPayload(userId, category.sortKey(parts[1]))
			.map(this::parse)
			.map(fields -> fields.get("file"))
			.filter(Map.class::isInstance)
			.map(Map.class::cast)
			.map(fileMap -> {
				var bucketName = stringValue(fileMap.get("bucketName"));
				var objectKey = stringValue(fileMap.get("objectKey"));
				if (!StringUtils.hasText(bucketName) || !StringUtils.hasText(objectKey)) {
					return null;
				}
				return documentStorage.createDownloadUrl(bucketName, objectKey,
					stringValue(fileMap.get("originalFilename")), asAttachment);
			});
	}

	private static AdminFile fromRecord(CertificateRecord record) {
		return new AdminFile(
			record.certificateId(),
			"certificate",
			record.documentCategory(),
			null,
			record.originalFilename(),
			record.contentType(),
			record.sizeBytes(),
			record.uploadedAt(),
			record.updatedAt(),
			record.processingStatus(),
			record.documentName(),
			record.rank(),
			record.expiryDate(),
			record.issuer(),
			record.certificateNumber(),
			record.confidence(),
			record.extractionSource(),
			record.extractionNotes());
	}

	private AdminFile fromEntry(String userId, String sortKey, String payloadJson, Instant updatedAt) {
		// Sort key shape: CERT#<CATEGORY_NAME>#<TYPE_SLUG>. Anything shorter
		// (e.g. CERT#MAINDOCS) is not a detailed entry and has no file.
		var parts = sortKey.split("#", 3);
		if (parts.length < 3) {
			return null;
		}
		var category = CertificateCategory.fromName(parts[1]).orElse(null);
		if (category == null) {
			return null;
		}
		var fields = parse(payloadJson);
		if (!(fields.get("file") instanceof Map<?, ?> fileMap)) {
			return null; // entry saved without an attached file
		}
		var categorySlug = category.slug();
		var typeSlug = parts[2];
		return new AdminFile(
			ENTRY_FILE_ID_PREFIX + categorySlug + "~" + typeSlug,
			"entry",
			categorySlug,
			typeSlug,
			stringValue(fileMap.get("originalFilename")),
			stringValue(fileMap.get("contentType")),
			longValue(fileMap.get("sizeBytes")),
			updatedAt,
			updatedAt,
			null,
			stringValue(fields.get("documentName")),
			stringValue(fields.get("cocGrade")),
			parseDate(stringValue(fields.get("expiryDate"))),
			stringValue(fields.get("issuingAuthority")),
			stringValue(fields.get("number")),
			null,
			null,
			null);
	}

	private Map<String, Object> parse(String payloadJson) {
		if (payloadJson == null || payloadJson.isBlank()) {
			return Map.of();
		}
		try {
			return objectMapper.readValue(payloadJson, new TypeReference<LinkedHashMap<String, Object>>() {
			});
		} catch (JsonProcessingException exception) {
			return Map.of();
		}
	}

	private static String stringValue(Object value) {
		return value instanceof String text && !text.isBlank() ? text : null;
	}

	private static long longValue(Object value) {
		if (value instanceof Number number) {
			return number.longValue();
		}
		if (value instanceof String text) {
			try {
				return Long.parseLong(text.trim());
			} catch (NumberFormatException ignored) {
				return 0L;
			}
		}
		return 0L;
	}

	private static LocalDate parseDate(String value) {
		if (value == null) {
			return null;
		}
		try {
			return LocalDate.parse(value);
		} catch (DateTimeParseException exception) {
			return null;
		}
	}

	/** A unified uploaded file for the admin dashboard, from either storage path. */
	public record AdminFile(
			String fileId,
			String source,
			String category,
			String typeSlug,
			String originalFilename,
			String contentType,
			long sizeBytes,
			Instant uploadedAt,
			Instant updatedAt,
			String processingStatus,
			String documentName,
			String rank,
			LocalDate expiryDate,
			String issuer,
			String certificateNumber,
			Double confidence,
			String extractionSource,
			String extractionNotes) {
	}
}
