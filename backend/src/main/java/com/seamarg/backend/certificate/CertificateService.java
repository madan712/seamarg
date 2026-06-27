package com.seamarg.backend.certificate;

import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.net.URL;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.UUID;

@Service
class CertificateService {

	private static final Set<String> ALLOWED_CONTENT_TYPES = Set.of(
		"application/pdf",
		"image/jpeg",
		"image/png",
		"image/webp",
		"image/heic",
		"text/plain",
		"application/msword",
		"application/vnd.openxmlformats-officedocument.wordprocessingml.document");

	private final CertificateSettings settings;
	private final DocumentStorage documentStorage;
	private final CertificateRepository certificateRepository;
	private final CertificateAnalyzer certificateAnalyzer;

	CertificateService(CertificateSettings settings, DocumentStorage documentStorage,
			CertificateRepository certificateRepository, CertificateAnalyzer certificateAnalyzer) {
		this.settings = settings;
		this.documentStorage = documentStorage;
		this.certificateRepository = certificateRepository;
		this.certificateAnalyzer = certificateAnalyzer;
	}

	List<CertificateRecord> list(String userId) {
		return certificateRepository.findByUserId(userId);
	}

	CertificateRecord upload(String userId, MultipartFile file) {
		validate(file);
		var certificateId = UUID.randomUUID().toString();
		var originalFilename = safeFilename(file.getOriginalFilename());
		var contentType = safeContentType(file);
		var now = Instant.now();
		byte[] content;

		try {
			content = file.getBytes();
		} catch (IOException exception) {
			throw new IllegalArgumentException("Could not read uploaded certificate file.", exception);
		}

		var storedDocument = documentStorage.store(userId, certificateId, originalFilename, contentType, content);
		var record = new CertificateRecord(
			certificateId,
			userId,
			originalFilename,
			contentType,
			content.length,
			storedDocument.bucketName(),
			storedDocument.objectKey(),
			now,
			now,
			"ANALYZING",
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null,
			null);
		certificateRepository.save(record);

		var extraction = certificateAnalyzer.analyze(originalFilename, contentType, content).normalized();
		var status = extraction.confidence() >= 0.65 ? "ANALYZED" : "REVIEW_REQUIRED";
		var analyzedRecord = record.withExtraction(extraction, status);
		certificateRepository.save(analyzedRecord);
		return analyzedRecord;
	}

	URL createDownloadUrl(String userId, String certificateId) {
		var certificate = certificateRepository.findByUserIdAndCertificateId(userId, certificateId)
			.orElseThrow(() -> new CertificateNotFoundException(certificateId));
		return documentStorage.createDownloadUrl(certificate);
	}

	private void validate(MultipartFile file) {
		if (file == null || file.isEmpty()) {
			throw new IllegalArgumentException("Choose a certificate file to upload.");
		}

		if (file.getSize() > settings.maxUploadBytes()) {
			throw new IllegalArgumentException("Certificate file exceeds the maximum allowed upload size.");
		}

		var contentType = safeContentType(file);
		var filename = safeFilename(file.getOriginalFilename()).toLowerCase(Locale.ENGLISH);
		var allowedExtension = filename.endsWith(".pdf")
			|| filename.endsWith(".jpg")
			|| filename.endsWith(".jpeg")
			|| filename.endsWith(".png")
			|| filename.endsWith(".webp")
			|| filename.endsWith(".heic")
			|| filename.endsWith(".txt")
			|| filename.endsWith(".doc")
			|| filename.endsWith(".docx");

		if (!ALLOWED_CONTENT_TYPES.contains(contentType) && !allowedExtension) {
			throw new IllegalArgumentException("Only PDF, image, text, Word, and document files can be uploaded.");
		}
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
}
