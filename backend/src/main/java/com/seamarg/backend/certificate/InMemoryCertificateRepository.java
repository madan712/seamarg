package com.seamarg.backend.certificate;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

class InMemoryCertificateRepository implements CertificateRepository {

	private final ConcurrentHashMap<String, CertificateRecord> records = new ConcurrentHashMap<>();

	@Override
	public void save(CertificateRecord certificate) {
		records.put(key(certificate.userId(), certificate.certificateId()), certificate);
	}

	@Override
	public List<CertificateRecord> findByUserId(String userId) {
		return records.values()
			.stream()
			.filter(certificate -> certificate.userId().equals(userId))
			.sorted(Comparator.comparing(CertificateRecord::uploadedAt).reversed())
			.toList();
	}

	@Override
	public Optional<CertificateRecord> findByUserIdAndCertificateId(String userId, String certificateId) {
		return Optional.ofNullable(records.get(key(userId, certificateId)));
	}

	@Override
	public List<CertificateRecord> findAll() {
		return records.values()
			.stream()
			.sorted(Comparator.comparing(CertificateRecord::uploadedAt).reversed())
			.toList();
	}

	private static String key(String userId, String certificateId) {
		return userId + "::" + certificateId;
	}
}
