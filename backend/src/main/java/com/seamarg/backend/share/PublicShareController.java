package com.seamarg.backend.share;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import software.amazon.awssdk.core.exception.SdkException;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.List;

/**
 * Anonymous recipient API for a shared link (open tier). The flow is
 * redeem → session → list/download (design §2.2):
 *
 * <ol>
 *   <li>{@code POST /redeem} with the capability token (in the body, never a
 *       query string) returns a short-lived session token + the file list.</li>
 *   <li>Follow-up calls carry that session token in the request <em>body</em>
 *       ({@code POST /files/download}) or a query param ({@code GET /files}), and
 *       optionally the {@code X-Share-Session} header. The body/query form is the
 *       primary path because a CDN/proxy in front of the API (CloudFront) may
 *       strip an un-forwarded custom header, and a custom header also forces a
 *       CORS preflight — the header form is kept only for native clients. Never
 *       {@code Authorization}, which the Cognito resource-server filter would try
 *       to decode and reject.</li>
 * </ol>
 *
 * The shared file set is resolved live on every call, so un-sharing a file or
 * revoking the link takes effect immediately (design D1/P3).
 */
@Slf4j
@RestController
@RequestMapping("/api/public/shares")
class PublicShareController {

	private final ShareService shareService;
	private final ShareableFilesService shareableFilesService;

	PublicShareController(ShareService shareService, ShareableFilesService shareableFilesService) {
		this.shareService = shareService;
		this.shareableFilesService = shareableFilesService;
	}

	@PostMapping("/redeem")
	RedeemResponse redeem(@RequestBody(required = false) RedeemRequest request) {
		if (request == null || request.token() == null || request.token().isBlank()) {
			throw new ShareGoneException("This link is no longer available.");
		}
		var redeemed = shareService.redeem(request.token(), request.pin());
		var files = shareableFilesService.listShareableFiles(redeemed.ownerSub());
		return new RedeemResponse(redeemed.sessionToken(), redeemed.sessionExpiresAt(), redeemed.expiresAt(),
			redeemed.allowDownload(), redeemed.recipientLabel(), files);
	}

	@GetMapping("/files")
	FilesResponse files(@RequestHeader(name = ShareSessionService.HEADER, required = false) String sessionHeader,
			@RequestParam(name = "session", required = false) String sessionParam) {
		var share = shareService.requireActiveShareForSession(firstNonBlank(sessionParam, sessionHeader));
		var files = shareableFilesService.listShareableFiles(share.ownerSub());
		return new FilesResponse(share.allowDownload(), files);
	}

	/**
	 * Browser-friendly download: a plain GET that 302-redirects to the presigned
	 * URL. The recipient viewer links its View/Download buttons straight at this
	 * (as normal anchors), so the browser navigates a new tab synchronously with
	 * the click — no fetch, no {@code window.open} timing, so nothing for the
	 * popup blocker to kill. Session + file id ride the query string (a top-level
	 * navigation, so CORS never applies); the response is {@code no-store} so the
	 * time-limited presigned URL is never cached/shared.
	 */
	@GetMapping("/files/download")
	ResponseEntity<Void> downloadRedirect(
			@RequestParam(name = "fileId", required = false) String fileId,
			@RequestParam(name = "session", required = false) String sessionParam,
			@RequestParam(name = "download", required = false, defaultValue = "false") boolean download,
			@RequestHeader(name = ShareSessionService.HEADER, required = false) String sessionHeader) {
		if (!StringUtils.hasText(fileId)) {
			throw new ShareGoneException("File is not available.");
		}
		var share = shareService.requireActiveShareForSession(firstNonBlank(sessionParam, sessionHeader));
		var asAttachment = share.allowDownload() && download;
		var url = shareableFilesService.downloadUrlIfShareable(share.ownerSub(), fileId, asAttachment)
			.orElseThrow(() -> new ShareGoneException("File is not available."));
		shareService.recordDownload(share);
		return ResponseEntity.status(HttpStatus.FOUND)
			.header(HttpHeaders.LOCATION, url.toString())
			.header(HttpHeaders.CACHE_CONTROL, "no-store")
			.build();
	}

	@PostMapping("/files/download")
	DownloadResponse download(@RequestHeader(name = ShareSessionService.HEADER, required = false) String sessionHeader,
			@RequestBody(required = false) DownloadRequest request) {
		if (request == null || request.fileId() == null || request.fileId().isBlank()) {
			throw new ShareGoneException("File is not available.");
		}
		var share = shareService
			.requireActiveShareForSession(firstNonBlank(request.session(), sessionHeader));
		// Preview inline; only allow a forced attachment download when the owner permitted it.
		var asAttachment = share.allowDownload() && request.download();
		var url = shareableFilesService.downloadUrlIfShareable(share.ownerSub(), request.fileId(), asAttachment)
			.orElseThrow(() -> new ShareGoneException("File is not available."));
		shareService.recordDownload(share);
		return new DownloadResponse(url.toString());
	}

	private static String firstNonBlank(String preferred, String fallback) {
		return StringUtils.hasText(preferred) ? preferred : fallback;
	}

	@org.springframework.web.bind.annotation.ExceptionHandler(ShareGoneException.class)
	ResponseEntity<ApiError> gone(ShareGoneException exception) {
		return ResponseEntity.status(HttpStatus.GONE).body(new ApiError(exception.getMessage()));
	}

	@org.springframework.web.bind.annotation.ExceptionHandler(ShareSessionInvalidException.class)
	ResponseEntity<ApiError> unauthorized(ShareSessionInvalidException exception) {
		return ResponseEntity.status(HttpStatus.UNAUTHORIZED).body(new ApiError(exception.getMessage()));
	}

	@org.springframework.web.bind.annotation.ExceptionHandler(SdkException.class)
	ResponseEntity<ApiError> storageFailure(SdkException exception) {
		log.warn("Share storage request failed", exception);
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(new ApiError("This service is temporarily unavailable. Please try again shortly."));
	}

	record RedeemRequest(String token, String pin) {
	}

	record RedeemResponse(String sessionToken, Instant sessionExpiresAt, Instant linkExpiresAt, boolean allowDownload,
			String recipientLabel, List<ShareableFilesService.ShareableFile> files) {
	}

	record FilesResponse(boolean allowDownload, List<ShareableFilesService.ShareableFile> files) {
	}

	record DownloadRequest(String fileId, boolean download, String session) {
	}

	record DownloadResponse(String url) {
	}

	record ApiError(String message) {
	}
}
