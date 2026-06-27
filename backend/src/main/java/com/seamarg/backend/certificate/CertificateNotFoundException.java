package com.seamarg.backend.certificate;

class CertificateNotFoundException extends RuntimeException {

	CertificateNotFoundException(String certificateId) {
		super("Certificate not found: " + certificateId);
	}
}
