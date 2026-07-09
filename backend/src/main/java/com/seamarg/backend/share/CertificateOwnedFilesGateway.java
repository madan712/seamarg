package com.seamarg.backend.share;

import com.seamarg.backend.certificate.CertificateAdminService;
import com.seamarg.backend.certificate.CertificateAdminService.AdminFile;
import org.springframework.stereotype.Service;

import java.net.URL;
import java.util.List;
import java.util.Optional;

/**
 * Adapts the certificate package's public {@link CertificateAdminService} facade
 * to the share package's {@link OwnedFilesGateway}. Uses the per-user (no
 * cross-user scan) listing so it is safe on the customer hot path.
 */
@Service
class CertificateOwnedFilesGateway implements OwnedFilesGateway {

	private final CertificateAdminService certificateAdminService;

	CertificateOwnedFilesGateway(CertificateAdminService certificateAdminService) {
		this.certificateAdminService = certificateAdminService;
	}

	@Override
	public List<OwnedFile> ownedFilesForUser(String userId) {
		return certificateAdminService.ownedFilesForUser(userId).stream().map(this::toOwnedFile).toList();
	}

	@Override
	public Optional<URL> downloadUrl(String userId, String fileId, boolean asAttachment) {
		return certificateAdminService.createDownloadUrl(userId, fileId, asAttachment);
	}

	private OwnedFile toOwnedFile(AdminFile file) {
		return new OwnedFile(
			file.fileId(),
			file.category(),
			file.typeSlug(),
			file.documentName(),
			file.originalFilename(),
			file.contentType(),
			file.sizeBytes(),
			file.expiryDate() == null ? null : file.expiryDate().toString());
	}
}
