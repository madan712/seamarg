package com.seamarg.backend.profile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

class ProfileServiceTests {

	private final ProfileService service = new ProfileService(new InMemoryProfileRepository(),
		new ObjectMapper().findAndRegisterModules());

	@Test
	void savesAndReadsBackMainInformationForTheSameUser() {
		var data = new LinkedHashMap<String, Object>();
		data.put("firstName", "Madan");
		data.put("lastName", "Chaudhary");
		data.put("dateOfBirth", "1986-09-15");
		data.put("offshore", true);
		data.put("minSalaryUsd", "4500");

		service.saveSection("user-1", ProfileSection.MAIN, data);

		var profile = service.getProfile("user-1");
		assertTrue(profile.containsKey("main"));

		@SuppressWarnings("unchecked")
		var main = (Map<String, Object>) profile.get("main");
		assertEquals("Madan", main.get("firstName"));
		assertEquals("Chaudhary", main.get("lastName"));
		assertEquals("1986-09-15", main.get("dateOfBirth"));
		assertEquals(Boolean.TRUE, main.get("offshore"));
	}

	@Test
	void rejectsMainInformationMissingRequiredFields() {
		var data = new LinkedHashMap<String, Object>();
		data.put("firstName", "Madan");
		data.put("lastName", "Chaudhary");
		// dateOfBirth missing

		var exception = assertThrows(IllegalArgumentException.class,
			() -> service.saveSection("user-1", ProfileSection.MAIN, data));
		assertTrue(exception.getMessage().contains("Date of Birth"));
	}

	@Test
	void doesNotLeakSectionsAcrossUsers() {
		var data = new LinkedHashMap<String, Object>();
		data.put("firstName", "Madan");
		data.put("lastName", "Chaudhary");
		data.put("dateOfBirth", "1986-09-15");
		service.saveSection("user-1", ProfileSection.MAIN, data);

		assertTrue(service.getProfile("user-2").isEmpty());
	}

	@Test
	void storesSectionsWithoutRequiredFieldsAndPreservesArrays() {
		var visas = new LinkedHashMap<String, Object>();
		visas.put("usa", true);
		visas.put("other", List.of("Panama", "Singapore"));

		service.saveSection("user-3", ProfileSection.VISAS, visas);

		@SuppressWarnings("unchecked")
		var stored = (Map<String, Object>) service.getProfile("user-3").get("visas");
		assertEquals(Boolean.TRUE, stored.get("usa"));
		assertEquals(List.of("Panama", "Singapore"), stored.get("other"));
		assertFalse(service.getProfile("user-3").containsKey("main"));
	}
}
