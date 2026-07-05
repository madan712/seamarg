package com.seamarg.backend.certificate;

import java.util.List;
import java.util.Optional;

/**
 * Generic "JSON blob per (user, sort key)" store for the certificates area,
 * backed by the shared single table ({@code pk = USER#<sub>}, {@code sk = <sortKey>}).
 * Used for the Main documents checklist ({@code CERT#MAINDOCS}) and the per-catalog
 * certificate entries ({@code CERT#<CATEGORY>#<TYPE_SLUG>}).
 */
interface CertificateDataRepository {

	Optional<String> findPayload(String userId, String sortKey);

	void savePayload(String userId, String sortKey, String payloadJson);

	/** Returns all items for a user whose sort key begins with the given prefix. */
	List<StoredCertificateData> findByUserIdAndPrefix(String userId, String sortKeyPrefix);

	record StoredCertificateData(String sortKey, String payloadJson) {
	}
}
