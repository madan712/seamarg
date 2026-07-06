package com.seamarg.backend.admin;

import com.seamarg.backend.certificate.CertificateAdminService;
import com.seamarg.backend.certificate.CertificateAdminService.AdminFile;
import com.seamarg.backend.profile.ProfileAdminService;
import com.seamarg.backend.profile.ProfileAdminService.AdminProfileView;

import lombok.extern.slf4j.Slf4j;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import software.amazon.awssdk.core.exception.SdkException;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;

/**
 * Read-only admin dashboard API. Every route here sits under {@code /api/admin}
 * and is gated by the shared admin-password filter, so no per-method security
 * annotations are needed. Data is aggregated from the profile and certificate
 * stores; there is no separate user directory.
 */
@Slf4j
@RestController
@RequestMapping("/api/admin")
public class AdminDashboardController {

	private static final Duration ACTIVE_WINDOW = Duration.ofDays(7);

	private final ProfileAdminService profileAdminService;
	private final CertificateAdminService certificateAdminService;

	public AdminDashboardController(ProfileAdminService profileAdminService,
			CertificateAdminService certificateAdminService) {
		this.profileAdminService = profileAdminService;
		this.certificateAdminService = certificateAdminService;
	}

	@GetMapping("/users")
	public UsersPayload users() {
		var profiles = profileAdminService.listAll();
		var filesByUser = certificateAdminService.allFilesByUser();

		var profilesByUser = new LinkedHashMap<String, AdminProfileView>();
		for (var profile : profiles) {
			profilesByUser.put(profile.userId(), profile);
		}

		// The registered-user set is the union of everyone with a profile or a file.
		var userIds = new LinkedHashSet<String>();
		userIds.addAll(profilesByUser.keySet());
		userIds.addAll(filesByUser.keySet());

		var now = Instant.now();
		var activeSince = now.minus(ACTIVE_WINDOW);

		var summaries = new ArrayList<UserSummary>();
		int totalFiles = 0;
		int activeUsers = 0;
		int newFiles = 0;
		long totalStorage = 0L;

		for (var userId : userIds) {
			var profile = profilesByUser.get(userId);
			var files = filesByUser.getOrDefault(userId, List.of());

			var sections = profile == null ? Map.<String, Map<String, Object>>of() : profile.sections();
			var firstSeen = firstSeen(profile, files);
			var lastActivity = lastActivity(profile, files);
			var storageBytes = files.stream().mapToLong(AdminFile::sizeBytes).sum();

			totalFiles += files.size();
			totalStorage += storageBytes;
			if (lastActivity != null && lastActivity.isAfter(activeSince)) {
				activeUsers++;
			}
			for (var file : files) {
				if (file.uploadedAt() != null && file.uploadedAt().isAfter(activeSince)) {
					newFiles++;
				}
			}

			summaries.add(new UserSummary(
				userId,
				fullName(sections),
				sectionField(sections, "contact", "email"),
				sectionField(sections, "main", "position"),
				sectionField(sections, "main", "citizenship"),
				sections.size(),
				files.size(),
				storageBytes,
				firstSeen,
				lastActivity));
		}

		summaries.sort(Comparator.comparing(UserSummary::lastActivity,
			Comparator.nullsLast(Comparator.naturalOrder())).reversed());

		var stats = new Stats(summaries.size(), totalFiles, totalStorage, activeUsers, newFiles);
		log.info("Admin dashboard listing {} users, {} files", summaries.size(), totalFiles);
		return new UsersPayload(now, stats, summaries);
	}

	@GetMapping("/users/{userId}")
	public UserDetail user(@PathVariable String userId) {
		var profile = profileAdminService.getForUser(userId);
		var files = certificateAdminService.filesForUser(userId);
		var sections = profile.sections();

		var fileSummaries = files.stream().map(FileSummary::from).toList();

		return new UserDetail(
			userId,
			fullName(sections),
			sectionField(sections, "contact", "email"),
			firstSeen(profile, files),
			lastActivity(profile, files),
			sections,
			fileSummaries);
	}

	@GetMapping("/users/{userId}/files/{certificateId}/link")
	public ResponseEntity<FileLink> fileLink(@PathVariable String userId, @PathVariable String certificateId,
			@RequestParam(defaultValue = "view") String mode) {
		var asAttachment = "download".equalsIgnoreCase(mode);
		return certificateAdminService.createDownloadUrl(userId, certificateId, asAttachment)
			.map(url -> ResponseEntity.ok(new FileLink(url.toString(), asAttachment ? "download" : "view")))
			.orElseGet(() -> ResponseEntity.status(HttpStatus.NOT_FOUND).build());
	}

	@ExceptionHandler(IllegalArgumentException.class)
	ResponseEntity<ApiError> badRequest(IllegalArgumentException exception) {
		return ResponseEntity.badRequest().body(new ApiError(exception.getMessage()));
	}

	@ExceptionHandler(SdkException.class)
	ResponseEntity<ApiError> awsFailure(SdkException exception) {
		log.warn("Admin dashboard data request failed", exception);
		return ResponseEntity.status(HttpStatus.SERVICE_UNAVAILABLE)
			.body(new ApiError("Data store request failed. Check backend AWS credentials and DynamoDB/S3 permissions."));
	}

	private static String fullName(Map<String, Map<String, Object>> sections) {
		var first = sectionField(sections, "main", "firstName");
		var last = sectionField(sections, "main", "lastName");
		var full = (first + " " + last).trim();
		return full.isBlank() ? null : full;
	}

	private static String sectionField(Map<String, Map<String, Object>> sections, String section, String field) {
		var values = sections.get(section);
		if (values == null) {
			return null;
		}
		var value = values.get(field);
		return value instanceof String text && !text.isBlank() ? text : null;
	}

	private static Instant firstSeen(AdminProfileView profile, List<AdminFile> files) {
		Instant earliest = profile == null ? null : profile.lastUpdated();
		for (var file : files) {
			earliest = earlier(earliest, file.uploadedAt());
		}
		return earliest;
	}

	private static Instant lastActivity(AdminProfileView profile, List<AdminFile> files) {
		Instant latest = profile == null ? null : profile.lastUpdated();
		for (var file : files) {
			latest = later(latest, file.updatedAt());
			latest = later(latest, file.uploadedAt());
		}
		return latest;
	}

	private static Instant earlier(Instant current, Instant candidate) {
		if (candidate == null) {
			return current;
		}
		return current == null || candidate.isBefore(current) ? candidate : current;
	}

	private static Instant later(Instant current, Instant candidate) {
		if (candidate == null) {
			return current;
		}
		return current == null || candidate.isAfter(current) ? candidate : current;
	}

	public record UsersPayload(Instant generatedAt, Stats stats, List<UserSummary> users) {
	}

	public record Stats(int totalUsers, int totalFiles, long totalStorageBytes, int activeLast7Days,
			int newFilesLast7Days) {
	}

	public record UserSummary(String userId, String name, String email, String position, String citizenship,
			int profileSections, int fileCount, long storageBytes, Instant firstSeen, Instant lastActivity) {
	}

	public record UserDetail(String userId, String name, String email, Instant firstSeen, Instant lastActivity,
			Map<String, Map<String, Object>> profile, List<FileSummary> files) {
	}

	public record FileSummary(String certificateId, String originalFilename, String contentType, long sizeBytes,
			Instant uploadedAt, Instant updatedAt, String processingStatus, String documentName,
			String documentCategory, String rank, LocalDate expiryDate, String issuer, String certificateNumber,
			Double confidence, String extractionSource, String extractionNotes) {

		static FileSummary from(AdminFile file) {
			return new FileSummary(
				file.fileId(),
				file.originalFilename(),
				file.contentType(),
				file.sizeBytes(),
				file.uploadedAt(),
				file.updatedAt(),
				file.processingStatus(),
				file.documentName(),
				file.category(),
				file.rank(),
				file.expiryDate(),
				file.issuer(),
				file.certificateNumber(),
				file.confidence(),
				file.extractionSource(),
				file.extractionNotes());
		}
	}

	public record FileLink(String url, String mode) {
	}

	public record ApiError(String message) {
	}
}
