package com.seamarg.backend.certificate;

import java.util.List;
import java.util.Optional;

interface CertificateRepository {

	void save(CertificateRecord certificate);

	List<CertificateRecord> findByUserId(String userId);

	Optional<CertificateRecord> findByUserIdAndCertificateId(String userId, String certificateId);
}
