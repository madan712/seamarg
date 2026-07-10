package com.seamarg.backend.course;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

class CourseServiceTests {

	private CourseService service;

	@BeforeEach
	void setUp() {
		service = new CourseService(new InMemoryCourseRepository(), new ObjectMapper().findAndRegisterModules());
		service.saveCourseType("gp-rating", Map.of("name", "GP Rating", "category", "PRE_SEA"));
		service.saveInstitute("acme", Map.of("name", "Acme Maritime", "state", "Goa", "city", "Vasco"));
		service.saveOffering("acme", "gp-rating", Map.of());
	}

	@Test
	void listsActiveCourseTypesAndGroupsCatalog() {
		assertThat(service.listCourseTypes(false)).extracting(v -> v.get("slug")).contains("gp-rating");
		var catalog = service.catalogGroupedByCategory();
		assertThat(catalog).containsKey("categories");
	}

	@Test
	void instituteDetailIncludesOfferingsAndBatches() {
		service.saveBatch("acme", "gp-rating", null,
			Map.of("typeSlug", "gp-rating", "startDate", "2026-08-01", "totalSeats", 20));
		var detail = service.getInstitute("acme", false).orElseThrow();
		assertThat(detail.get("name")).isEqualTo("Acme Maritime");
		assertThat((List<?>) detail.get("offerings")).hasSize(1);
		assertThat((List<?>) detail.get("batches")).hasSize(1);
	}

	@Test
	void searchFiltersByCourseAndDateRange() {
		service.saveBatch("acme", "gp-rating", "b-aug",
			Map.of("typeSlug", "gp-rating", "startDate", "2026-08-01", "totalSeats", 20));
		service.saveBatch("acme", "gp-rating", "b-oct",
			Map.of("typeSlug", "gp-rating", "startDate", "2026-10-01", "totalSeats", 20));

		var augustOnly = service.searchBatches("gp-rating", "2026-07-15", "2026-09-01", null, true);
		assertThat(augustOnly).extracting(b -> b.get("batchId")).containsExactly("b-aug");

		var all = service.searchBatches("gp-rating", null, null, null, true);
		assertThat(all).hasSize(2);
	}

	@Test
	void pastAndClosedBatchesAreNotBookable() {
		service.saveBatch("acme", "gp-rating", "past",
			Map.of("typeSlug", "gp-rating", "startDate", LocalDate.now().minusDays(1).toString(), "totalSeats", 5));
		service.saveBatch("acme", "gp-rating", "closed",
			Map.of("typeSlug", "gp-rating", "startDate", "2026-12-01", "totalSeats", 5, "status", "CLOSED"));

		assertThat(service.searchBatches("gp-rating", null, null, null, true)).isEmpty();
		assertThat(service.searchBatches("gp-rating", null, null, null, false)).hasSize(2);
	}

	@Test
	void savingBatchRejectsMissingRequiredFields() {
		assertThatThrownBy(() -> service.saveBatch("acme", "gp-rating", null,
			Map.of("typeSlug", "gp-rating", "totalSeats", 10)))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("start date");
	}

	@Test
	void savingBatchForUnknownInstituteFails() {
		assertThatThrownBy(() -> service.saveBatch("ghost", "gp-rating", null,
			Map.of("typeSlug", "gp-rating", "startDate", "2026-08-01", "totalSeats", 10)))
			.isInstanceOf(IllegalArgumentException.class)
			.hasMessageContaining("Unknown institute");
	}
}
