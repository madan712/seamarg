package com.seamarg.backend.certificate;

import java.net.URL;

interface DocumentStorage {

	StoredDocument store(String userId, String certificateId, String originalFilename, String contentType, byte[] content);

	URL createDownloadUrl(CertificateRecord certificate);
}
