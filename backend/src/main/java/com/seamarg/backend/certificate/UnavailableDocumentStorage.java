package com.seamarg.backend.certificate;

import java.net.URL;

class UnavailableDocumentStorage implements DocumentStorage {

	@Override
	public StoredDocument store(String userId, String certificateId, String originalFilename, String contentType,
			byte[] content) {
		throw new StorageUnavailableException(
			"Certificate document storage is not configured. Set SEAMARG_DOCUMENT_BUCKET for the backend.");
	}

	@Override
	public URL createDownloadUrl(CertificateRecord certificate) {
		throw new StorageUnavailableException(
			"Certificate document storage is not configured. Set SEAMARG_DOCUMENT_BUCKET for the backend.");
	}

	@Override
	public URL createDownloadUrl(String bucketName, String objectKey, String filename, boolean asAttachment) {
		throw new StorageUnavailableException(
			"Certificate document storage is not configured. Set SEAMARG_DOCUMENT_BUCKET for the backend.");
	}
}
