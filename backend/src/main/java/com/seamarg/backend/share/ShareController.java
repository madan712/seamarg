package com.seamarg.backend.share;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * Owner-facing document-sharing API (Cognito JWT). Lets a seafarer flag which of
 * their uploaded files are shareable and mint / list / revoke secure share links.
 * Identity always comes from the validated JWT subject, never the request body.
 */
@RestController
@RequestMapping("/api/customer")
class ShareController {

	private final ShareService shareService;
	private final ShareableFilesService shareableFilesService;

	ShareController(ShareService shareService, ShareableFilesService shareableFilesService) {
		this.shareService = shareService;
		this.shareableFilesService = shareableFilesService;
	}

	@GetMapping("/files/shareable")
	List<ShareableFilesService.ShareableFile> shareableFiles(JwtAuthenticationToken authentication) {
		return shareableFilesService.listOwnedFiles(userId(authentication));
	}

	@PutMapping("/files/visibility")
	VisibilityResponse setVisibility(@RequestBody VisibilityRequest request, JwtAuthenticationToken authentication) {
		if (request == null || request.fileId() == null || request.fileId().isBlank()) {
			throw new IllegalArgumentException("A file id is required.");
		}
		shareableFilesService.setShareable(userId(authentication), request.fileId(), request.shareable());
		return new VisibilityResponse(request.fileId(), request.shareable());
	}

	@GetMapping("/shares")
	List<ShareService.ShareView> listShares(JwtAuthenticationToken authentication) {
		return shareService.listOwnerShares(userId(authentication));
	}

	@PostMapping("/shares")
	ResponseEntity<ShareService.CreatedShare> createShare(@RequestBody(required = false) CreateShareRequest request,
			JwtAuthenticationToken authentication) {
		var allowDownload = request == null || request.allowDownload() == null || request.allowDownload();
		var label = request == null ? null : request.recipientLabel();
		var created = shareService.createShare(userId(authentication), allowDownload, label);
		return ResponseEntity.status(HttpStatus.CREATED).body(created);
	}

	@GetMapping("/shares/{shareId}")
	ShareService.ShareView getShare(@PathVariable String shareId, JwtAuthenticationToken authentication) {
		return shareService.getOwnerShare(userId(authentication), shareId);
	}

	@PostMapping("/shares/{shareId}/revoke")
	ShareService.ShareView revokeShare(@PathVariable String shareId, JwtAuthenticationToken authentication) {
		shareService.revoke(userId(authentication), shareId);
		return shareService.getOwnerShare(userId(authentication), shareId);
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
		return ResponseEntity.badRequest().body(new ApiError(exception.getMessage()));
	}

	private static String userId(JwtAuthenticationToken authentication) {
		return authentication.getToken().getSubject();
	}

	record CreateShareRequest(Boolean allowDownload, String recipientLabel) {
	}

	record VisibilityRequest(String fileId, boolean shareable) {
	}

	record VisibilityResponse(String fileId, boolean shareable) {
	}

	record ApiError(String message) {
	}
}
