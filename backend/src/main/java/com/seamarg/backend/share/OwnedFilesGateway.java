package com.seamarg.backend.share;

import java.net.URL;
import java.util.List;
import java.util.Optional;

/**
 * Narrow seam onto the user's uploaded files. Keeps the share package decoupled
 * from the certificate package's internals and DTO shapes — the only crossing is
 * the public {@link com.seamarg.backend.certificate.CertificateAdminService}
 * facade, adapted by {@link CertificateOwnedFilesGateway}.
 */
interface OwnedFilesGateway {

	/** All files the user owns, across both certificate storage paths. */
	List<OwnedFile> ownedFilesForUser(String userId);

	/** A short-lived presigned URL for one of the user's files, if it exists. */
	Optional<URL> downloadUrl(String userId, String fileId, boolean asAttachment);

	/** A user's uploaded file, reduced to what the sharing feature needs. */
	record OwnedFile(
			String fileId,
			String category,
			String typeSlug,
			String documentName,
			String originalFilename,
			String contentType,
			long sizeBytes,
			String expiryDate) {
	}
}
