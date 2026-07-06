package com.seamarg.backend.certificate;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory {@link CertificateDataRepository} used when no DynamoDB table is
 * configured (local development).
 */
class InMemoryCertificateDataRepository implements CertificateDataRepository {

	private final Map<String, String> store = new ConcurrentHashMap<>();

	@Override
	public Optional<String> findPayload(String userId, String sortKey) {
		return Optional.ofNullable(store.get(key(userId, sortKey)));
	}

	@Override
	public void savePayload(String userId, String sortKey, String payloadJson) {
		store.put(key(userId, sortKey), payloadJson == null ? "" : payloadJson);
	}

	@Override
	public List<StoredCertificateData> findByUserIdAndPrefix(String userId, String sortKeyPrefix) {
		var prefix = key(userId, sortKeyPrefix);
		var results = new ArrayList<StoredCertificateData>();
		for (var entry : store.entrySet()) {
			if (entry.getKey().startsWith(prefix)) {
				var sortKey = entry.getKey().substring((userId + "|").length());
				results.add(new StoredCertificateData(sortKey, entry.getValue()));
			}
		}
		return results;
	}

	@Override
	public List<UserScopedData> findAllByPrefix(String sortKeyPrefix) {
		var results = new ArrayList<UserScopedData>();
		for (var entry : store.entrySet()) {
			var separator = entry.getKey().indexOf('|');
			if (separator < 0) {
				continue;
			}
			var userId = entry.getKey().substring(0, separator);
			var sortKey = entry.getKey().substring(separator + 1);
			if (sortKey.startsWith(sortKeyPrefix)) {
				results.add(new UserScopedData(userId, sortKey, entry.getValue(), null));
			}
		}
		return results;
	}

	private static String key(String userId, String sortKey) {
		return userId + "|" + sortKey;
	}
}
