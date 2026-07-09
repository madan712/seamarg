package com.seamarg.backend.share;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * In-memory {@link ShareRepository} used when no DynamoDB table is configured
 * (local development). Data is not persisted and starts empty.
 */
class InMemoryShareRepository implements ShareRepository {

	private final Map<String, ShareItem> sharesById = new ConcurrentHashMap<>();
	private final Map<String, Set<String>> visibilityByUser = new ConcurrentHashMap<>();

	@Override
	public void save(ShareItem share) {
		sharesById.put(share.shareId(), share);
	}

	@Override
	public List<ShareItem> listByOwner(String ownerSub) {
		var results = new ArrayList<ShareItem>();
		for (var share : sharesById.values()) {
			if (share.ownerSub().equals(ownerSub)) {
				results.add(share);
			}
		}
		return results;
	}

	@Override
	public Optional<ShareItem> findByOwnerAndId(String ownerSub, String shareId) {
		return Optional.ofNullable(sharesById.get(shareId))
			.filter(share -> share.ownerSub().equals(ownerSub));
	}

	@Override
	public Optional<ShareItem> findByTokenHash(String tokenHash) {
		return sharesById.values().stream()
			.filter(share -> tokenHash.equals(share.tokenHash()))
			.findFirst();
	}

	@Override
	public void markShareable(String userId, String fileId) {
		visibilityByUser.computeIfAbsent(userId, key -> ConcurrentHashMap.newKeySet()).add(fileId);
	}

	@Override
	public void clearShareable(String userId, String fileId) {
		var files = visibilityByUser.get(userId);
		if (files != null) {
			files.remove(fileId);
		}
	}

	@Override
	public Set<String> shareableFileIds(String userId) {
		return new LinkedHashSet<>(visibilityByUser.getOrDefault(userId, Set.of()));
	}
}
