package com.seamarg.backend.share;

import java.util.List;
import java.util.Optional;
import java.util.Set;

/**
 * Persistence for shares and per-file visibility flags, both backed by the shared
 * single table ({@code pk = USER#<sub>}).
 *
 * <ul>
 *   <li>Shares — {@code sk = SHARE#<shareId>}, resolvable by owner or by token
 *       hash (via the {@code gsi1} index).</li>
 *   <li>Visibility — {@code sk = SHAREVIS#<fileId>}; the item's mere presence
 *       means the file is currently shareable (design D1). No inline flag is
 *       written into the certificate records, keeping the certificate package's
 *       storage untouched.</li>
 * </ul>
 */
interface ShareRepository {

	void save(ShareItem share);

	List<ShareItem> listByOwner(String ownerSub);

	Optional<ShareItem> findByOwnerAndId(String ownerSub, String shareId);

	/** Resolve a share from the anonymous recipient's token hash (single match expected). */
	Optional<ShareItem> findByTokenHash(String tokenHash);

	/** Marks a file shareable (idempotent). */
	void markShareable(String userId, String fileId);

	/** Removes a file from the shareable set (idempotent). */
	void clearShareable(String userId, String fileId);

	/** The set of file ids the user has currently flagged shareable. */
	Set<String> shareableFileIds(String userId);
}
