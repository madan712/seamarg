package com.seamarg.backend.course;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;
import org.springframework.util.StringUtils;

import java.io.IOException;
import java.io.InputStream;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * One-time, idempotent seed loader (docs/courses-design.md §7). Reads the
 * checked-in {@code seed/institutes.json} (derived from the DGS spreadsheet)
 * and {@code seed/course-types.json} (curated canonical taxonomy), upserts the
 * catalog, keyword-maps each institute's free-text course list into offerings,
 * and seeds demo batches so search/enroll are demoable immediately. Re-running
 * is safe: every write is keyed and deterministic.
 */
@Service
class CourseImportService {

	/** Demo batches for each offering of an active institute (future dates, dummy seats). */
	private static final List<DemoBatch> DEMO_BATCHES = List.of(
		new DemoBatch("2026-08-01", 15),
		new DemoBatch("2026-09-01", 20));

	private final CourseService courseService;
	private final ObjectMapper objectMapper;

	CourseImportService(CourseService courseService, ObjectMapper objectMapper) {
		this.courseService = courseService;
		this.objectMapper = objectMapper;
	}

	ImportSummary importSeed(boolean seedBatches) {
		var courseTypeSeeds = readList("seed/course-types.json");
		var institutes = readList("seed/institutes.json");

		var courseTypeCount = 0;
		for (var seed : courseTypeSeeds) {
			courseService.saveCourseType(string(seed, "slug"), seed);
			courseTypeCount++;
		}

		var instituteCount = 0;
		var activeCount = 0;
		var offeringCount = 0;
		var batchCount = 0;

		for (var row : institutes) {
			var name = string(row, "name");
			if (!StringUtils.hasText(name)) {
				continue;
			}
			var dgsCode = string(row, "dgsCode");
			var status = string(row, "approvalStatus");
			var active = "approved".equalsIgnoreCase(status);
			var id = instituteId(name, dgsCode);

			var fields = new LinkedHashMap<String, Object>();
			fields.put("id", id);
			fields.put("name", name);
			fields.put("dgsCode", dgsCode);
			fields.put("approvalStatus", status);
			fields.put("city", string(row, "city"));
			fields.put("state", string(row, "state"));
			fields.put("website", "not found".equalsIgnoreCase(string(row, "website")) ? "" : string(row, "website"));
			fields.put("notes", string(row, "notes"));
			fields.put("active", active);
			courseService.saveInstitute(id, fields);
			instituteCount++;
			if (active) {
				activeCount++;
			}

			var coursesText = string(row, "coursesText").toLowerCase(Locale.ROOT);
			if (coursesText.isBlank() || coursesText.equals("not found")) {
				continue;
			}
			for (var seed : courseTypeSeeds) {
				if (!matches(coursesText, seed)) {
					continue;
				}
				var typeSlug = string(seed, "slug");
				courseService.saveOffering(id, typeSlug, Map.of());
				offeringCount++;

				if (seedBatches && active) {
					var index = 1;
					for (var demo : DEMO_BATCHES) {
						var batchId = id + "~" + typeSlug + "~b" + index;
						courseService.saveBatch(id, typeSlug, batchId, Map.of(
							"typeSlug", typeSlug,
							"startDate", demo.startDate(),
							"totalSeats", demo.seats(),
							"status", "OPEN",
							"mode", "ONSITE"));
						batchCount++;
						index++;
					}
				}
			}
		}

		return new ImportSummary(courseTypeCount, instituteCount, activeCount, offeringCount, batchCount);
	}

	private static boolean matches(String coursesTextLower, Map<String, Object> seed) {
		var keywords = seed.get("keywords");
		if (!(keywords instanceof List<?> list)) {
			return false;
		}
		for (var keyword : list) {
			if (keyword != null && coursesTextLower.contains(String.valueOf(keyword).toLowerCase(Locale.ROOT))) {
				return true;
			}
		}
		return false;
	}

	private static String instituteId(String name, String dgsCode) {
		var base = CourseKeys.slugify(name);
		if (StringUtils.hasText(dgsCode)) {
			return base + "-" + CourseKeys.slugify(dgsCode);
		}
		return base;
	}

	private List<Map<String, Object>> readList(String resourcePath) {
		try (InputStream stream = new ClassPathResource(resourcePath).getInputStream()) {
			return objectMapper.readValue(stream, new TypeReference<List<Map<String, Object>>>() {
			});
		} catch (IOException exception) {
			throw new IllegalStateException("Could not read seed resource: " + resourcePath, exception);
		}
	}

	private static String string(Map<String, Object> row, String key) {
		var value = row.get(key);
		return value == null ? "" : String.valueOf(value);
	}

	private record DemoBatch(String startDate, int seats) {
	}

	record ImportSummary(int courseTypes, int institutes, int activeInstitutes, int offerings, int batches) {
	}
}
