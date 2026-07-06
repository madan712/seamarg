package com.seamarg.backend.certificate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.net.MalformedURLException;
import java.net.URI;
import java.net.URL;
import java.time.LocalDate;
import java.util.Map;

class CertificateAdminServiceTests {

	private final InMemoryCertificateRepository certificateRepository = new InMemoryCertificateRepository();
	private final InMemoryCertificateDataRepository dataRepository = new InMemoryCertificateDataRepository();
	private final RecordingDocumentStorage documentStorage = new RecordingDocumentStorage();
	private final CertificateAdminService service = new CertificateAdminService(
		certificateRepository, dataRepository, documentStorage, new ObjectMapper());

	@Test
	void surfacesFilesAttachedToCertificateEntries() {
		// A detailed NCOC entry with an attached file, as saved by the portal.
		dataRepository.savePayload("user-1", CertificateCategory.NCOC.sortKey("coc-deck"), """
			{
			  "number": "COC-99231",
			  "issuedDate": "2024-01-01",
			  "expiryDate": "2030-06-15",
			  "issuePlace": "Mumbai",
			  "issuingAuthority": "DG Shipping",
			  "cocGrade": "Master",
			  "file": {
			    "bucketName": "docs-bucket",
			    "objectKey": "users/user-1/certificates/abc/coc.pdf",
			    "originalFilename": "coc_deck.pdf",
			    "contentType": "application/pdf",
			    "sizeBytes": 204800
			  }
			}
			""");

		var files = service.filesForUser("user-1");

		assertEquals(1, files.size());
		var file = files.get(0);
		assertEquals("entry", file.source());
		assertEquals("entry~ncoc~coc-deck", file.fileId());
		assertEquals("coc_deck.pdf", file.originalFilename());
		assertEquals("application/pdf", file.contentType());
		assertEquals(204800L, file.sizeBytes());
		assertEquals("DG Shipping", file.issuer());
		assertEquals("COC-99231", file.certificateNumber());
		assertEquals("Master", file.rank());
		assertEquals(LocalDate.of(2030, 6, 15), file.expiryDate());
		assertEquals("ncoc", file.category());
	}

	@Test
	void ignoresEntriesWithoutAnAttachedFileAndMainDocsChecklist() {
		dataRepository.savePayload("user-1", CertificateCategory.GENERAL.sortKey("stcw"), """
			{ "number": "X1", "issuedDate": "2024-01-01" }
			""");
		dataRepository.savePayload("user-1", "CERT#MAINDOCS", """
			{ "aramco": true }
			""");

		assertTrue(service.filesForUser("user-1").isEmpty());
	}

	@Test
	void createsDownloadUrlForAnEntryAttachedFile() {
		dataRepository.savePayload("user-1", CertificateCategory.MEDICAL.sortKey("fitness"), """
			{
			  "issuingAuthority": "Clinic",
			  "file": { "bucketName": "b", "objectKey": "k", "originalFilename": "f.pdf" }
			}
			""");

		var url = service.createDownloadUrl("user-1", "entry~medical~fitness", true);

		assertTrue(url.isPresent());
		assertEquals("b", documentStorage.lastBucket);
		assertEquals("k", documentStorage.lastKey);
		assertTrue(documentStorage.lastAsAttachment);
	}

	@Test
	void returnsEmptyDownloadUrlWhenEntryFileMissing() {
		assertTrue(service.createDownloadUrl("user-1", "entry~medical~fitness", false).isEmpty());
	}

	@Test
	void includesStandaloneCertificateRecords() {
		certificateRepository.save(new CertificateRecord(
			"cert-1", "user-1", "scan.pdf", "application/pdf", 1024L, "bucket", "key",
			java.time.Instant.parse("2026-01-01T00:00:00Z"), java.time.Instant.parse("2026-01-01T00:00:00Z"),
			"ANALYZED", "STCW", "General", null, null, "Issuer", "N-1", 0.9, "minimax", null));

		var files = service.filesForUser("user-1");

		assertEquals(1, files.size());
		assertEquals("certificate", files.get(0).source());
		assertEquals("cert-1", files.get(0).fileId());
		assertNull(files.get(0).typeSlug());
		assertNotNull(files.get(0).uploadedAt());
	}

	private static final class RecordingDocumentStorage implements DocumentStorage {
		private String lastBucket;
		private String lastKey;
		private boolean lastAsAttachment;

		@Override
		public StoredDocument store(String userId, String certificateId, String originalFilename, String contentType,
				byte[] content) {
			throw new UnsupportedOperationException();
		}

		@Override
		public URL createDownloadUrl(CertificateRecord certificate) {
			return createDownloadUrl(certificate.bucketName(), certificate.objectKey(),
				certificate.originalFilename(), false);
		}

		@Override
		public URL createDownloadUrl(String bucketName, String objectKey, String filename, boolean asAttachment) {
			this.lastBucket = bucketName;
			this.lastKey = objectKey;
			this.lastAsAttachment = asAttachment;
			try {
				return URI.create("https://example.com/" + objectKey).toURL();
			} catch (MalformedURLException exception) {
				throw new IllegalStateException(exception);
			}
		}
	}
}
