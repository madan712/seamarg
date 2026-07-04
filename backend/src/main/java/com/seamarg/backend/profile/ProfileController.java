package com.seamarg.backend.profile;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import software.amazon.awssdk.core.exception.SdkException;

import java.util.Map;

@Slf4j
@RestController
@RequestMapping("/api/customer/profile")
class ProfileController {

	private final ProfileService profileService;

	ProfileController(ProfileService profileService) {
		this.profileService = profileService;
	}

	@GetMapping
	Map<String, Object> get(JwtAuthenticationToken authentication) {
		return profileService.getProfile(userId(authentication));
	}

	@PutMapping("/{section}")
	Map<String, Object> save(@PathVariable String section, @RequestBody(required = false) Map<String, Object> body,
			JwtAuthenticationToken authentication) {
		var profileSection = ProfileSection.fromSlug(section)
			.orElseThrow(() -> new IllegalArgumentException("Unknown profile section: " + section));
		return profileService.saveSection(userId(authentication), profileSection, body);
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
		return ResponseEntity.badRequest().body(new ApiError(exception.getMessage()));
	}

	@ExceptionHandler(SdkException.class)
	ResponseEntity<ApiError> awsStorageFailure(SdkException exception) {
		log.warn("Profile storage request failed", exception);
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(new ApiError(
				"Profile storage request failed. Check backend AWS credentials and DynamoDB permissions."));
	}

	private static String userId(JwtAuthenticationToken authentication) {
		return authentication.getToken().getSubject();
	}

	record ApiError(String message) {
	}
}
