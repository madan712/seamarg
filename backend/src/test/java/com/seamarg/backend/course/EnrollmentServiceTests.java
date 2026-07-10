package com.seamarg.backend.course;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class EnrollmentServiceTests {

	private CourseService courseService;
	private EnrollmentService enrollmentService;

	@BeforeEach
	void setUp() {
		var repository = new InMemoryCourseRepository();
		var objectMapper = new ObjectMapper().findAndRegisterModules();
		courseService = new CourseService(repository, objectMapper);
		enrollmentService = new EnrollmentService(repository, courseService, objectMapper);

		courseService.saveCourseType("gp-rating", Map.of("name", "GP Rating", "category", "PRE_SEA"));
		courseService.saveInstitute("acme", Map.of("name", "Acme Maritime", "state", "Goa"));
		courseService.saveOffering("acme", "gp-rating", Map.of());
		courseService.saveBatch("acme", "gp-rating", "b1",
			Map.of("typeSlug", "gp-rating", "startDate", "2026-08-01", "totalSeats", 1));
	}

	@Test
	void requestCreatesPendingAndBlocksDuplicates() {
		var enrollment = enrollmentService.request("user-1", "acme", "gp-rating", "b1");
		assertThat(enrollment.get("status")).isEqualTo("PENDING");
		assertThat(enrollment.get("courseName")).isEqualTo("GP Rating");

		assertThatThrownBy(() -> enrollmentService.request("user-1", "acme", "gp-rating", "b1"))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("already have an active enrollment");
	}

	@Test
	void approveConsumesSeatAndRespectsCapacity() {
		enrollmentService.request("user-1", "acme", "gp-rating", "b1");
		enrollmentService.request("user-2", "acme", "gp-rating", "b1");

		var confirmed = enrollmentService.approve("user-1", "b1", "welcome");
		assertThat(confirmed.get("status")).isEqualTo("CONFIRMED");

		// Only one seat existed — the second approval must be refused.
		assertThatThrownBy(() -> enrollmentService.approve("user-2", "b1", null))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("full");

		var batch = courseService.locateBatch("acme", "gp-rating", "b1").orElseThrow();
		assertThat(batch.confirmedSeats()).isEqualTo(1);
		assertThat(batch.availableSeats()).isEqualTo(0);
	}

	@Test
	void cancellingConfirmedEnrollmentReleasesSeat() {
		enrollmentService.request("user-1", "acme", "gp-rating", "b1");
		enrollmentService.approve("user-1", "b1", null);
		assertThat(courseService.locateBatch("acme", "gp-rating", "b1").orElseThrow().confirmedSeats()).isEqualTo(1);

		var cancelled = enrollmentService.cancel("user-1", "b1");
		assertThat(cancelled.get("status")).isEqualTo("CANCELLED");
		assertThat(courseService.locateBatch("acme", "gp-rating", "b1").orElseThrow().confirmedSeats()).isEqualTo(0);
	}

	@Test
	void listsForUserAndForBatch() {
		enrollmentService.request("user-1", "acme", "gp-rating", "b1");
		enrollmentService.request("user-2", "acme", "gp-rating", "b1");

		assertThat(enrollmentService.listForUser("user-1")).hasSize(1);
		assertThat(enrollmentService.listForBatch("b1")).hasSize(2);
	}

	@Test
	void listsAllEnrollmentsAcrossUsersWithStatusFilter() {
		enrollmentService.request("user-1", "acme", "gp-rating", "b1");
		courseService.saveBatch("acme", "gp-rating", "b2",
			Map.of("typeSlug", "gp-rating", "startDate", "2026-09-01", "totalSeats", 5));
		enrollmentService.request("user-2", "acme", "gp-rating", "b2");
		enrollmentService.approve("user-2", "b2", null);

		assertThat(enrollmentService.listAll(null)).hasSize(2);
		assertThat(enrollmentService.listAll("PENDING"))
			.singleElement()
			.satisfies(e -> assertThat(e.get("sub")).isEqualTo("user-1"));
		assertThat(enrollmentService.listAll("CONFIRMED"))
			.singleElement()
			.satisfies(e -> assertThat(e.get("sub")).isEqualTo("user-2"));

		var counts = enrollmentService.statusCounts();
		assertThat(counts.get("pending")).isEqualTo(1L);
		assertThat(counts.get("confirmed")).isEqualTo(1L);
		assertThat(counts.get("total")).isEqualTo(2L);
	}

	@Test
	void requestRejectedForUnknownBatch() {
		assertThatThrownBy(() -> enrollmentService.request("user-1", "acme", "gp-rating", "missing"))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("Batch not found");
	}
}
