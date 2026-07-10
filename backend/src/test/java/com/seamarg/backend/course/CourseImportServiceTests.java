package com.seamarg.backend.course;

import static org.assertj.core.api.Assertions.assertThat;

import com.fasterxml.jackson.databind.ObjectMapper;

import org.junit.jupiter.api.Test;

class CourseImportServiceTests {

	@Test
	void seedsCatalogInstitutesOfferingsAndDemoBatches() {
		var repository = new InMemoryCourseRepository();
		var objectMapper = new ObjectMapper().findAndRegisterModules();
		var courseService = new CourseService(repository, objectMapper);
		var importService = new CourseImportService(courseService, objectMapper);

		var summary = importService.importSeed(true);

		assertThat(summary.courseTypes()).isGreaterThan(20);
		assertThat(summary.institutes()).isGreaterThan(200);
		assertThat(summary.activeInstitutes()).isGreaterThan(100);
		assertThat(summary.offerings()).isGreaterThan(0);
		assertThat(summary.batches()).isGreaterThan(0);

		// GP Rating is offered by several institutes in the sheet; demo batches are bookable.
		var bookable = courseService.searchBatches("gp-rating", null, null, null, true);
		assertThat(bookable).isNotEmpty();

		// Re-running is idempotent — institute count is stable.
		var second = importService.importSeed(true);
		assertThat(second.institutes()).isEqualTo(summary.institutes());
		assertThat(courseService.listInstitutes(null, null, null, true)).hasSize(summary.institutes());
	}
}
