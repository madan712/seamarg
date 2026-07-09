package com.seamarg.backend.share;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.seamarg.backend.share.OwnedFilesGateway.OwnedFile;
import org.junit.jupiter.api.Test;

import java.net.URI;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

class ShareableFilesServiceTests {

	private static final String USER = "user-1";

	private final FakeOwnedFilesGateway gateway = new FakeOwnedFilesGateway();
	private final ShareRepository shareRepository = new InMemoryShareRepository();
	private final ShareableFilesService service = new ShareableFilesService(gateway, shareRepository);

	private static OwnedFile file(String fileId, String filename) {
		return new OwnedFile(fileId, "general", "stcw", "STCW", filename, "application/pdf", 2048L, null);
	}

	@Test
	void annotatesOwnedFilesWithLiveShareableFlag() {
		gateway.files = List.of(file("entry~general~stcw", "stcw.pdf"), file("cert-2", "medical.pdf"));

		service.setShareable(USER, "entry~general~stcw", true);

		var owned = service.listOwnedFiles(USER);
		assertEquals(2, owned.size());
		assertTrue(find(owned, "entry~general~stcw").shareable());
		assertFalse(find(owned, "cert-2").shareable());

		var shareable = service.listShareableFiles(USER);
		assertEquals(1, shareable.size());
		assertEquals("entry~general~stcw", shareable.get(0).fileId());
	}

	@Test
	void unSharingRemovesTheFileFromTheShareableSetImmediately() {
		gateway.files = List.of(file("cert-2", "medical.pdf"));

		service.setShareable(USER, "cert-2", true);
		assertEquals(1, service.listShareableFiles(USER).size());

		service.setShareable(USER, "cert-2", false);
		assertTrue(service.listShareableFiles(USER).isEmpty());
	}

	@Test
	void refusesToFlagAFileTheUserDoesNotOwn() {
		gateway.files = List.of(file("cert-2", "medical.pdf"));

		assertThrows(IllegalArgumentException.class, () -> service.setShareable(USER, "someone-elses-file", true));
	}

	@Test
	void mintsADownloadUrlOnlyForACurrentlyShareableFile() {
		gateway.files = List.of(file("cert-2", "medical.pdf"));

		service.setShareable(USER, "cert-2", true);
		assertTrue(service.downloadUrlIfShareable(USER, "cert-2", false).isPresent());
		assertEquals(1, gateway.downloadCalls.size());
	}

	@Test
	void refusesToMintADownloadUrlForANonShareableFile() {
		gateway.files = List.of(file("cert-2", "medical.pdf"));

		assertTrue(service.downloadUrlIfShareable(USER, "cert-2", false).isEmpty());
		assertTrue(gateway.downloadCalls.isEmpty(), "must not reach storage for a non-shareable file");
	}

	private static ShareableFilesService.ShareableFile find(List<ShareableFilesService.ShareableFile> files,
			String fileId) {
		return files.stream().filter(f -> f.fileId().equals(fileId)).findFirst().orElseThrow();
	}

	/** Minimal in-test gateway — avoids Mockito's inline mock maker on JDK 21. */
	private static final class FakeOwnedFilesGateway implements OwnedFilesGateway {

		private List<OwnedFile> files = List.of();
		private final List<String> downloadCalls = new ArrayList<>();

		@Override
		public List<OwnedFile> ownedFilesForUser(String userId) {
			return files;
		}

		@Override
		public Optional<URL> downloadUrl(String userId, String fileId, boolean asAttachment) {
			downloadCalls.add(fileId);
			try {
				return Optional.of(URI.create("https://example.com/" + fileId).toURL());
			}
			catch (Exception exception) {
				throw new IllegalStateException(exception);
			}
		}
	}
}
