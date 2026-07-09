package com.seamarg.backend.share;

import com.seamarg.backend.share.OwnedFilesGateway.OwnedFile;
import org.springframework.stereotype.Service;

import java.net.URL;
import java.util.List;
import java.util.Optional;

/**
 * Bridges the document-sharing feature to the user's uploaded files. Files are
 * reached only through the {@link OwnedFilesGateway} seam (which adapts the
 * certificate package's public facade); the shareable flag lives beside them as
 * {@code SHAREVIS#<fileId>} items in the {@link ShareRepository}.
 *
 * <p>Per design D1 nothing snapshots a file subset: the shareable set is resolved
 * live here every time, so flipping a file private (or deleting it) instantly
 * changes what every active link exposes.
 */
@Service
class ShareableFilesService {

	private final OwnedFilesGateway ownedFiles;
	private final ShareRepository shareRepository;

	ShareableFilesService(OwnedFilesGateway ownedFiles, ShareRepository shareRepository) {
		this.ownedFiles = ownedFiles;
		this.shareRepository = shareRepository;
	}

	/** All of the user's files, each annotated with whether it is currently shareable. */
	List<ShareableFile> listOwnedFiles(String userId) {
		var shareable = shareRepository.shareableFileIds(userId);
		return ownedFiles.ownedFilesForUser(userId).stream()
			.map(file -> toShareableFile(file, shareable.contains(file.fileId())))
			.toList();
	}

	/** Only the files the user has currently flagged shareable (recipient-facing view). */
	List<ShareableFile> listShareableFiles(String userId) {
		var shareable = shareRepository.shareableFileIds(userId);
		if (shareable.isEmpty()) {
			return List.of();
		}
		return ownedFiles.ownedFilesForUser(userId).stream()
			.filter(file -> shareable.contains(file.fileId()))
			.map(file -> toShareableFile(file, true))
			.toList();
	}

	/**
	 * Marks/unmarks a file shareable. The file id must be one the user actually
	 * owns, so a client cannot flag an arbitrary or someone else's id.
	 */
	void setShareable(String userId, String fileId, boolean shareable) {
		var owned = ownedFiles.ownedFilesForUser(userId).stream()
			.anyMatch(file -> file.fileId().equals(fileId));
		if (!owned) {
			throw new IllegalArgumentException("Unknown file.");
		}
		if (shareable) {
			shareRepository.markShareable(userId, fileId);
		}
		else {
			shareRepository.clearShareable(userId, fileId);
		}
	}

	/**
	 * Mints a presigned URL for a recipient, but only if the file is
	 * <em>currently</em> shareable and still exists. Returns empty otherwise, so a
	 * file un-shared after the link was created can no longer be fetched.
	 */
	Optional<URL> downloadUrlIfShareable(String ownerSub, String fileId, boolean asAttachment) {
		if (!shareRepository.shareableFileIds(ownerSub).contains(fileId)) {
			return Optional.empty();
		}
		return ownedFiles.downloadUrl(ownerSub, fileId, asAttachment);
	}

	private static ShareableFile toShareableFile(OwnedFile file, boolean shareable) {
		return new ShareableFile(
			file.fileId(),
			file.category(),
			file.typeSlug(),
			file.documentName(),
			file.originalFilename(),
			file.contentType(),
			file.sizeBytes(),
			file.expiryDate(),
			shareable);
	}

	/** A user's uploaded file as presented to the sharing UI and to recipients. */
	record ShareableFile(
			String fileId,
			String category,
			String typeSlug,
			String documentName,
			String originalFilename,
			String contentType,
			long sizeBytes,
			String expiryDate,
			boolean shareable) {
	}
}
